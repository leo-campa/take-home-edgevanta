import { useCallback, useState } from "react";
import type { ChatState, Message, SseEvent } from "./model";

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

export function useChat(): ChatState & {
  sendQuestion: (q: string) => Promise<void>;
  addMessage: (message: Message) => void;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const sendQuestion = useCallback(
    async (question: string) => {
      if (isStreaming) return;

      const userMessage: Message = {
        id: makeId(),
        role: "user",
        content: question,
        timestamp: Date.now(),
      };

      const agentId = makeId();
      const agentMessage: Message = {
        id: agentId,
        role: "agent",
        content: "",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage, agentMessage]);
      setIsStreaming(true);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;

            const event = JSON.parse(line.slice(6)) as SseEvent;

            if (event.type === "token") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentId
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              );
            } else if (event.type === "done") {
              setIsStreaming(false);
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentId
                    ? { ...m, content: `Error: ${event.message}` }
                    : m,
                ),
              );
              setIsStreaming(false);
            } else if (event.type === "no_data") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentId
                    ? { ...m, role: "system", content: event.message }
                    : m,
                ),
              );
              setIsStreaming(false);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Connection lost";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentId
              ? {
                  ...m,
                  content: "Connection lost — please try again",
                  role: "system" as const,
                }
              : m,
          ),
        );
        console.error("useChat error:", msg);
        setIsStreaming(false);
      }
    },
    [isStreaming],
  );

  return { messages, isStreaming, sendQuestion, addMessage };
}
