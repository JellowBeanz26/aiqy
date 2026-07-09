import { generateAgent } from "@/lib/generator";
import { ensureSharedDeps } from "@/lib/runtime";
import { getSettings, listAgents, makeAgentId, saveMeta } from "@/lib/store";
import { toolsBySlug } from "@/lib/tool-library";
import type { AgentMeta, AgentSpec } from "@/lib/types";
import { validateAgent } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listAgents());
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string; prompt?: string; toolSlugs?: string[] };
  const name = (body.name || "").trim().slice(0, 60) || "Untitled agent";
  const prompt = (body.prompt || "").trim();
  const toolSlugs = Array.isArray(body.toolSlugs) ? body.toolSlugs : [];

  if (!prompt) {
    return Response.json({ error: "Describe what the agent should do." }, { status: 400 });
  }

  await ensureSharedDeps();
  const model = await getSettings();
  const id = await makeAgentId(name);
  const spec: AgentSpec = { id, name, instructions: prompt, model, tools: toolsBySlug(toolSlugs) };

  await generateAgent(spec);
  const validation = validateAgent(id);

  const meta: AgentMeta = {
    id,
    name,
    prompt,
    model,
    toolSlugs,
    createdAt: new Date().toISOString(),
  };
  await saveMeta(meta);

  return Response.json({ id, meta, validation }, { status: validation.ok ? 201 : 422 });
}
