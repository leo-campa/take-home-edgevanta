import { randomUUID } from "node:crypto";
import type { ContentChunk, ExtractedPage } from "./model";

const MAX_CHUNK_CHARS = 2000;

type PageInfo = Pick<ExtractedPage, "page" | "sheet" | "extractionMethod">;

function makeChunk(
  page: PageInfo,
  section: string | null,
  text: string,
): ContentChunk {
  return {
    id: randomUUID(),
    page: page.page,
    sheet: page.sheet,
    section,
    text,
    extractionMethod: page.extractionMethod,
  };
}

function splitLongText(text: string): string[] {
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

function chunkSection(
  page: PageInfo,
  sectionTitle: string,
  content: string,
): ContentChunk[] {
  const parts = splitLongText(content);
  return parts.map((text, index) => {
    const section =
      parts.length > 1
        ? `${sectionTitle} (part ${index + 1}/${parts.length})`
        : sectionTitle;
    return makeChunk(page, section, text);
  });
}

export function chunkExtractedPages(pages: ExtractedPage[]): ContentChunk[] {
  const chunks: ContentChunk[] = [];

  for (const page of pages) {
    if (page.skipped) continue;

    const pageInfo: PageInfo = {
      page: page.page,
      sheet: page.sheet,
      extractionMethod: page.extractionMethod,
    };

    // Pages without section markers are stored as a single unsectioned chunk
    const sectionParts = page.text.split("\nSection: ");
    if (sectionParts.length <= 1) {
      const text = page.text.trim();
      if (text) chunks.push(makeChunk(pageInfo, null, text));
      continue;
    }

    // Each part after the first split is "sectionTitle\ncontentLines..."
    // (the first element is content before any section header, which we skip)
    for (const part of sectionParts.slice(1)) {
      const newlineIdx = part.indexOf("\n");
      if (newlineIdx === -1) continue;

      const sectionTitle = part.slice(0, newlineIdx).trim();
      const content = part.slice(newlineIdx + 1).trim();
      if (!content) continue;

      chunks.push(...chunkSection(pageInfo, sectionTitle, content));
    }
  }

  return chunks;
}
