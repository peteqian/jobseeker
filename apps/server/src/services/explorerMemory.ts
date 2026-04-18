import path from "node:path";
import { z } from "zod";
import type { DomainMemory } from "@jobseeker/contracts";

import { dataDir } from "../env";
import { logWarn } from "../lib/log";

const DOMAIN_MEMORY_SCHEMA = z.object({
  domain: z.string().min(1),
  searchHints: z.array(z.string()).default([]),
  extractHints: z.array(z.string()).default([]),
  avoidHints: z.array(z.string()).default([]),
});

const MEMORY_SCHEMA = z.array(DOMAIN_MEMORY_SCHEMA);

const DEFAULT_MEMORY: DomainMemory[] = [
  {
    domain: "seek.com.au",
    searchHints: [
      "Use the main search input for role keywords.",
      "If there are separate What and Where fields, fill both.",
      "Apply date filters for recency when available.",
    ],
    extractHints: [
      "Prefer listing cards that clearly show role and company.",
      "Open detail pages when summary text is too short.",
      "Always capture the canonical job URL.",
    ],
    avoidHints: ["Do not include promoted ads without a job detail page."],
  },
  {
    domain: "linkedin.com",
    searchHints: [
      "Go to Jobs first, then apply role and location filters.",
      "Use recent-posted filters when available.",
    ],
    extractHints: [
      "Capture the job detail URL, not feed/home URLs.",
      "Prefer jobs with full title/company/location visible.",
    ],
    avoidHints: ["Do not continue if login wall blocks navigation."],
  },
];

function memoryPath() {
  return path.join(dataDir, "explorer-memory.json");
}

export async function loadMemory(): Promise<DomainMemory[]> {
  const file = Bun.file(memoryPath());
  const exists = await file.exists();

  if (!exists) {
    await Bun.write(memoryPath(), JSON.stringify(DEFAULT_MEMORY, null, 2));
    return DEFAULT_MEMORY;
  }

  try {
    const raw = await file.text();
    const parsed = MEMORY_SCHEMA.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }

    logWarn("explorer memory invalid, using defaults", {
      path: memoryPath(),
      issues: parsed.error.issues,
    });
    return DEFAULT_MEMORY;
  } catch (error) {
    logWarn("explorer memory parse failed, using defaults", {
      path: memoryPath(),
      error,
    });
    return DEFAULT_MEMORY;
  }
}

export function pickMemory(memories: DomainMemory[], domain: string): DomainMemory | null {
  const key = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "");
  for (const item of memories) {
    const target = item.domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "");
    if (key === target || key.endsWith(`.${target}`) || target.endsWith(`.${key}`)) {
      return item;
    }
  }
  return null;
}

export function parseMemoryInput(input: unknown): DomainMemory[] {
  const parsed = MEMORY_SCHEMA.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid explorer memory payload.");
  }
  return parsed.data;
}

export async function saveMemory(input: DomainMemory[]) {
  await Bun.write(memoryPath(), JSON.stringify(input, null, 2));
}
