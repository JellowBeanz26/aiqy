import { generateAgent } from "./generator";
import { getSettings, makeAgentId, saveMeta } from "./store";
import { TOOL_LIBRARY, toolsBySlug } from "./tool-library";
import type { AgentMeta, AgentSpec, ModelConfig, ToolSpec } from "./types";
import { validateAgent } from "./validate";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CustomTool {
  slug: string;
  code: string;
}

interface BuildSpec {
  name: string;
  instructions: string;
  libraryTools: string[];
  customTools: CustomTool[];
}

export interface BuildResult {
  agentId: string;
  name: string;
  ok: boolean;
  error: string | null;
  attempts: number;
}

export interface JsonResult {
  reply: string;
  build?: BuildResult;
}

const EXAMPLE = `\`\`\`json
{"build": true, "name": "Weather bot", "instructions": "You tell the user the weather. Use the get_weather tool.", "libraryTools": [], "customTools": ["get_weather"]}
\`\`\`
\`\`\`ts
// tool: get_weather
import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";

export default defineTool({
  approval: never(),
  description: "Get the current weather for a city.",
  inputSchema: z.object({ city: z.string() }),
  async execute({ city }) {
    const r = await fetch(\`https://wttr.in/\${encodeURIComponent(city)}?format=j1\`);
    const d = await r.json();
    return { summary: d.current_condition?.[0]?.weatherDesc?.[0]?.value ?? "unknown" };
  },
});
\`\`\``;

function systemPrompt(): string {
  const lib = TOOL_LIBRARY.map((t) => `- ${t.slug}: ${t.description}`).join("\n");
  return `You are Json, a friendly AI agent-builder. You chat with the user to understand which AI agent they want, then you BUILD it.

Guidelines:
- Be warm and brief. Reply in the same language the user writes in. Ask a clarifying question only if truly needed; otherwise build.
- Every agent already has these built-in tools (never list them): web_fetch, web_search, read_file, write_file, bash.
- Library tools you may attach by slug:
${lib}
- If the agent needs something the built-ins/library don't cover, WRITE a custom tool.

OUTPUT FORMAT when you are ready to build — first a short sentence, then EXACTLY:
1) one fenced json block with the plan (custom tool NAMES only, no code inside the json):
\`\`\`json
{"build": true, "name": "<short name>", "instructions": "<the agent's system prompt>", "libraryTools": [<slugs>], "customTools": [<custom tool slugs>]}
\`\`\`
2) then, for EACH custom tool slug, a separate typescript code block whose FIRST line is "// tool: <slug>":
Full example:
${EXAMPLE}

Custom-tool rules: default-export defineTool; import from "eve/tools", "eve/tools/approval", and "zod"; give a zod inputSchema and an async execute; use approval: never(). Do NOT put code inside the json block. Only output the json + code blocks when you actually intend to build now.`;
}

