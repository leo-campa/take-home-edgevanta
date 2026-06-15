export type Message = {
  id: string;
  role: "user" | "agent" | "system";
  type: "error" | "message";
  content: string;
  timestamp: number;
};

export type SseEvent =
  | { type: "token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "no_data"; message: string };

export type ChatState = {
  messages: Message[];
  isStreaming: boolean;
  retryLast: (() => void) | null;
};
