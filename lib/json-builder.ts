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
  missingTools: string[];
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

Custom-tool rules (follow EXACTLY — the file must compile):
- The file MUST end with \`export default defineTool({ ... })\`.
- Imports: \`import { defineTool } from "eve/tools";\` \`import { never } from "eve/tools/approval";\` \`import { z } from "zod";\`.
- \`approval: never()\`, a one-line \`description\`, and an \`inputSchema\` are ALL required. If the tool takes no input, use \`inputSchema: z.object({})\` — never \`z.object()\`.
- \`execute\` is async and MUST return an OBJECT (e.g. \`return { result };\`), never a bare number/string.
- Do NOT put code inside the json block. Only output the json + code blocks when you actually intend to build now.`;
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

interface Fence {
  lang: string;
  body: string;
}

/** Parse fenced blocks line-by-line. Keying a regex on ``` mis-pairs opening and closing
 *  fences: a ```json plan block before ```ts code makes the engine pair the json's CLOSING
 *  fence with a later fence and swallow the ```ts opener — so the tool's first line reads
 *  "```ts" instead of "// tool: <slug>" and the tool is silently dropped. Scanning
 *  line-by-line is fence-accurate and immune to that. */
function parseFences(content: string): Fence[] {
  const fences: Fence[] = [];
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(/^\s*```+\s*([a-zA-Z0-9]*)\s*$/);
    if (open) {
      const lang = open[1].toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence line
      fences.push({ lang, body: body.join("\n") });
    } else {
      i++;
    }
  }
  return fences;
}

/** Drop every fenced block, leaving only the conversational prose. */
function stripFences(content: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of content.split("\n")) {
    if (/^\s*```+/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out.join("\n").trim();
}

const CODE_LANGS = new Set(["ts", "typescript", "tsx", "js", "javascript", ""]);

/** A tool file only counts if it actually default-exports a defineTool call. Guards against
 *  weaker models emitting a named export, a bare function, or garbage — which Eve rejects
 *  with "does not match the public eve shape". */
function isPlausibleTool(code: string): boolean {
  return /export\s+default\s+defineTool\s*\(/.test(code);
}

/** slug -> code from code fences. Primary signal: a "// tool: <slug>" marker on the first
 *  non-empty line. Fallback for weaker models that omit the marker: assign leftover code
 *  fences to wanted slugs that still have no code, in order. */
function extractCodeBlocks(fences: Fence[], wantedSlugs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const unlabeled: string[] = [];
  for (const f of fences) {
    if (!CODE_LANGS.has(f.lang)) continue;
    if (f.lang === "" && !/defineTool|\/\/\s*tool:/i.test(f.body)) continue; // not a tool block
    const firstLine = f.body.split("\n").find((l) => l.trim().length > 0) ?? "";
    const slugMatch = firstLine.match(/\/\/\s*tool:\s*([a-z0-9_]+)/i);
    if (slugMatch) map.set(slugMatch[1].toLowerCase(), f.body.trim());
    else unlabeled.push(f.body.trim());
  }
  for (const slug of wantedSlugs) {
    if (map.has(slug) || unlabeled.length === 0) continue;
    map.set(slug, unlabeled.shift() as string);
  }
  return map;
}

function extractBuild(content: string): { text: string; spec: BuildSpec | null; missing: string[] } {
  const fences = parseFences(content);
  const jsonFence =
    fences.find((f) => f.lang === "json") ??
    fences.find((f) => {
      try {
        return (JSON.parse(f.body) as { build?: unknown }).build === true;
      } catch {
        return false;
      }
    });
  if (!jsonFence) return { text: content.trim(), spec: null, missing: [] };

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonFence.body.trim());
  } catch {
    return { text: content.trim(), spec: null, missing: [] };
  }
  if (obj.build !== true) return { text: stripFences(content) || content.trim(), spec: null, missing: [] };

  const validLib = new Set(TOOL_LIBRARY.map((t) => t.slug));
  const wantedCustom = (Array.isArray(obj.customTools) ? (obj.customTools as unknown[]) : [])
    .map((slug) => String(slug).replace(/[^a-z0-9_]/gi, "_").toLowerCase())
    .filter((slug) => slug.length > 0);

  const codeBlocks = extractCodeBlocks(fences, wantedCustom);
  const customTools: CustomTool[] = wantedCustom
    .map((slug) => ({ slug, code: codeBlocks.get(slug) ?? "" }))
    .filter((t) => isPlausibleTool(t.code));
  const missing = wantedCustom.filter((slug) => !customTools.some((t) => t.slug === slug));

  const spec: BuildSpec = {
    name: String(obj.name ?? "New agent").slice(0, 60) || "New agent",
    instructions: String(obj.instructions ?? "You are a helpful assistant."),
    libraryTools: Array.isArray(obj.libraryTools)
      ? (obj.libraryTools as unknown[]).map(String).filter((s) => validLib.has(s))
      : [],
    customTools,
  };

  return { text: stripFences(content) || `Building “${spec.name}”…`, spec, missing };
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
  const map = extractCodeBlocks(parseFences(content), tools.map((t) => t.slug));
  // Only accept a rewrite that is still a valid tool — a weak model's "fix" is often worse
  // (named export, missing defineTool). Keep the prior code when the candidate is garbage.
  const fixed = tools.map((t) => {
    const cand = map.get(t.slug);
    return { slug: t.slug, code: cand && isPlausibleTool(cand) ? cand : t.code };
  });
  return fixed.some((t, i) => t.code !== tools[i].code) ? fixed : null;
}