async function callModel(m: ModelConfig, messages: ChatMsg[], temperature = 0.4): Promise<string> {
  const res = await fetch(`${m.baseURL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(m.apiKey ? { authorization: `Bearer ${m.apiKey}` } : {}) },
    body: JSON.stringify({ model: m.modelId, messages, stream: false, temperature }),
  });
  if (!res.ok) throw new Error(`The model could not be reached (${res.status}). Check Settings.`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data?.choices?.[0]?.message?.content ?? "";
}

/** Map of slug -> code, from ```ts blocks whose first line is "// tool: <slug>". */
function extractCodeBlocks(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /```(?:ts|typescript|tsx|js|javascript)?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const code = match[1];
    const first = code.split("\n", 1)[0];
    const slugMatch = first.match(/\/\/\s*tool:\s*([a-z0-9_]+)/i);
    if (slugMatch) map.set(slugMatch[1].toLowerCase(), code.trim());
  }
  return map;
}

function extractBuild(content: string): { text: string; spec: BuildSpec | null } {
  const jsonFence = content.match(/```json\s*([\s\S]*?)```/i);
  if (!jsonFence) return { text: content.trim(), spec: null };

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonFence[1].trim());
  } catch {
    return { text: content.trim(), spec: null };
  }
  if (obj.build !== true) return { text: content.replace(jsonFence[0], "").trim(), spec: null };

  const codeBlocks = extractCodeBlocks(content);
  const validLib = new Set(TOOL_LIBRARY.map((t) => t.slug));
  const wantedCustom = Array.isArray(obj.customTools) ? (obj.customTools as unknown[]).map(String) : [];
  const customTools: CustomTool[] = wantedCustom
    .map((slug) => slug.replace(/[^a-z0-9_]/gi, "_").toLowerCase())
    .map((slug) => ({ slug, code: codeBlocks.get(slug) ?? "" }))
    .filter((t) => t.code.length > 0);

  const spec: BuildSpec = {
    name: String(obj.name ?? "New agent").slice(0, 60) || "New agent",
    instructions: String(obj.instructions ?? "You are a helpful assistant."),
    libraryTools: Array.isArray(obj.libraryTools)
      ? (obj.libraryTools as unknown[]).map(String).filter((s) => validLib.has(s))
      : [],
    customTools,
  };

  // strip the json + code blocks from the conversational text
  let text = content.replace(jsonFence[0], "");
  text = text.replace(/```(?:ts|typescript|tsx|js|javascript)?\s*\n[\s\S]*?```/g, "").trim();
  return { text: text || `Building “${spec.name}”…`, spec };
}

async function fixTools(m: ModelConfig, tools: CustomTool[], error: string): Promise<CustomTool[] | null> {
  const blocks = tools.map((t) => `\`\`\`ts\n// tool: ${t.slug}\n${t.code}\n\`\`\``).join("\n");
  const content = await callModel(
    m,
    [
      {
        role: "system",
        content:
          'You fix Eve tool files (TypeScript). Reply ONLY with corrected code blocks, each ```ts block starting with "// tool: <slug>", same slugs. No prose.',
      },
      { role: "user", content: `Compile error:\n${error}\n\nFix these tools:\n${blocks}` },
    ],
    0.2,
  );
  const map = extractCodeBlocks(content);
  const fixed = tools.map((t) => ({ slug: t.slug, code: map.get(t.slug) ?? t.code }));
  return fixed.some((t, i) => t.code !== tools[i].code) ? fixed : null;
}

async function buildFromSpec(m: ModelConfig, spec: BuildSpec): Promise<BuildResult> {
  const id = await makeAgentId(spec.name);
  let customTools = spec.customTools;
  let ok = false;
  let error: string | null = null;
  let attempts = 0;

  for (attempts = 1; attempts <= 3; attempts++) {
    const tools: ToolSpec[] = [
      ...toolsBySlug(spec.libraryTools),
      ...customTools.map((t) => ({ slug: t.slug, source: t.code })),
    ];
    const agentSpec: AgentSpec = { id, name: spec.name, instructions: spec.instructions, model: m, tools };
    await generateAgent(agentSpec);
    const v = validateAgent(id);
    ok = v.ok;
    error = v.ok ? null : v.message;
    if (ok || customTools.length === 0) break;
    const fixed = await fixTools(m, customTools, v.message ?? "compile error");
    if (!fixed) break;
    customTools = fixed;
  }

  const meta: AgentMeta = {
    id,
    name: spec.name,
    prompt: spec.instructions,
    model: m,
    toolSlugs: [...spec.libraryTools, ...customTools.map((t) => t.slug)],
    createdAt: new Date().toISOString(),
  };
  await saveMeta(meta);
  return { agentId: id, name: spec.name, ok, error, attempts };
}

/** One turn of talking to Json. If Json decided to build, the agent is generated + self-corrected. */
export async function runJson(messages: ChatMsg[]): Promise<JsonResult> {
  const m = await getSettings();
  const content = await callModel(m, [{ role: "system", content: systemPrompt() }, ...messages]);
  const { text, spec } = extractBuild(content);
  if (!spec) return { reply: text };

  const build = await buildFromSpec(m, spec);
  const reply = build.ok
    ? `${text}\n\n✅ Built **${build.name}** — it's in your sidebar, ready to chat. Want to connect it to a channel, or build another?`
    : `${text}\n\n⚠️ I built **${build.name}** but a tool didn't compile after ${build.attempts} attempt(s): ${build.error}. Want me to try a simpler version?`;
  return { reply, build };
}
