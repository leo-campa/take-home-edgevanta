import { useEffect, useMemo, useRef } from "react";
import MessageBubble from "@/components/MessageBubble";
import type { MessageListProps } from "./model";

export default function MessageList({
  messages,
  isStreaming,
  onRetry,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const cleanedMessages = useMemo(
    () => messages.filter((m) => m.content !== ""),
    [messages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="message-list-component">
      <div className="message-list-component__scroll-container">
        <div className="message-list-component__messages">
          {cleanedMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onRetry={message.type === "error" ? onRetry : undefined}
            />
          ))}
          {isStreaming && (
            <div className="message-list-component__thinking">Thinking…</div>
          )}
        </div>
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </div>
  );
}
