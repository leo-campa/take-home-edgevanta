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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  fs.mkdirSync(uploadDir, { recursive: true });

  let savedPath: string | null = null;
  let originalFilename = "upload.csv";
  let _bytesReceived = 0;
  let oversized = false;

  await new Promise<void>((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: MAX_BYTES },
    });

    bb.on("file", (_field, stream, info) => {
      originalFilename = info.filename ?? "upload.csv";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const saveName = `${timestamp}-${originalFilename}`;
      savedPath = path.resolve(uploadDir, saveName);
      const writeStream = fs.createWriteStream(savedPath);

      stream.on("data", (chunk: Buffer) => {
        _bytesReceived += chunk.length;
      });

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

  if (oversized) {
    return res.status(413).json({ error: "File exceeds the 500 MB limit." });
  }

  if (!savedPath) {
    return res.status(400).json({
      error: "No file uploaded. Include a 'file' field in multipart/form-data.",
    });
  }

  const csvContent = fs.readFileSync(savedPath, "utf-8");
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const rawRows = parsed.data;
  const headers = parsed.meta.fields ?? [];
  const columnMapping = buildColumnMapping(headers);
  const warnings: string[] = [];

  const items: BidItem[] = [];
  let skippedCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const values = Object.values(raw);
    if (values.every((v) => v.trim() === "")) {
      skippedCount++;
      warnings.push(`Row ${i} skipped: all cells empty`);
      continue;
    }
    items.push(normaliseRow(raw, i));
  }

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
      filename: originalFilename,
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
    filename: originalFilename,
    saved_path: savedPath,
    ingested_at: new Date().toISOString(),
    record_count: items.length,
    skipped_count: skippedCount,
    column_mapping: columnMapping,
    warnings,
  };

  getStore().loadCsv(entries, metadata);

  const result: IngestionResult = {
    filename: originalFilename,
    record_count: items.length,
    skipped_count: skippedCount,
    column_mapping: columnMapping,
    warnings,
  };

  return res.status(200).json(result);
}
