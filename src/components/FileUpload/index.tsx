import UploadFileIcon from "@mui/icons-material/UploadFile";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import cx from "classnames";
import { useRef, useState } from "react";
import type { FileUploadProps, IngestionResult } from "./model";

const MAX_BYTES = 104_857_600;

export default function FileUpload({
  onUpload,
  onError,
  onLoadingChange,
  disabled,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  function validate(file: File): string | null {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      return "Only CSV files are accepted.";
    }
    if (file.size > MAX_BYTES) {
      return "File exceeds the 100 MB limit.";
    }
    return null;
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validate(file);
    if (validationError) {
      onError(validationError);
      return;
    }

    setIsLoading(true);
    onLoadingChange?.(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        onError(json.error ?? `Server error ${response.status}`);
        return;
      }

      const result = (await response.json()) as IngestionResult;
      onUpload(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      onError(msg);
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="file-upload-component">
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={handleChange}
        aria-label="Upload CSV file"
        data-testid="csv-file-input"
      />
      <Button
        variant="outlined"
        startIcon={
          isLoading ? <CircularProgress size={16} /> : <UploadFileIcon />
        }
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isLoading}
        className={cx({
          "file-upload-component__button": !isLoading,
          "file-upload-component__loading": isLoading,
        })}
        aria-busy={isLoading}
      >
        {isLoading ? "Uploading…" : "Upload CSV"}
      </Button>
    </div>
  );
}
