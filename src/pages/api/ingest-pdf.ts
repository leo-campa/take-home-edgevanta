import fs from "node:fs";
import path from "node:path";
import busboy from "busboy";
import type { NextApiRequest, NextApiResponse } from "next";
import { generateEmbeddings } from "@/lib/embeddings";
import { chunkExtractedPages } from "@/lib/pdf-chunker";
import { extractPdfPages } from "@/lib/pdf-extractor";
import type { ExtractedPage } from "@/lib/pdf-extractor/model";
import { getStore } from "@/lib/vector-store";
import type {
  PdfDatasetMetadata,
  PdfVectorEntry,
} from "@/lib/vector-store/model";

export const config = {
  api: { bodyParser: false, responseLimit: false },
  maxDuration: 600,
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

const MAX_BYTES = 524_288_000;

type SavedFile = {
  savedPath: string | null;
  filename: string;
  mimeType: string;
  oversized: boolean;
};

async function saveUploadedFile(
  req: NextApiRequest,
  uploadDir: string,
): Promise<SavedFile> {
  let savedPath: string | null = null;
  let filename = "upload.pdf";
  let mimeType = "";
  let oversized = false;

  await new Promise<void>((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: MAX_BYTES },
    });

    bb.on("file", (_field, stream, info) => {
      filename = info.filename ?? "upload.pdf";
      mimeType = info.mimeType ?? "";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      savedPath = path.resolve(uploadDir, `${timestamp}-${filename}`);
      const writeStream = fs.createWriteStream(savedPath);

      stream.on("limit", () => {
        oversized = true;
        stream.destroy();
        writeStream.destroy();
        if (savedPath) fs.rmSync(savedPath, { force: true });
      });

      stream.pipe(writeStream);
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      stream.on("error", reject);
    });

    bb.on("close", resolve);
    bb.on("error", reject);
    req.pipe(bb);
  });

  return { savedPath, filename, mimeType, oversized };
}

function getPageStats(pages: ExtractedPage[]) {
  return {
    native_pages: pages.filter(
      (p) => !p.skipped && p.extractionMethod === "native",
    ).length,
    vision_pages: pages.filter(
      (p) => !p.skipped && p.extractionMethod === "vision",
    ).length,
    skipped_pages: pages.filter((p) => p.skipped).length,
    warnings: pages.flatMap((p) => (p.warning ? [p.warning] : [])),
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const uploadDir = process.env.PDF_UPLOAD_DIR ?? "./uploads-pdf";
  fs.mkdirSync(uploadDir, { recursive: true });

  const { savedPath, filename, mimeType, oversized } = await saveUploadedFile(
    req,
    uploadDir,
  );

  if (oversized) {
    return res.status(413).json({ error: "File exceeds the 500 MB limit." });
  }

  if (!savedPath) {
    return res.status(400).json({
      error: "No file uploaded. Include a 'file' field in multipart/form-data.",
    });
  }

  const isPdf =
    filename.toLowerCase().endsWith(".pdf") || mimeType === "application/pdf";

  if (!isPdf) {
    return res.status(400).json({ error: "Only PDF files are accepted." });
  }

  let pages: Awaited<ReturnType<typeof extractPdfPages>>;
  try {
    pages = await extractPdfPages(savedPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: `PDF processing failed: ${msg}` });
  }

  if (pages.every((p) => p.skipped)) {
    return res.status(422).json({
      error: "No content could be extracted from this PDF.",
      page_count: pages.length,
      skipped_pages: pages.length,
    });
  }

  const chunks = chunkExtractedPages(pages);
  const { native_pages, vision_pages, skipped_pages, warnings } =
    getPageStats(pages);

  const pdfMeta: PdfDatasetMetadata = {
    filename,
    saved_path: savedPath,
    ingested_at: new Date().toISOString(),
    page_count: pages.length,
    chunk_count: chunks.length,
    native_pages,
    vision_pages,
    skipped_pages,
    warnings,
  };

  let vectors: number[][];
  try {
    vectors = await generateEmbeddings(chunks.map((c) => c.text));
  } catch (err) {
    getStore().loadPdf([], pdfMeta);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: `Ingestion failed: ${msg}` });
  }

  const entries: PdfVectorEntry[] = chunks.map((chunk, i) => ({
    id: chunk.id,
    text: chunk.text,
    vector: vectors[i],
    chunk,
  }));

  getStore().loadPdf(entries, pdfMeta);

  return res.json({
    filename,
    page_count: pages.length,
    chunk_count: chunks.length,
    native_pages,
    vision_pages,
    skipped_pages,
    warnings,
  } satisfies PdfIngestionResult);
}
