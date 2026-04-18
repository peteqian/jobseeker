import type { Page } from "../browser/session";
import type { PageSnapshot } from "./types";

const SERIALIZE_SCRIPT = `(() => {
  const INTERACTIVE_TAGS = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL", "DETAILS", "SUMMARY"]);
  const INTERACTIVE_ROLES = new Set([
    "button", "link", "checkbox", "radio", "menuitem", "tab", "option", "switch", "textbox", "combobox", "searchbox",
  ]);
  const MAX_ELEMENTS = 1200;
  const elements = [];

  const clean = (value, limit = 240) => {
    if (!value) return "";
    return String(value).replace(/\\s+/g, " ").trim().slice(0, limit);
  };

  const isVisible = (el, win) => {
    const style = win.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    try {
      const opacity = Number(style.opacity);
      if (!Number.isNaN(opacity) && opacity <= 0) return false;
    } catch {}

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return true;
  };

  const isInteractive = (el) => {
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute("onclick")) return true;
    if (el.getAttribute("tabindex") !== null) return true;
    const role = el.getAttribute("role");
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    return false;
  };

  const selectorHint = (el) => {
    let hint = el.tagName.toLowerCase();
    if (el.id) {
      hint += "#" + el.id;
      return hint;
    }
    const classes = (el.className || "")
      .split(/\\s+/)
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(".");
    if (classes) {
      hint += "." + classes;
    }
    return hint;
  };

  const snapshotElement = (el, win, framePath) => {
    if (elements.length >= MAX_ELEMENTS) return;
    const rect = el.getBoundingClientRect();
    const idx = elements.length;
    el.setAttribute("data-agent-idx", String(idx));

    const text = clean(
      el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "",
      300,
    );

    elements.push({
      index: idx,
      framePath,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || null,
      text,
      href: el.getAttribute("href") || null,
      name: el.getAttribute("name") || null,
      type: el.getAttribute("type") || null,
      placeholder: el.getAttribute("placeholder") || null,
      value: typeof el.value === "string" ? clean(el.value, 300) : null,
      ariaLabel: el.getAttribute("aria-label") || null,
      selectorHint: selectorHint(el),
      bbox: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    });
  };

  const walkTree = (rootNode, win, framePath) => {
    if (!rootNode || !rootNode.querySelectorAll) return;

    for (const prev of rootNode.querySelectorAll("[data-agent-idx]")) {
      prev.removeAttribute("data-agent-idx");
    }

    const walker = win.document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      if (elements.length >= MAX_ELEMENTS) return;
      const el = walker.currentNode;
      if (!isVisible(el, win)) continue;
      if (isInteractive(el)) {
        snapshotElement(el, win, framePath);
      }

      if (el.shadowRoot) {
        walkTree(el.shadowRoot, win, framePath);
      }

      if (el.tagName === "IFRAME" || el.tagName === "FRAME") {
        try {
          const childWin = el.contentWindow;
          const childDoc = childWin && childWin.document;
          if (childWin && childDoc && childDoc.body) {
            const nextPath = framePath + " > " + selectorHint(el);
            walkTree(childDoc.body, childWin, nextPath);
          }
        } catch {
          // cross-origin iframe
        }
      }
    }
  };

  const rootBody = document.body;
  if (rootBody) {
    walkTree(rootBody, window, "main");
  }

  const resources = performance.getEntriesByType("resource");
  let pendingRequestCount = 0;
  for (const entry of resources) {
    if (entry.responseEnd === 0) pendingRequestCount += 1;
  }

  return {
    url: location.href,
    title: document.title,
    elements,
    stability: {
      readyState: document.readyState,
      pendingRequestCount,
    },
  };
})()`;

export async function serializePage(page: Page): Promise<PageSnapshot> {
  return page.evaluate<PageSnapshot>(SERIALIZE_SCRIPT);
}

export function formatSnapshotForLLM(snapshot: PageSnapshot, limit = 120): string {
  const lines: string[] = [];
  lines.push(`URL: ${snapshot.url}`);
  lines.push(`TITLE: ${snapshot.title}`);
  lines.push(
    `PAGE STATE: readyState=${snapshot.stability.readyState}, pendingRequests=${snapshot.stability.pendingRequestCount}`,
  );
  lines.push(`INTERACTIVE ELEMENTS (${snapshot.elements.length} total, showing up to ${limit}):`);

  for (const el of snapshot.elements.slice(0, limit)) {
    const attrs: string[] = [];
    attrs.push(`frame=${truncate(el.framePath, 50)}`);
    attrs.push(`selector=${truncate(el.selectorHint, 50)}`);
    if (el.role) attrs.push(`role=${el.role}`);
    if (el.type) attrs.push(`type=${el.type}`);
    if (el.name) attrs.push(`name=${el.name}`);
    if (el.href) attrs.push(`href=${truncate(el.href, 80)}`);
    if (el.placeholder) attrs.push(`placeholder=${truncate(el.placeholder, 40)}`);
    if (el.ariaLabel) attrs.push(`aria=${truncate(el.ariaLabel, 40)}`);
    const attrStr = attrs.length > 0 ? ` [${attrs.join(" ")}]` : "";
    const text = el.text ? ` "${truncate(el.text, 180)}"` : "";
    lines.push(`[${el.index}] <${el.tag}>${attrStr}${text}`);
  }

  if (snapshot.elements.length > limit) {
    lines.push(`... ${snapshot.elements.length - limit} more elements truncated`);
  }

  return lines.join("\n");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}
