import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatInterface from "./index";

const mockSendQuestion = jest.fn();
const mockAddMessage = jest.fn();

jest.mock("@/hooks/useChat", () => ({
  useChat: () => ({
    messages: [],
    isStreaming: false,
    sendQuestion: mockSendQuestion,
    addMessage: mockAddMessage,
  }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("ChatInterface", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  it("renders without crashing", () => {
    render(<ChatInterface />);
    expect(
      screen.getByRole("button", { name: /Upload CSV/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("calls addMessage with upload confirmation on successful upload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        filename: "test.csv",
        record_count: 10,
        skipped_count: 0,
        column_mapping: {},
        warnings: [],
      }),
    });

    render(<ChatInterface />);

    const input = screen.getByTestId("csv-file-input");
    const file = new File(["col\nval"], "test.csv", { type: "text/csv" });
    await userEvent.upload(input, file);

    await waitFor(() =>
      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("Uploaded 'test.csv'"),
        }),
      ),
    );
  });

  it("calls sendQuestion when user types and sends", async () => {
    render(<ChatInterface />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "What are the top items?");
    await userEvent.click(screen.getByTestId("send-button"));
    expect(mockSendQuestion).toHaveBeenCalledWith("What are the top items?");
  });

  it("shows Dataset replaced message on second upload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        filename: "new.csv",
        record_count: 5,
        skipped_count: 0,
        column_mapping: {},
        warnings: [],
      }),
    });

    render(<ChatInterface />);
    const input = screen.getByTestId("csv-file-input");
    const file = new File(["col\nval"], "new.csv", { type: "text/csv" });

    // First upload
    await userEvent.upload(input, file);
    await waitFor(() => expect(mockAddMessage).toHaveBeenCalledTimes(1));
    expect(mockAddMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Uploaded 'new.csv'"),
      }),
    );

    // Second upload
    await userEvent.upload(input, file);
    await waitFor(() => expect(mockAddMessage).toHaveBeenCalledTimes(2));
    expect(mockAddMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Dataset replaced"),
      }),
    );
  });
});
