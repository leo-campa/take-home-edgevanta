import fs from "node:fs";
import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ExtractedPage } from "./model";

export const MIN_NATIVE_CHARS = 200;
const MAX_VISION_PAGES = 50;

const VISION_SYSTEM_PROMPT = `You are a construction document analyst. Extract all text and structured information from this construction plan sheet page. Identify and output:
- The sheet identifier (e.g. "Sheet: D-101") if visible, or "Sheet: UNKNOWN" if not found
- All section headers with their content (notes, specifications, quantities, measurements, requirements, table values)

Format output exactly as follows:
Sheet: <identifier>

Section: <section title>
<content lines>

Section: <next section title>
<content lines>

If no clear sections exist, use: Section: General Content
Output only the extracted content — no commentary, explanations, or preamble.`;

function readFileAsUint8Array(filePath: string): Uint8Array {
  const buffer = fs.readFileSync(filePath);
  return new Uint8Array(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
}

function parseSheetId(text: string): string | null {
  const match = text.match(/^Sheet:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

function hasSectionMarkers(text: string): boolean {
  return /\nSection: /.test(text) || text.startsWith("Section: ");
}

async function extractTextFromPage(page: Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>["promise"]>["getPage"]>>): Promise<string> {
  const textContent = await page.getTextContent();
  return textContent.items
    .map((item) => ("str" in item ? item.str : ""))
    .join("");
}

async function renderPageAsBase64(uint8Array: Uint8Array, pageNum: number): Promise<string> {
  const srcDoc = await PDFDocument.load(uint8Array);
  const destDoc = await PDFDocument.create();
  const [copiedPage] = await srcDoc.copyPages(srcDoc, [pageNum - 1]);
  destDoc.addPage(copiedPage);
  const singlePageBytes = await destDoc.save();
  return Buffer.from(singlePageBytes).toString("base64");
}

async function callVisionApi(
  openai: OpenAI,
  base64: string,
  pageNum: number,
): Promise<string> {
  const response = (await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "file" as const,
            file: {
              filename: `page-${pageNum}.pdf`,
              file_data: `data:application/pdf;base64,${base64}`,
            },
          },
        ],
      },
    ],
  } as Parameters<typeof openai.chat.completions.create>[0])) as ChatCompletion;

  return response.choices[0]?.message?.content ?? "";
}

function makeSkippedPage(pageNum: number, warning: string): ExtractedPage {
  return { page: pageNum, sheet: null, text: "", extractionMethod: "vision", skipped: true, warning };
}

export async function extractPdfPages(filePath: string): Promise<ExtractedPage[]> {
  const uint8Array = readFileAsUint8Array(filePath);
  const pdfDoc = await getDocument({ data: uint8Array }).promise;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let visionCallCount = 0;
  const pages: ExtractedPage[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const rawText = await extractTextFromPage(page);
    const meaningfulChars = rawText.replace(/[\s\W]/g, "").length;

    if (meaningfulChars >= MIN_NATIVE_CHARS) {
      const text = hasSectionMarkers(rawText)
        ? rawText
        : `Section: General Content\n\n${rawText}`;

      pages.push({
        page: pageNum,
        sheet: parseSheetId(rawText),
        text,
        extractionMethod: "native",
        skipped: false,
        warning: null,
      });
      continue;
    }

    if (visionCallCount >= MAX_VISION_PAGES) {
      pages.push(makeSkippedPage(pageNum, `Page ${pageNum}: Vision cap of ${MAX_VISION_PAGES} reached`));
      continue;
    }

    try {
      const base64 = await renderPageAsBase64(uint8Array, pageNum);
      visionCallCount++;
      const content = await callVisionApi(openai, base64, pageNum);

      if (!content.trim()) {
        pages.push(makeSkippedPage(pageNum, `Page ${pageNum}: no content extracted`));
        continue;
      }

      pages.push({
        page: pageNum,
        sheet: parseSheetId(content),
        text: content,
        extractionMethod: "vision",
        skipped: false,
        warning: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      pages.push(makeSkippedPage(pageNum, `Page ${pageNum}: vision extraction failed — ${msg}`));
    }
  }

  return pages;
}
