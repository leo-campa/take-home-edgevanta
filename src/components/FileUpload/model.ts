export type IngestionResult = {
  filename: string;
  record_count: number;
  skipped_count: number;
  column_mapping: Record<string, string>;
  warnings: string[];
};

export type FileUploadProps = {
  onUpload: (result: IngestionResult) => void;
  onError: (message: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  disabled?: boolean;
};
