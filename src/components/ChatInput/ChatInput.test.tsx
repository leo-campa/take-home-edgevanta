import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatInput from "./index";

function renderComponent(props: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  const onSend = jest.fn();
  render(<ChatInput onSend={onSend} isStreaming={false} {...props} />);
  return { onSend };
}

describe("ChatInput", () => {
  it("send button is disabled when input is empty", () => {
    renderComponent();
    expect(screen.getByTestId("send-button")).toBeDisabled();
  });

  it("send button is disabled when isStreaming is true", async () => {
    renderComponent({ isStreaming: true });
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "hello");
    expect(screen.getByTestId("send-button")).toBeDisabled();
  });

  it("send button is enabled when input has text and not streaming", async () => {
    renderComponent();
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "hello");
    expect(screen.getByTestId("send-button")).not.toBeDisabled();
  });

  it("calls onSend with trimmed text when send button is clicked", async () => {
    const { onSend } = renderComponent();
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "  hello world  ");
    await userEvent.click(screen.getByTestId("send-button"));
    expect(onSend).toHaveBeenCalledWith("hello world");
  });

  it("calls onSend when Enter key is pressed with non-empty input", async () => {
    const { onSend } = renderComponent();
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "hello");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("does not call onSend when Enter is pressed with empty input", () => {
    const { onSend } = renderComponent();
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows spinner when isStreaming", () => {
    renderComponent({ isStreaming: true });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("clears input after sending", async () => {
    renderComponent();
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "test message");
    await userEvent.click(screen.getByTestId("send-button"));
    expect(input).toHaveValue("");
  });
});
