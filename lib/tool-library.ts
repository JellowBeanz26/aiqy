import type { ToolSpec } from "./types";

/**
 * Curated AIQY tool library. Each entry is a ready-to-drop Eve `defineTool` file.
 * These cover integrations the built-in framework tools don't (arbitrary HTTP, time).
 * The built-ins (web_fetch, web_search, bash, read_file, write_file, …) are on by
 * default and need no file.
 */
export interface LibraryTool {
  slug: string;
  label: string;
  description: string;
  source: string;
}

const httpRequest: LibraryTool = {
  slug: "http_request",
  label: "HTTP request",
  description: "Call any HTTP API (GET/POST/…) with headers and a body.",
  source: `import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";

export default defineTool({
  approval: never(),
  description:
    "Make an HTTP request to any URL and return the response status and body. Use this to call external APIs.",
  inputSchema: z.object({
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
  }),
  async execute({ url, method, headers, body }) {
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    return { status: res.status, ok: res.ok, body: text.slice(0, 10_000) };
  },
});
`,
};

const getCurrentTime: LibraryTool = {
  slug: "get_current_time",
  label: "Current time",
  description: "Get the current date & time (ISO 8601, UTC).",
  source: `import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";

export default defineTool({
  approval: never(),
  description: "Get the current date and time in ISO 8601 format (UTC).",
  inputSchema: z.object({}),
  async execute() {
    return { now: new Date().toISOString() };
  },
});
`,
};

export const TOOL_LIBRARY: LibraryTool[] = [httpRequest, getCurrentTime];

export function toolsBySlug(slugs: string[]): ToolSpec[] {
  return slugs
    .map((s) => TOOL_LIBRARY.find((t) => t.slug === s))
    .filter((t): t is LibraryTool => Boolean(t))
    .map((t) => ({ slug: t.slug, source: t.source }));
}
