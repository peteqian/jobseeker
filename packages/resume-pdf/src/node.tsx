import { fileURLToPath } from "node:url";
import { renderToBuffer } from "@react-pdf/renderer";

import { MarkdownDocument, registerFonts, type PdfVariant } from "./document";

let fontsReady = false;

function ensureFonts(): void {
  if (fontsReady) return;
  const fontPath = (name: string) => fileURLToPath(new URL(`../fonts/${name}`, import.meta.url));
  registerFonts({
    regular: fontPath("Carlito-Regular.ttf"),
    bold: fontPath("Carlito-Bold.ttf"),
    italic: fontPath("Carlito-Italic.ttf"),
  });
  fontsReady = true;
}

/** Renders the markdown to a PDF buffer using the bundled Carlito fonts. */
export function renderMarkdownPdf(markdown: string, variant: PdfVariant): Promise<Buffer> {
  ensureFonts();
  return renderToBuffer(<MarkdownDocument markdown={markdown} variant={variant} />);
}
