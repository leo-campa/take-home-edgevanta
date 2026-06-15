import cx from "classnames";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
    <div className="message-bubble-component__content">
      {role === "agent" ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      ) : (
        content
      )}
    </div>
  );

  const time = role !== "system" && (
    <span className="message-bubble-component__timestamp">
      {formatTime(timestamp)}
    </span>
  );

  return (
    <div
      className={cx(
        "message-bubble-component",
        `message-bubble-component--${role}`,
        { "message-bubble-component--error": type === "error" },
      )}
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