/** A planned tool whose code never arrived (weaker models sometimes emit only the plan):
 *  ask the model once, specifically, for the missing tool code — so we never ship an agent
 *  silently missing the tool it was built around. */
async function recoverMissingTools(m: ModelConfig, spec: BuildSpec, slugs: string[]): Promise<CustomTool[]> {
  const content = await callModel(
    m,
    [
      {
        role: "system",
        content:
          'You write Eve tool files (TypeScript). For EACH requested tool output ONE ```ts block whose FIRST line is "// tool: <slug>". Rules: default-export defineTool; import from "eve/tools", "eve/tools/approval", and "zod"; give a zod inputSchema (use z.object({}) when it takes no input) and an async execute; use approval: never(). No prose — only the code blocks.',
      },
      {
        role: "user",
        content: `Agent “${spec.name}”. Instructions: ${spec.instructions}\n\nWrite these tools: ${slugs.join(", ")}`,
      },
    ],
    0.2,
  );
  const map = extractCodeBlocks(parseFences(content), slugs);
  return slugs.map((slug) => ({ slug, code: map.get(slug) ?? "" })).filter((t) => isPlausibleTool(t.code));
}

async function buildFromSpec(m: ModelConfig, spec: BuildSpec, missing: string[]): Promise<BuildResult> {
  const id = await makeAgentId(spec.name);
  let customTools = spec.customTools;

  let stillMissing = missing;
  if (stillMissing.length > 0) {
    const recovered = await recoverMissingTools(m, spec, stillMissing);
    customTools = [...customTools, ...recovered];
    stillMissing = stillMissing.filter((slug) => !recovered.some((t) => t.slug === slug));
  }

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
  // "ok" means we built what was asked: it compiles AND no planned tool is missing.
  return { agentId: id, name: spec.name, ok: ok && stillMissing.length === 0, error, attempts, missingTools: stillMissing };
}

/** One turn of talking to Json. If Json decided to build, the agent is generated + self-corrected. */
export async function runJson(messages: ChatMsg[]): Promise<JsonResult> {
  const m = await getSettings();
  const content = await callModel(m, [{ role: "system", content: systemPrompt() }, ...messages]);
  const { text, spec, missing } = extractBuild(content);
  if (!spec) return { reply: text };

  const build = await buildFromSpec(m, spec, missing);
  let reply: string;
  if (build.ok) {
    reply = `${text}\n\n✅ Built **${build.name}** — it's in your sidebar, ready to chat. Want to connect it to a channel, or build another?`;
  } else if (build.missingTools.length > 0) {
    const s = build.missingTools.length > 1 ? "s" : "";
    reply = `${text}\n\n⚠️ I built **${build.name}**, but I couldn't write the \`${build.missingTools.join("`, `")}\` tool${s} it needs. Want me to try again, or describe what the tool should do?`;
  } else {
    reply = `${text}\n\n⚠️ I built **${build.name}** but a tool didn't compile after ${build.attempts} attempt(s): ${build.error}. Want me to try a simpler version?`;
  }
  return { reply, build };
}
