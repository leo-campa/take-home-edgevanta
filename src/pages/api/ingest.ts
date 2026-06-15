import fs from "node:fs";
import path from "node:path";
import busboy from "busboy";
import type { NextApiRequest, NextApiResponse } from "next";
import Papa from "papaparse";
import { formatBidItem } from "@/lib/bid-item-formatter";
import { buildColumnMapping, normaliseRow } from "@/lib/csv-normaliser";
import type { BidItem } from "@/lib/csv-normaliser/model";
import { generateEmbeddings } from "@/lib/embeddings";
import { getStore } from "@/lib/vector-store";
import type { DatasetMetadata, VectorEntry } from "@/lib/vector-store/model";

export const config = {
  api: { bodyParser: false, responseLimit: false },
  maxDuration: 300,
};

export type IngestionResult = {
  filename: string;
  record_count: number;
  skipped_count: number;
  column_mapping: Record<string, string>;
  warnings: string[];
};

const MAX_BYTES = 524_288_000;

type SavedFile = {
  savedPath: string | null;
  filename: string;
  oversized: boolean;
};

async function saveUploadedFile(
  req: NextApiRequest,
  uploadDir: string,
): Promise<SavedFile> {
  let savedPath: string | null = null;
  let filename = "upload.csv";
  let oversized = false;

  await new Promise<void>((resolve, reject) => {
    const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_BYTES } });

    bb.on("file", (_field, stream, info) => {
      filename = info.filename ?? "upload.csv";
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

    bb.on("error", reject);
    req.pipe(bb);
  });

  return { savedPath, filename, oversized };
}

function parseCsvRows(
  csvContent: string,
): { items: BidItem[]; skippedCount: number; warnings: string[]; columnMapping: Record<string, string> } {
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const columnMapping = buildColumnMapping(parsed.meta.fields ?? []);
  const items: BidItem[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const isEmpty = Object.values(row).every((v) => v.trim() === "");
    if (isEmpty) {
      skippedCount++;
      warnings.push(`Row ${i} skipped: all cells empty`);
      continue;
    }
    items.push(normaliseRow(row, i));
  }

  return { items, skippedCount, warnings, columnMapping };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  fs.mkdirSync(uploadDir, { recursive: true });

  const { savedPath, filename, oversized } = await saveUploadedFile(req, uploadDir);

  if (oversized) {
    return res.status(413).json({ error: "File exceeds the 500 MB limit." });
  }

  if (!savedPath) {
    return res.status(400).json({
      error: "No file uploaded. Include a 'file' field in multipart/form-data.",
    });
  }

  const csvContent = fs.readFileSync(savedPath, "utf-8");
  const { items, skippedCount, warnings, columnMapping } = parseCsvRows(csvContent);

  if (items.length === 0) {
    return res.status(422).json({
      error: "CSV contained no processable rows.",
      skipped_count: skippedCount,
    });
  }

  const texts = items.map((item) => formatBidItem(item));

  let vectors: number[][];
  try {
    vectors = await generateEmbeddings(texts);
  } catch (err) {
    getStore().loadCsv([], {
      filename,
      saved_path: savedPath,
      ingested_at: new Date().toISOString(),
      record_count: 0,
      skipped_count: skippedCount,
      column_mapping: columnMapping,
      warnings,
    });
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: `Ingestion failed: ${msg}` });
  }

  const entries: VectorEntry[] = items.map((item, i) => ({
    id: item.id,
    text: texts[i],
    vector: vectors[i],
    item,
  }));

  const metadata: DatasetMetadata = {
    filename,
    saved_path: savedPath,
    ingested_at: new Date().toISOString(),
    record_count: items.length,
    skipped_count: skippedCount,
    column_mapping: columnMapping,
    warnings,
  };

  getStore().loadCsv(entries, metadata);

  return res.status(200).json({
    filename,
    record_count: items.length,
    skipped_count: skippedCount,
    column_mapping: columnMapping,
    warnings,
  } satisfies IngestionResult);
}
