import UploadFileIcon from "@mui/icons-material/UploadFile";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useRef, useState } from "react";
import type { FileUploadProps, IngestionResult } from "./model";
import styles from "./file-upload.component.module.scss";

const MAX_BYTES = 524_288_000;

export default function FileUpload({
  onUpload,
  onError,
  disabled,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(file: File): string | null {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      return "Only CSV files are accepted.";
    }
    if (file.size > MAX_BYTES) {
      return "File exceeds the 500 MB limit.";
    }
    return null;
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      onError(validationError);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        throw new Error(json.error ?? `Server error ${response.status}`);
      }

      const result = (await response.json()) as IngestionResult;
      onUpload(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      onError(msg);
    } finally {
      setIsLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={styles["file-upload-component"]}>
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
        className={
          isLoading
            ? styles["file-upload-component__loading"]
            : styles["file-upload-component__button"]
        }
        aria-busy={isLoading}
      >
        {isLoading ? "Uploading…" : "Upload CSV"}
      </Button>
      {error && (
        <Typography
          variant="caption"
          color="error"
          className={styles["file-upload-component__error"]}
          role="alert"
        >
          {error}
        </Typography>
      )}
    </div>
  );
}
