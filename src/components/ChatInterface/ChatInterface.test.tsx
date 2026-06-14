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

function buildCsvResponse(filename = "test.csv") {
  return {
    ok: true,
    json: async () => ({
      filename,
      record_count: 10,
      skipped_count: 0,
      column_mapping: {},
      warnings: [],
    }),
  };
}

function buildPdfResponse(filename = "plan.pdf", chunk_count = 32) {
  return {
    ok: true,
    json: async () => ({
      filename,
      page_count: 10,
      chunk_count,
      native_pages: 8,
      vision_pages: 2,
      skipped_pages: 0,
      warnings: [],
    }),
  };
}

describe("ChatInterface", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  // ─── Layout ─────────────────────────────────────────────────────────────────
  it("renders without crashing", () => {
    render(<ChatInterface />);
    expect(
      screen.getByRole("button", { name: /Upload CSV/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Upload PDF/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders the PDF upload button immediately above the CSV upload button in the DOM", () => {
    render(<ChatInterface />);
    const pdfBtn = screen.getByRole("button", { name: /Upload PDF/i });
    const csvBtn = screen.getByRole("button", { name: /Upload CSV/i });
    expect(
      pdfBtn.compareDocumentPosition(csvBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // ─── CSV upload (existing behaviour unchanged) ───────────────────────────────
  it("calls addMessage with upload confirmation on successful CSV upload", async () => {
    mockFetch.mockResolvedValue(buildCsvResponse("test.csv"));

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

  it("shows 'Dataset replaced' message on second CSV upload", async () => {
    mockFetch.mockResolvedValue(buildCsvResponse("new.csv"));

    render(<ChatInterface />);
    const input = screen.getByTestId("csv-file-input");
    const file = new File(["col\nval"], "new.csv", { type: "text/csv" });

    await userEvent.upload(input, file);
    await waitFor(() => expect(mockAddMessage).toHaveBeenCalledTimes(1));
    expect(mockAddMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Uploaded 'new.csv'") }),
    );

    await userEvent.upload(input, file);
    await waitFor(() => expect(mockAddMessage).toHaveBeenCalledTimes(2));
    expect(mockAddMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Dataset replaced") }),
    );
  });

  // ─── PDF upload ──────────────────────────────────────────────────────────────
  it("calls addMessage with upload confirmation on the first PDF upload", async () => {
    mockFetch.mockResolvedValue(buildPdfResponse("plan.pdf", 32));

    render(<ChatInterface />);
    const input = screen.getByTestId("pdf-file-input");
    const file = new File(["%PDF-1.4"], "plan.pdf", { type: "application/pdf" });
    await userEvent.upload(input, file);

    await waitFor(() =>
      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("Uploaded 'plan.pdf'"),
        }),
      ),
    );
  });

  it("includes the chunk count in the PDF upload confirmation", async () => {
    mockFetch.mockResolvedValue(buildPdfResponse("plan.pdf", 32));

    render(<ChatInterface />);
    const input = screen.getByTestId("pdf-file-input");
    const file = new File(["%PDF-1.4"], "plan.pdf", { type: "application/pdf" });
    await userEvent.upload(input, file);

    await waitFor(() =>
      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("32"),
        }),
      ),
    );
  });

  it("shows 'PDF dataset replaced' message on second PDF upload", async () => {
    mockFetch.mockResolvedValue(buildPdfResponse("v2.pdf", 20));

    render(<ChatInterface />);
    const input = screen.getByTestId("pdf-file-input");
    const file = new File(["%PDF-1.4"], "v2.pdf", { type: "application/pdf" });

    await userEvent.upload(input, file);
    await waitFor(() => expect(mockAddMessage).toHaveBeenCalledTimes(1));

    await userEvent.upload(input, file);
    await waitFor(() => expect(mockAddMessage).toHaveBeenCalledTimes(2));
    expect(mockAddMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("PDF dataset replaced"),
      }),
    );
  });

  // ─── Independent controls ────────────────────────────────────────────────────
  it("CSV and PDF upload controls are independently enabled on initial load", () => {
    render(<ChatInterface />);
    expect(screen.getByRole("button", { name: /Upload CSV/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Upload PDF/i })).not.toBeDisabled();
  });

  // ─── Chat interaction ────────────────────────────────────────────────────────
  it("calls sendQuestion when user types and submits", async () => {
    render(<ChatInterface />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "What are the top items?");
    await userEvent.click(screen.getByTestId("send-button"));
    expect(mockSendQuestion).toHaveBeenCalledWith("What are the top items?");
  });
});
