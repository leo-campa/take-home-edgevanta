import { useCallback, useState } from "react";
import type { ChatState, Message, SseEvent } from "./model";

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

function makeMessage(
  overrides: Partial<Message> & Pick<Message, "role" | "type">,
): Message {
  return {
    id: makeId(),
    content: "",
    timestamp: Date.now(),
    ...overrides,
  };
}

function parseSseEvents(parts: string[]): SseEvent[] {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.startsWith("data: "))
    .map((part) => JSON.parse(part.slice(6)) as SseEvent);
}

function handleSseEvent(
  event: SseEvent,
  agentId: string,
  updateAgent: (id: string, updates: Partial<Message>) => void,
  setIsStreaming: (v: boolean) => void,
) {
  switch (event.type) {
    case "done":
      setIsStreaming(false);
      break;
    case "error":
      updateAgent(agentId, {
        type: "error",
        content: `Error: ${event.message}`,
      });
      setIsStreaming(false);
      break;
    case "no_data":
      updateAgent(agentId, { role: "system", content: event.message });
      setIsStreaming(false);
      break;
  }
}

export function useChat(): ChatState & {
  sendQuestion: (question: string) => Promise<void>;
  addMessage: (message: Message) => void;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateAgentMessage = useCallback(
    (agentId: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === agentId ? { ...m, ...updates } : m)),
      );
    },
    [],
  );

  const appendAgentToken = useCallback((agentId: string, token: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === agentId ? { ...m, content: m.content + token } : m,
      ),
    );
  }, []);

  const sendQuestion = useCallback(
    async (question: string) => {
      if (isStreaming) return;
      setLastQuestion(question);

      const agentId = makeId();

      setMessages((prev) => [
        ...prev,
        makeMessage({ role: "user", type: "message", content: question }),
        makeMessage({ id: agentId, role: "agent", type: "message" }),
      ]);
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

          // SSE events are separated by double newlines.
          // The last element may be an incomplete event, so keep it in the buffer.
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const event of parseSseEvents(parts)) {
            if (event.type === "token") {
              appendAgentToken(agentId, event.content);
            } else {
              handleSseEvent(
                event,
                agentId,
                updateAgentMessage,
                setIsStreaming,
              );
            }
          }
        }
      } catch (err) {
        console.error(
          "useChat error:",
          err instanceof Error ? err.message : err,
        );
        updateAgentMessage(agentId, {
          type: "error",
          content: "Connection lost — please try again",
        });
        setIsStreaming(false);
      }
    },
    [isStreaming, appendAgentToken, updateAgentMessage],
  );

  const retryLast = useCallback(() => {
    if (lastQuestion) void sendQuestion(lastQuestion);
  }, [lastQuestion, sendQuestion]);

  return {
    messages,
    isStreaming,
    retryLast: lastQuestion ? retryLast : null,
    sendQuestion,
    addMessage,
  };
}
