import type { Message } from "@/hooks/useChat/model";

export type MessageBubbleProps = {
  message: Message;
  onRetry?: () => void;
};
