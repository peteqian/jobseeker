import { pdf } from "@react-pdf/renderer";
import { MarkdownDocument, registerFonts, type PdfVariant } from "@jobseeker/resume-pdf";

import carlitoRegular from "@jobseeker/resume-pdf/fonts/Carlito-Regular.ttf";
import carlitoBold from "@jobseeker/resume-pdf/fonts/Carlito-Bold.ttf";
import carlitoItalic from "@jobseeker/resume-pdf/fonts/Carlito-Italic.ttf";

// Vite resolves the .ttf imports to bundled asset URLs; react-pdf fetches them.
registerFonts({ regular: carlitoRegular, bold: carlitoBold, italic: carlitoItalic });

export type { PdfVariant };

export async function downloadMarkdownPdf(
  markdown: string,
  filename: string,
  variant: PdfVariant = "resume",
): Promise<void> {
  const blob = await pdf(<MarkdownDocument markdown={markdown} variant={variant} />).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
