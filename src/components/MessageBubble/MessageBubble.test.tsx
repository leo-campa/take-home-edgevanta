import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { Message } from "@/hooks/useChat/model";
import MessageBubble from "./index";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "1",
    role: "user",
    type: "message",
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

describe("MessageBubble — copy button", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows copy button on agent messages", () => {
    render(
      <MessageBubble message={makeMessage({ role: "agent", content: "Answer." })} />,
    );
    expect(screen.getByRole("button", { name: "Copy message" })).toBeInTheDocument();
  });

  it("does not show copy button on user messages", () => {
    render(
      <MessageBubble message={makeMessage({ role: "user", content: "Question?" })} />,
    );
    expect(screen.queryByRole("button", { name: "Copy message" })).not.toBeInTheDocument();
  });

  it("does not show copy button on system messages", () => {
    render(
      <MessageBubble message={makeMessage({ role: "system", content: "Uploaded." })} />,
    );
    expect(screen.queryByRole("button", { name: "Copy message" })).not.toBeInTheDocument();
  });

  it("copies message content to clipboard when clicked", async () => {
    render(
      <MessageBubble message={makeMessage({ role: "agent", content: "The answer is 42." })} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("The answer is 42.");
  });

  it("shows checkmark after copying and resets after 1.5s", async () => {
    render(
      <MessageBubble message={makeMessage({ role: "agent", content: "Done." })} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    await waitFor(() => {
      expect(screen.queryByTestId("CheckIcon")).toBeInTheDocument();
    });

    act(() => jest.advanceTimersByTime(1500));

    await waitFor(() => {
      expect(screen.queryByTestId("CheckIcon")).not.toBeInTheDocument();
    });
  });
});
