import SendIcon from "@mui/icons-material/Send";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import type { ChatInputProps } from "./model";

export default function ChatInput({
  onSend,
  isStreaming,
  disabled,
}: ChatInputProps) {
  const [value, setValue] = useState("");

  const isEmpty = value.trim() === "";
  const isDisabled = disabled || isStreaming || isEmpty;

  function handleSend() {
    if (isDisabled) return;
    const trimmed = value.trim();
    setValue("");
    onSend(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !isDisabled) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-input-component">
      <TextField
        className="chat-input-component__text-field"
        fullWidth
        multiline
        maxRows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about the bid data…"
        disabled={disabled || isStreaming}
        size="small"
        variant="outlined"
        slotProps={{ input: { "aria-label": "Message input" } }}
      />
      <IconButton
        className="chat-input-component__send-button"
        onClick={handleSend}
        disabled={isDisabled}
        aria-label="Send message"
        color="primary"
        data-testid="send-button"
      >
        {isStreaming ? (
          <CircularProgress size={20} className="chat-input-component__spinner" />
        ) : (
          <SendIcon />
        )}
      </IconButton>
    </div>
  );
}
