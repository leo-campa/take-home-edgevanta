import { useEffect, useMemo, useRef } from "react";
import MessageBubble from "@/components/MessageBubble";
import styles from "./message-list.component.module.scss";
import type { MessageListProps } from "./model";

export default function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const cleanedMessages = useMemo(()=>messages.filter((m) => m.content !== ""),[messages] )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: "smooth" });
  }, [messages]);

  return (
    <div className={styles["message-list-component"]}>
      <div className={styles["message-list-component__scroll-container"]}>
        <div className={styles["message-list-component__messages"]}>
          {cleanedMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isStreaming && (
            <div className={styles["message-list-component__thinking"]}>
              Thinking…
            </div>
          )}
        </div>
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </div>
  );
}
