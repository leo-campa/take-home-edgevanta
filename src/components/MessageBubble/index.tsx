import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./message-bubble.component.module.scss";
import type { MessageBubbleProps } from "./model";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { role, type, content, timestamp } = message;

  const bubble = (
    <div className={styles["message-bubble-component__content"]}>
      {role === "agent" ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      ) : (
        content
      )}
    </div>
  );

  const time = role !== "system" && (
    <span className={styles["message-bubble-component__timestamp"]}>
      {formatTime(timestamp)}
    </span>
  );

  return (
    <div
      className={[
        styles["message-bubble-component"],
        styles[`message-bubble-component--${role}`],
        type === "error" ? styles["message-bubble-component--error"] : "",
      ].join(" ")}
      data-testid={`message-bubble-${role}`}
    >
      {role === "user" ? (
        <>
          {time}
          {bubble}
        </>
      ) : (
        <>
          {bubble}
          {time}
        </>
      )}
    </div>
  );
}
