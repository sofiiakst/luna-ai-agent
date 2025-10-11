import { useUser } from "@clerk/clerk-react";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { BotIcon } from "lucide-react";
import React from "react";
import MermaidChart from "./MermaidChart";

interface MessageBubbleProps {
  content: string;
  isUser?: boolean;
}

type Segment = {
  type: "text" | "code" | "mermaid" | "html";
  content: string;
  lang?: string;
};

const parseMessage = (content: string): Segment[] => {
  // 🔹 keep your cleanup
  content = content.replace(/\\\\/g, "\\");
  content = content.replace(/\\n/g, "\n");
  content = content
    .replace(/---START---\n?/g, "")
    .replace(/---END---\n?/g, "")
    .replace(/CODE START\n?/g, "")
    .replace(/CODE END\n?/g, "")
    .trim();

  // 🔹 detect code fences ```lang ... ```
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let result: Segment[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // text before the code block
    if (match.index > lastIndex) {
      result.push({
        type: "text",
        content: content.slice(lastIndex, match.index).trim(),
      });
    }

    const lang = match[1] || "plaintext";
    let type: "text" | "code" | "mermaid" | "html" = "code";

    if (lang === "mermaid") {
      type = "mermaid";
    } else if (lang === "html") {
      type = "html";
    }

    result.push({
      type,
      content: match[2].trim(),
      lang,
    });

    lastIndex = regex.lastIndex;
  }

  // text after last block
  if (lastIndex < content.length) {
    result.push({
      type: "text",
      content: content.slice(lastIndex).trim(),
    });
  }

  return result.filter((seg) => seg.content.length > 0);
};

export default function MessageBubble({ content, isUser }: MessageBubbleProps) {
  const { user } = useUser();
  const segments = parseMessage(content);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-2xl px-4 py-2.5 max-w-[85%] md:max-w-[75%] shadow-sm ring-1 ring-inset relative ${
          isUser
            ? "bg-red-100 text-black rounded-br-none ring-red-100"
            : "bg-gray-200 text-gray-900 rounded-bl-none ring-gray-200"
        }`}
      >
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed space-y-3">
          {segments.map((seg, i) => {
            if (seg.type === "mermaid") {
              return <MermaidChart key={i} code={seg.content} />;
            }

            if (seg.type === "html") {
              return (
                <iframe
                  key={i}
                  srcDoc={seg.content}
                  className="w-full h-[500px] border border-gray-300 rounded-lg bg-white"
                  sandbox="allow-scripts"
                  title={`circuit-${i}`}
                />
              );
            }

            if (seg.type === "code") {
              return (
                <pre
                  key={i}
                  className="bg-black text-purple-200 p-3 rounded-lg overflow-x-auto text-sm font-mono"
                >
                  {seg.content}
                </pre>
              );
            }

            return <p key={i}>{seg.content}</p>;
          })}
        </div>

        <div
          className={`absolute bottom-0 ${
            isUser
              ? "right-0 translate-x-1/2 translate-y-1/2"
              : "left-0 -translate-x-1/2 translate-y-1/2"
          }`}
        >
          <div
            className={`w-8 h-8 rounded-full border-2 ${
              isUser ? "bg-white border-black" : "bg-red-100 border-black"
            } flex items-center justify-center shadow-sm`}
          >
            {isUser ? (
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.imageUrl} className="rounded-full" />
                <AvatarFallback>
                  {user?.firstName?.charAt(0)} {user?.lastName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <BotIcon className="h-5 w-5 text-black" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
