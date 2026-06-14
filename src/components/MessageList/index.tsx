import { useEffect, useRef } from "react";
import MessageBubble from "@/components/MessageBubble";
import type { MessageListProps } from "./model";
import styles from "./message-list.component.module.scss";

export default function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally scroll on every message change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className={styles["message-list-component"]}>
      <div className={styles["message-list-component__scroll-container"]}>
        <div className={styles["message-list-component__messages"]}>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </div>
  );
}
