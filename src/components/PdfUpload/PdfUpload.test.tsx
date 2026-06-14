import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PdfUpload from "./index";
import type { PdfIngestionResult } from "./model";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const successResult: PdfIngestionResult = {
  filename: "plan-set.pdf",
  page_count: 10,
  chunk_count: 32,
  native_pages: 8,
  vision_pages: 2,
  skipped_pages: 0,
  warnings: [],
};

function renderComponent(props: Partial<Parameters<typeof PdfUpload>[0]> = {}) {
  const onUpload = jest.fn();
  const onError = jest.fn();
  render(
    <PdfUpload
      onUpload={onUpload}
      onError={onError}
      disabled={false}
      {...props}
    />,
  );
  return { onUpload, onError };
}

describe("PdfUpload", () => {
  beforeEach(() => mockFetch.mockReset());

  it("renders an Upload PDF button", () => {
    renderComponent();
    expect(
      screen.getByRole("button", { name: /Upload PDF/i }),
    ).toBeInTheDocument();
  });

  it("rejects non-PDF files and does not call onUpload", async () => {
    const { onUpload, onError } = renderComponent();
    const input = screen.getByTestId("pdf-file-input");
    const file = new File(["data"], "data.csv", { type: "text/csv" });

    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("PDF")),
    );
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("rejects files over 500 MB", async () => {
    const { onUpload, onError } = renderComponent();
    const input = screen.getByTestId("pdf-file-input");
    const bigFile = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(bigFile, "size", { value: 600_000_000 });

    await userEvent.upload(input, bigFile);

    expect(onUpload).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("500 MB"));
  });

  it("calls onUpload with PdfIngestionResult on successful upload", async () => {
    const { onUpload } = renderComponent();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => successResult,
    });

    const input = screen.getByTestId("pdf-file-input");
    const file = new File(["%PDF-1.4"], "plan.pdf", {
      type: "application/pdf",
    });

    await userEvent.upload(input, file);

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(successResult));
  });

  it("posts to /api/ingest-pdf with multipart form data", async () => {
    renderComponent();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => successResult,
    });

    const input = screen.getByTestId("pdf-file-input");
    const file = new File(["%PDF-1.4"], "plan.pdf", {
      type: "application/pdf",
    });
    await userEvent.upload(input, file);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ingest-pdf");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBeInstanceOf(FormData);
  });

  it("disables the button while uploading", async () => {
    renderComponent();

    let resolveUpload!: (value: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((res) => {
        resolveUpload = res;
      }),
    );

    const input = screen.getByTestId("pdf-file-input");
    const file = new File(["%PDF-1.4"], "plan.pdf", {
      type: "application/pdf",
    });
    await userEvent.upload(input, file);

    expect(screen.getByRole("button", { name: /Uploading/i })).toBeDisabled();

    resolveUpload({ ok: true, json: async () => successResult });
  });

  it("calls onError and shows alert when the server returns an error", async () => {
    const { onError } = renderComponent();

    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Ingestion failed" }),
    });

    const input = screen.getByTestId("pdf-file-input");
    const file = new File(["%PDF-1.4"], "plan.pdf", {
      type: "application/pdf",
    });
    await userEvent.upload(input, file);

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("Ingestion failed"),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("is disabled when the disabled prop is true", () => {
    renderComponent({ disabled: true });
    expect(screen.getByRole("button", { name: /Upload PDF/i })).toBeDisabled();
  });
});
