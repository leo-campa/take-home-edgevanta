import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import cx from "classnames";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessageBubbleProps } from "./model";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageBubble({
  message,
  onRetry,
}: MessageBubbleProps) {
  const { role, type, content, timestamp } = message;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

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

  const retryBtn = type === "error" && onRetry && (
    <Button
      className="message-bubble-component__retry-btn"
      onClick={onRetry}
      variant="text"
      sx={{
        fontSize: "0.7rem",
        minWidth: "auto",
        padding: "0 4px 4px",
        lineHeight: 1,
      }}
    >
      Retry
    </Button>
  );

  const copyBtn = role === "agent" && (
    <IconButton
      className="message-bubble-component__copy-btn"
      onClick={handleCopy}
      size="small"
      aria-label="Copy message"
    >
      {copied ? (
        <CheckIcon fontSize="inherit" />
      ) : (
        <ContentCopyIcon fontSize="inherit" />
      )}
    </IconButton>
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
          <div className="message-bubble-component__footer">
            {time}
            <div className="message-bubble-component__footer-actions">
              {retryBtn}
              {copyBtn}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
