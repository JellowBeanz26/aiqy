import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getState, stopAgent } from "@/lib/agent-manager";
import { generateAgent } from "@/lib/generator";
import { agentDir } from "@/lib/paths";
import { deleteAgent, getMeta, saveMeta } from "@/lib/store";
import { TOOL_LIBRARY, toolsBySlug } from "@/lib/tool-library";
import type { AgentMeta, AgentSpec, ToolSpec } from "@/lib/types";
import { validateAgent } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getMeta(id);
  if (!meta) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ meta, state: getState(id) });
}

/** Edit an existing agent: re-generate it with new name / instructions / library tools.
 *  Custom tools that Json wrote (non-library) are read from disk and preserved, so an edit
 *  never silently drops them. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getMeta(id);
  if (!meta) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await req.json()) as { name?: string; prompt?: string; toolSlugs?: string[] };
  const name = (body.name ?? meta.name).trim().slice(0, 60) || meta.name;
  const prompt = (body.prompt ?? meta.prompt).trim() || meta.prompt;

  const librarySlugs = new Set(TOOL_LIBRARY.map((t) => t.slug));
  const requested = Array.isArray(body.toolSlugs) ? body.toolSlugs : meta.toolSlugs;
  const libraryTools = toolsBySlug(requested.filter((s) => librarySlugs.has(s)));

  // Preserve custom (non-library) tool code — read it BEFORE generateAgent wipes agent/.
  const customTools: ToolSpec[] = [];
  try {
    const toolsPath = join(agentDir(id), "agent", "tools");
    for (const file of await readdir(toolsPath)) {
      if (!file.endsWith(".ts")) continue;
      const slug = file.slice(0, -3);
      if (librarySlugs.has(slug)) continue;
      customTools.push({ slug, source: await readFile(join(toolsPath, file), "utf8") });
    }
  } catch {
    // no tools dir yet — nothing to preserve
  }

  const tools: ToolSpec[] = [...libraryTools, ...customTools];
  const spec: AgentSpec = { id, name, instructions: prompt, model: meta.model, tools };
  await generateAgent(spec);
  const validation = validateAgent(id);

  const updated: AgentMeta = { ...meta, name, prompt, toolSlugs: tools.map((t) => t.slug) };
  await saveMeta(updated);
  stopAgent(id); // next request respawns the dev server with the new files

  return Response.json({ id, meta: updated, validation }, { status: validation.ok ? 200 : 422 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  stopAgent(id);
  await deleteAgent(id);
  return Response.json({ ok: true });
}
