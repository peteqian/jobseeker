import { createHash } from "node:crypto";
import type { Page } from "@jobseeker/browser-agent";

const FINGERPRINT_EXPRESSION = `(() => {
  const keepAttrs = ["role", "type", "name", "placeholder", "aria-label", "aria-labelledby"];
  function normalize(node) {
    if (!node || node.nodeType !== 1) return null;
    const tag = node.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript" || tag === "svg") return null;
    const attrs = {};
    for (const key of keepAttrs) {
      const value = node.getAttribute(key);
      if (value) attrs[key] = value.length > 80 ? value.slice(0, 80) : value;
    }
    let text = null;
    if (tag === "button" || tag === "a" || tag === "label" || tag === "h1" || tag === "h2" || tag === "h3") {
      const inner = (node.textContent || "").trim();
      if (inner) text = inner.length > 60 ? inner.slice(0, 60) : inner;
    }
    const children = [];
    for (const child of node.children) {
      const entry = normalize(child);
      if (entry) children.push(entry);
    }
    const out = { t: tag };
    if (Object.keys(attrs).length > 0) out.a = attrs;
    if (text) out.x = text;
    if (children.length > 0) out.c = children;
    return out;
  }
  const root = normalize(document.body);
  return JSON.stringify(root ?? {});
})()`;

export async function computeFingerprint(
  page: Page,
): Promise<{ fingerprint: string; normalized: string }> {
  const normalized = await page.evaluate<string>(FINGERPRINT_EXPRESSION);
  const fingerprint = createHash("sha256").update(normalized).digest("hex");
  return { fingerprint, normalized };
}

export function extractUrlPattern(url: string): string {
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => (/^\d{3,}$/.test(segment) ? "*" : segment));
    return `${parsed.host}/${pathSegments.join("/")}`;
  } catch {
    return url;
  }
}
