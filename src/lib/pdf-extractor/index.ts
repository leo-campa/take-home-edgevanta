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

function parseSheet(text: string): string | null {
  const match = text.match(/^Sheet:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

function hasSectionMarkers(text: string): boolean {
  return /\nSection: /.test(text) || text.startsWith("Section: ");
}

export async function extractPdfPages(
  filePath: string,
): Promise<ExtractedPage[]> {
  const fileBytes = fs.readFileSync(filePath);
  const uint8Array = new Uint8Array(
    fileBytes instanceof Buffer
      ? fileBytes.buffer.slice(
          fileBytes.byteOffset,
          fileBytes.byteOffset + fileBytes.byteLength,
        )
      : fileBytes,
  );

  const loadingTask = getDocument({ data: uint8Array });
  const pdfDoc = await loadingTask.promise;
  const { numPages } = pdfDoc;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let visionCallCount = 0;
  const pages: ExtractedPage[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const rawText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("");
    const meaningfulChars = rawText.replace(/[\s\W]/g, "").length;

    if (meaningfulChars >= MIN_NATIVE_CHARS) {
      const sheet = parseSheet(rawText);
      const text = hasSectionMarkers(rawText)
        ? rawText
        : `Section: General Content\n\n${rawText}`;

      pages.push({
        page: pageNum,
        sheet,
        text,
        extractionMethod: "native",
        skipped: false,
        warning: null,
      });
      continue;
    }

    if (visionCallCount >= MAX_VISION_PAGES) {
      pages.push({
        page: pageNum,
        sheet: null,
        text: "",
        extractionMethod: "vision",
        skipped: true,
        warning: `Page ${pageNum}: Vision cap of ${MAX_VISION_PAGES} reached`,
      });
      continue;
    }

    try {
      const srcDoc = await PDFDocument.load(uint8Array);
      const destDoc = await PDFDocument.create();
      const [copiedPage] = await srcDoc.copyPages(srcDoc, [pageNum - 1]);
      destDoc.addPage(copiedPage);
      const singlePageBytes = await destDoc.save();
      const base64 = Buffer.from(singlePageBytes).toString("base64");

      visionCallCount++;
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

      const content = response.choices[0]?.message?.content ?? "";

      if (!content.trim()) {
        pages.push({
          page: pageNum,
          sheet: null,
          text: "",
          extractionMethod: "vision",
          skipped: true,
          warning: `Page ${pageNum}: no content extracted`,
        });
        continue;
      }

      const sheet = parseSheet(content);
      pages.push({
        page: pageNum,
        sheet,
        text: content,
        extractionMethod: "vision",
        skipped: false,
        warning: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      pages.push({
        page: pageNum,
        sheet: null,
        text: "",
        extractionMethod: "vision",
        skipped: true,
        warning: `Page ${pageNum}: vision extraction failed — ${msg}`,
      });
    }
  }

  return pages;
}
