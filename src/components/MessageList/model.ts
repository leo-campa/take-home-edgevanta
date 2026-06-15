import type { Message } from "@/hooks/useChat/model";

export type MessageListProps = {
  messages: Message[];
  isStreaming?: boolean;
  onRetry?: () => void;
};
