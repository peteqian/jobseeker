import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

function isTextResume(file: File) {
  const name = file.name.toLowerCase();

  if (file.type.startsWith("text/")) {
    return true;
  }

  return name.endsWith(".md") || name.endsWith(".txt");
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isDocx(file: File) {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

export async function extractResumeText(file: File) {
  if (isTextResume(file)) {
    return (await file.text()).trim();
  }

  if (isPdf(file)) {
    const parser = new PDFParse({ data: await file.arrayBuffer() });

    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  if (isDocx(file)) {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(await file.arrayBuffer()),
    });

    return result.value.trim();
  }

  return null;
}

export function getExtractedName(name: string) {
  if (/\.[^.]+$/.test(name)) {
    return name.replace(/\.[^.]+$/, ".md");
  }

  return `${name}.md`;
}
