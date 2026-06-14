import { render, screen } from "@testing-library/react";
import type { Message } from "@/hooks/useChat/model";
import MessageList from "./index";

const scrollIntoViewMock = jest.fn();
window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

function makeMessage(
  id: string,
  content: string,
  role: Message["role"] = "user",
): Message {
  return { id, role, type: "message", content, timestamp: Date.now() };
}

describe("MessageList", () => {
  beforeEach(() => scrollIntoViewMock.mockClear());

  it("renders all messages", () => {
    const messages = [
      makeMessage("1", "Hello", "user"),
      makeMessage("2", "Hi there!", "agent"),
    ];
    render(<MessageList messages={messages} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
  });

  it("calls scrollIntoView when messages are added", () => {
    const { rerender } = render(
      <MessageList messages={[makeMessage("1", "first")]} />,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    rerender(
      <MessageList
        messages={[makeMessage("1", "first"), makeMessage("2", "second")]}
      />,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
  });

  it("keeps older messages in DOM when list grows", () => {
    const { rerender } = render(
      <MessageList messages={[makeMessage("1", "message one")]} />,
    );
    rerender(
      <MessageList
        messages={[
          makeMessage("1", "message one"),
          makeMessage("2", "message two"),
        ]}
      />,
    );
    expect(screen.getByText("message one")).toBeInTheDocument();
    expect(screen.getByText("message two")).toBeInTheDocument();
  });
});
