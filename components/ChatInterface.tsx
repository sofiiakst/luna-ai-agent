"use client";

import { Doc, Id } from "@/convex/_generated/dataModel";
import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { ChatRequestBody, StreamMessageType } from "@/lib/types";
import { createSSEParser } from "@/lib/createSSEParser";
import { api, internal } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import MessageBubble from "./MessageBubble";
import WelcomeMessage from "./WelcomeMessage";
import { useAction, useQuery } from "convex/react";

interface ChatInterfaceProps {
  chatId: Id<"chats">;
  initialMessages: Doc<"messages">[];
}
function ChatInterface({ chatId, initialMessages }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Doc<"messages">[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDeepResearchMode, setIsDeepResearchMode] = useState(false);

  const [streamedResponse, setStreamedResponse] = useState<string>("");

  const [currentTool, setCurrentTool] = useState<{
    name: string;
    input: unknown;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const generateTitle = useAction(api.actions.generateChatTitle);

  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  const processStream = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onChunk: (chunk: string) => Promise<void>
  ) => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await onChunk(new TextDecoder().decode(value));
      }
    } finally {
      reader.releaseLock();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamedResponse]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;
    setInput("");
    setStreamedResponse("");
    setCurrentTool(null);
    setIsLoading(true);
    const optimisticUserMessage: Doc<"messages"> = {
      _id: `temp_${Date.now()}`,
      chatId,
      content: trimmedInput,
      role: "user",
      createdAt: Date.now(),
    } as Doc<"messages">;
    setMessages((prev) => [...prev, optimisticUserMessage]);
    let fullResponse = "";
    try {
      const requestBody: ChatRequestBody = {
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        newMessage: trimmedInput,
        chatId,
        mode: isDeepResearchMode ? "deep_research" : "simple",
      };
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error(await response.text());
      if (!response.body) throw new Error("no response body");

      //stream handling
      const parser = createSSEParser();
      const reader = response.body.getReader();
      await processStream(reader, async (chunk) => {
        const messages = parser.parse(chunk);

        for (const message of messages) {
          switch (message.type) {
            case StreamMessageType.Token:
              if ("token" in message && message.token.trim() !== "") {
                fullResponse += message.token;
                setStreamedResponse(fullResponse);
              }
              break;
            case StreamMessageType.ToolStart:
              if ("tool" in message) {
                setCurrentTool({ name: message.tool, input: message.input });
              }
              break;
            case StreamMessageType.ToolEnd:
              if ("tool" in message && currentTool) {
                setCurrentTool(null);
              }
              break;
            case StreamMessageType.Error:
              if ("error" in message) {
                throw new Error(message.error);
              }
              break;
            case StreamMessageType.Done:
              const assistantMessage: Doc<"messages"> = {
                _id: `temp_assistant_${Date.now()}`,
                chatId,
                content: fullResponse,
                role: "assistant",
                createdAt: Date.now(),
              } as Doc<"messages">;

              // Save the complete message to the database
              const convex = getConvexClient();
              await convex.mutation(api.messages.store, {
                chatId,
                content: fullResponse,
                role: "assistant",
              });
              const latestTitle = await convex.query(api.chats.getChatTitle, {
                chatId,
              });

              if (latestTitle === "New Chat" || latestTitle === "new chat") {
                console.log("🎯 Triggering title generation for:", chatId);
                await generateTitle({ chatId });
              } else {
                console.log("✅ Chat already has a title:", latestTitle);
              }

              setMessages((prev) => [...prev, assistantMessage]);
              // setStreamedResponse("");
              return;
          }
        }
      });
    } catch (error) {
      console.error(error);
      setMessages((prev) =>
        prev.filter((msg) => msg._id !== optimisticUserMessage._id)
      );
      setStreamedResponse("error");
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <main className="flex flex-col h-[calc(100vh-theme(spacing.14))]">
      <section className="flex-1 overflow-y-auto bg-black p-2 md:p-0 ">
        <div className="max-w-4xl mx-auto p-4 space-y-3 bg-black">
          {messages.length === 0 && <WelcomeMessage />}

          {messages?.map((message: Doc<"messages">) => (
            <MessageBubble
              key={message._id}
              content={message.content}
              isUser={message.role === "user"}
            />
          ))}
          {streamedResponse &&
            !messages.some((m) => m.content === streamedResponse) && (
              <MessageBubble content={streamedResponse} />
            )}
          {isLoading && streamedResponse && (
            <div className="flex justify-start animate-in fade-in-0">
              <div className="rounded-2xl px-4 py-3 bg-white text-gray-900 rounded-bl-none shadow-sm ring-1 ring-inset ring-gray-200">
                <div className="flex items-center gap-1.5">
                  {[0.3, 0.15, 0].map((delay, i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: `-${delay}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef}></div>
        </div>
      </section>
      <footer className="border-1 rounded-md  border-red-100 bg-black p-4 ">
        <form className="max-w-4xl mx-auto relative " onSubmit={handleSubmit}>
          <div className="relative flex items-center">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextareaHeight(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
              placeholder="Message AI Agent..."
              rows={1}
              className="flex-1 py-3 px-4 rounded-2xl border border-red-100 focus:outline-none focus:ring-2focus:ring-red-100 focus:border-transparent pr-12 bg-black text-red-100
    placeholder:text-red-100 resize-none overflow-hidden min-h-[48px] max-h-[200px]"
              disabled={isLoading}
            />

            <div className="relative group w-fit mb-8">
              <Button
                type="button"
                onClick={() => setIsDeepResearchMode(!isDeepResearchMode)}
                disabled={isLoading}
                className={`absolute right-12 rounded-xl h-9 w-9 p-0 flex items-center justify-center transition-all ${
                  isDeepResearchMode
                    ? "bg-red-200 hover:bg-red-200 text-black shadow-lg shadow-red-100/50"
                    : "bg-gray-800 hover:bg-gray-700 text-red-100 border border-red-100/30"
                }`}
              >
                <Sparkles className="h-4 w-4" />
              </Button>

              {/* Tooltip text */}
              <p className="absolute -top-7 left-1/2 -translate-x-1/2 text-sm text-white bg-gray-900 px-2 py-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Deep research mode
              </p>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className={`absolute right-1.5 rounded-xl h-9 w-9 p-0 flex items-center justify-center transition-all ${
                input.trim()
                  ? "bg-red-100 hover:bg-red-100 text-black shadow-sm"
                  : "bg-red-100 text-black"
              }`}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </footer>
    </main>
  );
}

export default ChatInterface;
