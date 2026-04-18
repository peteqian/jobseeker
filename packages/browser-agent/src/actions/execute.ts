import type { BrowserSession, Page } from "../browser/session";
import type { Action } from "./types";

export interface ActionResult {
  ok: boolean;
  message: string;
  extractedContent?: string;
  longTermMemory?: string;
  data?: unknown;
  activeTargetId?: string;
}

function formatSearchResults(
  data: {
    total: number;
    hasMore: boolean;
    matches: Array<{
      matchText: string;
      context: string;
      elementPath: string;
      charPosition: number;
    }>;
  },
  pattern: string,
): string {
  const total = data.total;
  const matches = data.matches;

  if (total === 0) {
    return `No matches found for "${pattern}" on page.`;
  }

  const lines: string[] = [
    `Found ${total} match${total !== 1 ? "es" : ""} for "${pattern}" on page:`,
    "",
  ];
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i] as (typeof matches)[number];
    const loc = m.elementPath ? ` (in ${m.elementPath})` : "";
    lines.push(`[${i + 1}] ${m.context}${loc}`);
  }

  if (data.hasMore) {
    lines.push(
      "",
      `... showing ${matches.length} of ${total} total matches. Increase max_results to see more.`,
    );
  }

  return lines.join("\n");
}

function formatFindResults(
  data: {
    total: number;
    showing: number;
    elements: Array<{
      index: number;
      tag: string;
      text?: string;
      attrs?: Record<string, string>;
      childrenCount: number;
    }>;
  },
  selector: string,
): string {
  const total = data.total;
  if (total === 0) {
    return `No elements found matching "${selector}".`;
  }

  const lines: string[] = [
    `Found ${total} element${total !== 1 ? "s" : ""} matching "${selector}":`,
    "",
  ];

  for (const el of data.elements) {
    const parts: string[] = [`[${el.index}] <${el.tag}>`];
    if (el.text) {
      const display = el.text.split(/\s+/).join(" ").trim().slice(0, 120);
      if (display) {
        parts.push(`"${display}${el.text.length > 120 ? "..." : ""}"`);
      }
    }
    if (el.attrs && Object.keys(el.attrs).length > 0) {
      const attrs = Object.entries(el.attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(", ");
      parts.push(`{${attrs}}`);
    }
    parts.push(`(${el.childrenCount} children)`);
    lines.push(parts.join(" "));
  }

  if (data.showing < total) {
    lines.push(
      "",
      `Showing ${data.showing} of ${total} total elements. Increase max_results to see more.`,
    );
  }

  return lines.join("\n");
}

function requireSession(
  session: BrowserSession | undefined,
  actionName: Action["name"],
): BrowserSession {
  if (!session) {
    throw new Error(`Action ${actionName} requires BrowserSession`);
  }
  return session;
}

export async function executeAction(
  page: Page,
  action: Action,
  session?: BrowserSession,
): Promise<ActionResult> {
  try {
    switch (action.name) {
      case "navigate": {
        const newTab = action.params.newTab ?? false;
        const targetPage = newTab ? await requireSession(session, action.name).newPage() : page;

        const health = await targetPage.navigateWithHealthCheck(action.params.url);
        if (!health.ok) {
          const warning =
            `Navigated to ${action.params.url}, but page appears empty. ${health.warning ?? ""}`.trim();
          return {
            ok: false,
            message: warning,
            extractedContent: warning,
            longTermMemory: `Navigation warning for ${action.params.url}`,
            activeTargetId: newTab ? targetPage.targetId : undefined,
          };
        }
        const memory = newTab
          ? `Opened new tab and navigated to ${action.params.url}`
          : `Navigated to ${action.params.url}`;
        return {
          ok: true,
          message: memory,
          extractedContent: memory,
          longTermMemory: memory,
          activeTargetId: newTab ? targetPage.targetId : undefined,
        };
      }

      case "click": {
        if (
          typeof action.params.coordinateX === "number" &&
          typeof action.params.coordinateY === "number"
        ) {
          await page.clickAtCoordinates(action.params.coordinateX, action.params.coordinateY);
          const memory = `Clicked coordinates (${action.params.coordinateX}, ${action.params.coordinateY})`;
          return {
            ok: true,
            message: memory,
            extractedContent: memory,
            longTermMemory: memory,
          };
        }

        if (typeof action.params.index !== "number") {
          return {
            ok: false,
            message: "Click action requires index or coordinateX+coordinateY",
            extractedContent: "Click action requires index or coordinateX+coordinateY",
          };
        }

        const success = await page.clickByIndex(action.params.index);
        return success
          ? {
              ok: true,
              message: `Clicked element [${action.params.index}]`,
              extractedContent: `Clicked element [${action.params.index}]`,
              longTermMemory: `Clicked element [${action.params.index}]`,
            }
          : {
              ok: false,
              message: `Element [${action.params.index}] not found or not clickable`,
              extractedContent: `Element [${action.params.index}] not found or not clickable`,
            };
      }

      case "type": {
        const success = await page.typeByIndex(
          action.params.index,
          action.params.text,
          action.params.submit ?? false,
        );
        return success
          ? {
              ok: true,
              message: `Typed into [${action.params.index}]${action.params.submit ? " and submitted" : ""}`,
              extractedContent: `Typed into [${action.params.index}]${action.params.submit ? " and submitted" : ""}`,
              longTermMemory: `Typed into [${action.params.index}]`,
            }
          : {
              ok: false,
              message: `Element [${action.params.index}] not typable`,
              extractedContent: `Element [${action.params.index}] not typable`,
            };
      }

      case "scroll": {
        const pages =
          action.params.pages ?? (action.params.amount ? action.params.amount / 1000 : 1.0);
        await page.scrollByPages(action.params.direction, pages, action.params.index);
        const memory = `Scrolled ${action.params.direction}${action.params.index !== undefined ? ` on [${action.params.index}]` : ""}`;
        return {
          ok: true,
          message: memory,
          extractedContent: memory,
          longTermMemory: memory,
        };
      }

      case "wait": {
        await page.waitForTimeout(action.params.ms);
        const memory = `Waited ${action.params.ms}ms`;
        return { ok: true, message: memory, extractedContent: memory, longTermMemory: memory };
      }

      case "send_keys": {
        await page.sendKeys(action.params.keys);
        const memory = `Sent keys: ${action.params.keys}`;
        return { ok: true, message: memory, extractedContent: memory, longTermMemory: memory };
      }

      case "select_option": {
        const success = await page.selectOptionByIndex(action.params.index, action.params.value);
        return success
          ? {
              ok: true,
              message: `Selected option on [${action.params.index}]`,
              extractedContent: `Selected option on [${action.params.index}]`,
              longTermMemory: `Selected option on [${action.params.index}]`,
            }
          : {
              ok: false,
              message: `Could not select option on [${action.params.index}]`,
              extractedContent: `Could not select option on [${action.params.index}]`,
            };
      }

      case "upload_file": {
        const success = await page.uploadFilesByIndex(action.params.index, action.params.paths);
        return success
          ? {
              ok: true,
              message: `Uploaded ${action.params.paths.length} file(s) to [${action.params.index}]`,
              extractedContent: `Uploaded ${action.params.paths.length} file(s) to [${action.params.index}]`,
              longTermMemory: `Uploaded file(s) to [${action.params.index}]`,
            }
          : {
              ok: false,
              message: `Could not upload to [${action.params.index}]`,
              extractedContent: `Could not upload to [${action.params.index}]`,
            };
      }

      case "wait_for_text": {
        const found = await page.waitForText(action.params.text, action.params.timeoutMs ?? 10_000);
        return found
          ? {
              ok: true,
              message: `Text found: ${action.params.text}`,
              extractedContent: `Text found: ${action.params.text}`,
              longTermMemory: `Found text on page`,
            }
          : {
              ok: false,
              message: `Timed out waiting for text: ${action.params.text}`,
              extractedContent: `Timed out waiting for text: ${action.params.text}`,
            };
      }

      case "go_back": {
        const wentBack = await page.goBack();
        if (!wentBack) {
          return {
            ok: false,
            message: "Cannot go back — no previous history entry",
            extractedContent: "Cannot go back — no previous history entry",
          };
        }
        const memory = "Navigated back";
        return { ok: true, message: memory, extractedContent: memory, longTermMemory: memory };
      }

      case "go_forward": {
        const wentForward = await page.goForward();
        if (!wentForward) {
          return {
            ok: false,
            message: "Cannot go forward — no next history entry",
            extractedContent: "Cannot go forward — no next history entry",
          };
        }
        const memory = "Navigated forward";
        return { ok: true, message: memory, extractedContent: memory, longTermMemory: memory };
      }

      case "refresh": {
        await page.refresh();
        const memory = "Refreshed page";
        return { ok: true, message: memory, extractedContent: memory, longTermMemory: memory };
      }

      case "new_tab": {
        const currentSession = requireSession(session, action.name);
        const tab = await currentSession.newPage();
        if (action.params.url) {
          await tab.goto(action.params.url);
        }
        return {
          ok: true,
          message: `Opened new tab ${tab.targetId}${action.params.url ? ` with ${action.params.url}` : ""}`,
          extractedContent: `Opened new tab ${tab.targetId}${action.params.url ? ` with ${action.params.url}` : ""}`,
          longTermMemory: `Opened new tab ${tab.targetId}`,
          activeTargetId: tab.targetId,
        };
      }

      case "switch_tab": {
        const currentSession = requireSession(session, action.name);
        const targetIds = await currentSession.listPageTargetIds();
        let resolvedTargetId = action.params.targetId;
        if (typeof action.params.pageId === "number") {
          resolvedTargetId = targetIds[action.params.pageId];
        }

        if (!resolvedTargetId || !targetIds.includes(resolvedTargetId)) {
          return {
            ok: false,
            message:
              typeof action.params.pageId === "number"
                ? `Tab pageId ${action.params.pageId} not found`
                : `Tab not found: ${action.params.targetId}`,
            extractedContent:
              typeof action.params.pageId === "number"
                ? `Tab pageId ${action.params.pageId} not found`
                : `Tab not found: ${action.params.targetId}`,
          };
        }
        return {
          ok: true,
          message: `Switched to tab ${resolvedTargetId}`,
          extractedContent: `Switched to tab ${resolvedTargetId}`,
          longTermMemory: `Switched tab to ${resolvedTargetId}`,
          activeTargetId: resolvedTargetId,
        };
      }

      case "close_tab": {
        const currentSession = requireSession(session, action.name);
        const targetIds = await currentSession.listPageTargetIds();
        const closingTargetId =
          action.params.targetId ??
          (typeof action.params.pageId === "number"
            ? targetIds[action.params.pageId]
            : undefined) ??
          page.targetId;

        if (!closingTargetId || !targetIds.includes(closingTargetId)) {
          return {
            ok: false,
            message:
              typeof action.params.pageId === "number"
                ? `Tab pageId ${action.params.pageId} not found`
                : `Tab not found: ${action.params.targetId}`,
            extractedContent:
              typeof action.params.pageId === "number"
                ? `Tab pageId ${action.params.pageId} not found`
                : `Tab not found: ${action.params.targetId}`,
          };
        }

        await currentSession.closePage(closingTargetId);
        const remaining = await currentSession.listPageTargetIds();
        if (remaining.length === 0) {
          const replacement = await currentSession.newPage();
          return {
            ok: true,
            message: `Closed tab ${closingTargetId}; opened replacement ${replacement.targetId}`,
            extractedContent: `Closed tab ${closingTargetId}; opened replacement ${replacement.targetId}`,
            longTermMemory: `Closed tab ${closingTargetId}`,
            activeTargetId: replacement.targetId,
          };
        }
        const next = remaining[0] as string;
        return {
          ok: true,
          message: `Closed tab ${closingTargetId}`,
          extractedContent: `Closed tab ${closingTargetId}`,
          longTermMemory: `Closed tab ${closingTargetId}`,
          activeTargetId: next,
        };
      }

      case "search_page": {
        const result = await page.searchPage({
          pattern: action.params.pattern,
          regex: action.params.regex,
          caseSensitive: action.params.caseSensitive,
          contextChars: action.params.contextChars,
          cssScope: action.params.cssScope,
          maxResults: action.params.maxResults,
        });
        const formatted = formatSearchResults(result, action.params.pattern);
        return {
          ok: true,
          message: formatted,
          extractedContent: formatted,
          longTermMemory: `Searched page for "${action.params.pattern}": ${result.total} match${result.total === 1 ? "" : "es"} found.`,
          data: result,
        };
      }

      case "find_elements": {
        const result = await page.findElements({
          selector: action.params.selector,
          attributes: action.params.attributes,
          maxResults: action.params.maxResults,
          includeText: action.params.includeText,
        });
        const formatted = formatFindResults(result, action.params.selector);
        return {
          ok: true,
          message: formatted,
          extractedContent: formatted,
          longTermMemory: `Found ${result.total} element${result.total === 1 ? "" : "s"} matching "${action.params.selector}".`,
          data: result,
        };
      }

      case "get_dropdown_options": {
        const options = await page.getDropdownOptionsByIndex(action.params.index);
        const optionsText =
          options.length === 0
            ? `No dropdown options found at [${action.params.index}]`
            : [
                `Dropdown options at [${action.params.index}]:`,
                "",
                ...options.map((o, i) => `[${i + 1}] text="${o.text}" value="${o.value}"`),
              ].join("\n");
        return {
          ok: true,
          message: optionsText,
          extractedContent: optionsText,
          longTermMemory: `Read ${options.length} dropdown option${options.length === 1 ? "" : "s"} from [${action.params.index}]`,
          data: { index: action.params.index, options },
        };
      }

      case "find_text": {
        const found = await page.scrollToText(action.params.text);
        return found
          ? {
              ok: true,
              message: `Scrolled to text: ${action.params.text}`,
              extractedContent: `Scrolled to text: ${action.params.text}`,
              longTermMemory: "Scrolled to target text",
            }
          : {
              ok: false,
              message: `Text '${action.params.text}' not found or not visible on page`,
              extractedContent: `Text '${action.params.text}' not found or not visible on page`,
            };
      }

      case "screenshot": {
        if (action.params.fileName) {
          const savedPath = await page.screenshotToFile(action.params.fileName);
          const content = `Screenshot saved to ${savedPath}`;
          return {
            ok: true,
            message: content,
            extractedContent: content,
            longTermMemory: content,
            data: { path: savedPath },
          };
        }

        const base64 = await page.screenshot();
        return {
          ok: true,
          message: "Captured screenshot (base64 PNG)",
          extractedContent: "Captured screenshot (base64 PNG)",
          longTermMemory: "Captured screenshot",
          data: { base64 },
        };
      }

      case "save_as_pdf": {
        const path = await page.saveAsPdf({
          fileName: action.params.fileName,
          printBackground: action.params.printBackground,
          landscape: action.params.landscape,
          scale: action.params.scale,
          paperFormat: action.params.paperFormat,
        });
        const content = `Saved page as PDF to ${path}`;
        return {
          ok: true,
          message: content,
          extractedContent: content,
          longTermMemory: content,
          data: { path },
        };
      }

      case "extract_content": {
        const result = await page.extractContent({
          query: action.params.query,
          extractLinks: action.params.extractLinks,
          extractImages: action.params.extractImages,
          startFromChar: action.params.startFromChar,
          maxChars: action.params.maxChars,
        });

        const wrapped =
          `<url>\n${result.url}\n</url>\n<query>\n${result.query}\n</query>\n` +
          `<result>\n${result.content}\n</result>`;
        const statsMsg =
          `Extracted content for query "${action.params.query}": ` +
          `${result.stats.returnedChars}/${result.stats.totalChars} chars` +
          (result.stats.truncated && result.stats.nextStartChar != null
            ? ` (truncated, continue with startFromChar=${result.stats.nextStartChar})`
            : "");

        return {
          ok: true,
          message: statsMsg,
          extractedContent: wrapped,
          longTermMemory: statsMsg,
          data: result,
        };
      }

      case "done":
        return {
          ok: true,
          message: `Done (success=${action.params.success}): ${action.params.summary}`,
          extractedContent: `Done (success=${action.params.success}): ${action.params.summary}`,
          longTermMemory: action.params.summary,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `Action ${action.name} failed: ${message}`,
      extractedContent: `Action ${action.name} failed: ${message}`,
    };
  }
}
