// convex/actions.ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { ChatAnthropic } from "@langchain/anthropic";

export const generateChatTitle = action({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    // Get messages for this chat
    const messages = await ctx.runQuery(internal.messages.getMessagesInternal, {
      chatId: args.chatId,
    });

    if (messages.length === 0) {
      await ctx.runMutation(api.chats.updateChatTitle, {
        chatId: args.chatId,
        title: "New Chat",
      });
      return "New Chat";
    }

    try {
      // Take first 4-6 messages for context
      const contextMessages = messages
        .slice(0, 6)
        .map((m: any) => `${m.role}: ${m.content.slice(0, 200)}`)
        .join("\n\n");

      const model = new ChatAnthropic({
        modelName: "claude-3-5-sonnet-20241022",
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        temperature: 0.3,
        maxTokens: 50,
        streaming: false,
      });

      const prompt = `Based on this conversation, generate a short, descriptive title in 1-5 words.
Be specific and capture the main topic or request.
Do not use quotes or punctuation in the title.
Only respond with the title, nothing else.

Conversation:
${contextMessages}

Title:`;

      const response = await model.invoke(prompt);
      const title = response.content
        .toString()
        .trim()
        .replace(/['"]/g, "")
        .slice(0, 50);

      // Save the generated title
      await ctx.runMutation(api.chats.updateChatTitle, {
        chatId: args.chatId,
        title,
      });

      return title;
    } catch (error) {
      console.error("Error generating chat title:", error);
      const fallbackTitle = "New Chat";
      await ctx.runMutation(api.chats.updateChatTitle, {
        chatId: args.chatId,
        title: fallbackTitle,
      });
      return fallbackTitle;
    }
  },
});
