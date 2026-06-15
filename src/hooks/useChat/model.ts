export type Message = {
  id: string;
  role: "user" | "agent" | "system";
  type: "error" | "message";
  content: string;
  timestamp: number;
};

export type SseTokenEvent = { type: "token"; content: string };
export type SseDoneEvent = { type: "done" };
export type SseErrorEvent = { type: "error"; message: string };
export type SseNoDataEvent = { type: "no_data"; message: string };

export type SseEvent = SseTokenEvent | SseDoneEvent | SseErrorEvent | SseNoDataEvent;

export type ChatState = {
  messages: Message[];
  isStreaming: boolean;
  retryLast: (() => void) | null;
};
