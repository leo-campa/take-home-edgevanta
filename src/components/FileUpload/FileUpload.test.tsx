import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FileUpload from "./index";
import type { IngestionResult } from "./model";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const successResult: IngestionResult = {
  filename: "test.csv",
  record_count: 10,
  skipped_count: 0,
  column_mapping: {},
  warnings: [],
};

function renderComponent(
  props: Partial<Parameters<typeof FileUpload>[0]> = {},
) {
  const onUpload = jest.fn();
  const onError = jest.fn();
  render(<FileUpload onUpload={onUpload} onError={onError} {...props} />);
  return { onUpload, onError };
}

describe("FileUpload", () => {
  beforeEach(() => mockFetch.mockReset());

  it("rejects non-CSV files and does not call onUpload", async () => {
    const { onUpload, onError } = renderComponent();
    const input = screen.getByTestId("csv-file-input");
    const file = new File(["data"], "report.pdf", { type: "application/pdf" });

    // Use fireEvent to bypass the accept attribute filtering done by userEvent
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("CSV")),
    );
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("rejects files over 500 MB", async () => {
    const { onUpload, onError } = renderComponent();
    const input = screen.getByTestId("csv-file-input");
    const bigFile = new File(["x"], "big.csv", { type: "text/csv" });
    Object.defineProperty(bigFile, "size", { value: 600_000_000 });

    await userEvent.upload(input, bigFile);

    expect(onUpload).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("500 MB"));
  });

  it("calls onUpload with result on successful upload", async () => {
    const { onUpload } = renderComponent();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => successResult,
    });

    const input = screen.getByTestId("csv-file-input");
    const file = new File(["col\nval"], "data.csv", { type: "text/csv" });

    await userEvent.upload(input, file);

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(successResult));
  });

  it("disables the button while loading", async () => {
    renderComponent();

    let resolveUpload!: (value: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((res) => {
        resolveUpload = res;
      }),
    );

    const input = screen.getByTestId("csv-file-input");
    const file = new File(["col\nval"], "data.csv", { type: "text/csv" });
    await userEvent.upload(input, file);

    const button = screen.getByRole("button", { name: /Uploading/i });
    expect(button).toBeDisabled();

    resolveUpload({ ok: true, json: async () => successResult });
  });

  it("shows error and calls onError when server returns error", async () => {
    const { onError } = renderComponent();

    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server exploded" }),
    });

    const input = screen.getByTestId("csv-file-input");
    const file = new File(["col\nval"], "data.csv", { type: "text/csv" });

    await userEvent.upload(input, file);

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("Server exploded"),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
