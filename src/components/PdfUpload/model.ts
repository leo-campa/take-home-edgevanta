export type PdfUploadProps = {
  onUpload: (result: PdfIngestionResult) => void;
  onError: (message: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  disabled: boolean;
};

export type PdfIngestionResult = {
  filename: string;
  page_count: number;
  chunk_count: number;
  native_pages: number;
  vision_pages: number;
  skipped_pages: number;
  warnings: string[];
};
