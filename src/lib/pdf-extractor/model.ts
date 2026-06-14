export type ExtractedPage = {
  page: number;
  sheet: string | null;
  text: string;
  extractionMethod: "native" | "vision";
  skipped: boolean;
  warning?: string | null;
};

export type PageImage = {
  page: number;
  base64Jpeg: string;
};
