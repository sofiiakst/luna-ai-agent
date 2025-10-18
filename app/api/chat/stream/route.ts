import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { submitQuestion } from "@/lib/langgraph";
import {
  ChatRequestBody,
  SSE_DATA_PREFIX,
  SSE_LINE_DELIMITER,
  StreamMessage,
  StreamMessageType,
} from "@/lib/types";
import { auth } from "@clerk/nextjs/server";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { NextResponse } from "next/server";

function sendSSEMessage(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  data: StreamMessage
) {
  const encoder = new TextEncoder();
  return writer.write(
    encoder.encode(
      `${SSE_DATA_PREFIX}${JSON.stringify(data)}${SSE_LINE_DELIMITER}`
    )
  );
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await req.json()) as ChatRequestBody;
    const { messages, newMessage, chatId, mode = "simple" } = body;

    const convex = getConvexClient();

    // Create stream with larger queue strategy for better performance
    const stream = new TransformStream(undefined, { highWaterMark: 1024 });
    const writer = stream.writable.getWriter();
    const response = new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
    const startStream = async () => {
      try {
        await sendSSEMessage(writer, { type: StreamMessageType.Connected });
        await convex.mutation(api.messages.send, {
          chatId,
          content: newMessage,
        });

        const langChainMessages: BaseMessage[] = [
          ...messages.map((msg) => {
            return msg.role === "user"
              ? new HumanMessage(msg.content)
              : new AIMessage(msg.content);
          }),
          new HumanMessage(newMessage),
        ];

        try {
          const eventStream = await submitQuestion(
            langChainMessages,
            chatId,
            mode
          );

          let streamedContent = "";
          let hasStreamedContent = false;

          // Process the events
          for await (const event of eventStream) {
            console.log("Event:", event);

            if (event.event === "on_chat_model_stream") {
              // Always handle Claude's token streaming
              const token = event.data.chunk;
              const text = token?.content?.[0]?.text;

              if (text) {
                streamedContent += text;
                await sendSSEMessage(writer, {
                  type: StreamMessageType.Token,
                  token: text,
                });
                console.log("Streamed token:", text.substring(0, 50) + "...");
              }
            }

            // ⚠️ Skip these in simple mode
            if (mode === "simple") {
              if (
                event.event === "on_chain_stream" ||
                event.event === "on_chain_end"
              ) {
                console.log(
                  "Skipping chain events in simple mode:",
                  event.event
                );
                continue;
              }
            } else if (event.event === "on_chain_stream") {
              // Deep research mode: process LangGraph chain output
              const chunkData = event.data?.chunk;

              if (chunkData && Array.isArray(chunkData)) {
                for (const item of chunkData) {
                  if (item && item.content) {
                    let text = "";

                    if (typeof item.content === "string") {
                      text = item.content;
                    } else if (Array.isArray(item.content)) {
                      text = item.content
                        .map((block: unknown) => {
                          if (typeof block === "string") return block;
                          if (typeof block === "object" && block !== null) {
                            const obj = block as Record<string, unknown>;
                            if (typeof obj.text === "string") return obj.text;
                            if (typeof obj.content === "string")
                              return obj.content;
                          }
                          return "";
                        })
                        .join("");
                    }

                    if (text && text.trim()) {
                      hasStreamedContent = true;
                      streamedContent += text;
                      await sendSSEMessage(writer, {
                        type: StreamMessageType.Token,
                        token: text,
                      });
                      console.log(
                        "Streamed from chain_stream:",
                        text.substring(0, 100)
                      );
                    }
                  }
                }
              }
            } else if (event.event === "on_tool_start") {
              await sendSSEMessage(writer, {
                type: StreamMessageType.ToolStart,
                tool: event.name || "unknown",
                input: event.data.input,
              });
            } else if (event.event === "on_tool_end") {
              const toolMessage = new ToolMessage(event.data.output);
              await sendSSEMessage(writer, {
                type: StreamMessageType.ToolEnd,
                tool: toolMessage.lc_kwargs?.name || "unknown",
                output: event.data.output,
              });
            } else if (event.event === "on_chain_end") {
              // Only runs in deep_research mode now
              if (!hasStreamedContent && event.name === "LangGraph") {
                console.log(
                  "No content streamed yet, checking LangGraph output..."
                );
                const output = event.data?.output;

                if (output?.messages && Array.isArray(output.messages)) {
                  for (let i = output.messages.length - 1; i >= 0; i--) {
                    const msg = output.messages[i];
                    if (msg && msg.content) {
                      let finalContent = "";

                      if (typeof msg.content === "string") {
                        finalContent = msg.content;
                      } else if (Array.isArray(msg.content)) {
                        finalContent = msg.content
                          .map((block: any) => {
                            if (typeof block === "string") return block;
                            if (block?.text) return block.text;
                            if (block?.content) return block.content;
                            return "";
                          })
                          .join("");
                      }

                      if (finalContent && finalContent.trim()) {
                        console.log(
                          "Found final content, length:",
                          finalContent.length
                        );
                        await sendSSEMessage(writer, {
                          type: StreamMessageType.Token,
                          token: finalContent,
                        });
                        streamedContent = finalContent;
                        hasStreamedContent = true;
                        break;
                      }
                    }
                  }
                }
              }
            }
          }

          // Send completion message without storing the response
          await sendSSEMessage(writer, { type: StreamMessageType.Done });
        } catch (streamError) {
          console.error("Error in event stream:", streamError);
          await sendSSEMessage(writer, {
            type: StreamMessageType.Error,
            error:
              streamError instanceof Error
                ? streamError.message
                : "Stream processing failed",
          });
        }
      } catch (error) {
        console.error("Error in  stream:", error);
        await sendSSEMessage(writer, {
          type: StreamMessageType.Error,
          error: error instanceof Error ? error.message : "unknown error",
        });
      } finally {
        try {
          await writer.close();
        } catch (closeErr) {
          console.error(closeErr);
        }
      }
    };
    startStream();
    return response;
  } catch (error) {
    console.error("Error in chat API:", error);

    return NextResponse.json(
      { error: "Failed to process chat request" } as const,
      { status: 500 }
    );
  }
}
