import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessageBubbleProps } from "./model";
import styles from "./message-bubble.component.module.scss";

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content } = message;

  return (
    <div
      className={`${styles["message-bubble-component"]} ${styles[`message-bubble-component--${role}`]}`}
      data-testid={`message-bubble-${role}`}
    >
      <div className={styles["message-bubble-component__content"]}>
        {role === "agent" ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
