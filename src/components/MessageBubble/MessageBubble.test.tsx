import { render, screen } from "@testing-library/react";
import type { Message } from "@/hooks/useChat/model";
import MessageBubble from "./index";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "1",
    role: "user",
    content: "Hello",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("MessageBubble", () => {
  it("renders user message with user role class", () => {
    render(
      <MessageBubble
        message={makeMessage({ role: "user", content: "Hi there" })}
      />,
    );
    const bubble = screen.getByTestId("message-bubble-user");
    expect(bubble).toHaveClass("message-bubble-component--user");
    expect(bubble).toHaveTextContent("Hi there");
  });

  it("renders agent message with agent role class", () => {
    render(
      <MessageBubble
        message={makeMessage({ role: "agent", content: "I can help." })}
      />,
    );
    const bubble = screen.getByTestId("message-bubble-agent");
    expect(bubble).toHaveClass("message-bubble-component--agent");
    expect(bubble).toHaveTextContent("I can help.");
  });

  it("renders system message with system role class", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "system",
          content: "Dataset replaced: test.csv — 10 items",
        })}
      />,
    );
    const bubble = screen.getByTestId("message-bubble-system");
    expect(bubble).toHaveClass("message-bubble-component--system");
    expect(bubble).toHaveTextContent("Dataset replaced");
  });
});
