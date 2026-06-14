import { randomUUID } from "node:crypto";
import type { ContentChunk, ExtractedPage } from "./model";

const MAX_CHUNK_CHARS = 2000;

export function chunkExtractedPages(pages: ExtractedPage[]): ContentChunk[] {
  const chunks: ContentChunk[] = [];

  for (const page of pages) {
    if (page.skipped) continue;

    const { page: pageNum, sheet, extractionMethod, text } = page;
    const sectionParts = text.split("\nSection: ");

    if (sectionParts.length <= 1) {
      const trimmed = text.trim();
      if (trimmed) {
        chunks.push({
          id: randomUUID(),
          page: pageNum,
          sheet,
          section: null,
          text: trimmed,
          extractionMethod,
        });
      }
      continue;
    }

    for (let i = 1; i < sectionParts.length; i++) {
      const part = sectionParts[i];
      const newlineIdx = part.indexOf("\n");
      if (newlineIdx === -1) continue;

      const sectionTitle = part.slice(0, newlineIdx).trim();
      const content = part.slice(newlineIdx + 1).trim();
      if (!content) continue;

      const subChunks = splitLong(content);
      const total = subChunks.length;

      for (let j = 0; j < subChunks.length; j++) {
        chunks.push({
          id: randomUUID(),
          page: pageNum,
          sheet,
          section:
            total > 1
              ? `${sectionTitle} (part ${j + 1}/${total})`
              : sectionTitle,
          text: subChunks[j],
          extractionMethod,
        });
      }
    }
  }

  return chunks;
}

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];

  const paragraphs = text.split("\n\n");
  const parts: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (current && candidate.length > MAX_CHUNK_CHARS) {
      parts.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);

  return parts.length > 1 ? parts : [text];
}
