import { PDFParse } from "pdf-parse";
import { renderMarkdownPdf } from "@jobseeker/resume-pdf/node";
import type { PdfVariant } from "@jobseeker/resume-pdf";

/**
 * Renders the markdown through the same react-pdf pipeline the web app uses and
 * returns the resulting page count. This is the source of truth for the
 * two-page limit — the generated document is measured, not estimated.
 */
export async function countPdfPages(markdown: string, variant: PdfVariant): Promise<number> {
  const buffer = await renderMarkdownPdf(markdown, variant);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const info = await parser.getInfo();
    return info.total;
  } finally {
    await parser.destroy();
  }
}
