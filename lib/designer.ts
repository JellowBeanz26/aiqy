import { getSettings } from "./store";
import { TOOL_LIBRARY } from "./tool-library";

export interface Draft {
  name: string;
  instructions: string;
  toolSlugs: string[];
}

/**
 * AI-assisted builder: turn a one-line idea into a drafted agent spec, using the
 * user's configured model. The draft is reviewed/editable in the UI before building.
 */
export async function designAgent(idea: string): Promise<Draft> {
  const m = await getSettings();
  const slugs = TOOL_LIBRARY.map((t) => t.slug);
  const toolList = TOOL_LIBRARY.map((t) => `- ${t.slug}: ${t.description}`).join("\n");

  const system = `You design AI agents. Given the user's idea, respond with ONLY a JSON object, no prose, no code fences:
{"name": "<3-4 word name>", "instructions": "<a clear, directive system prompt telling the agent how to behave>", "toolSlugs": [<zero or more of: ${slugs.map((s) => `"${s}"`).join(", ")}>]}

Available tools (pick only what the agent truly needs):
${toolList}

The built-in tools web_fetch, web_search, read_file and write_file are always available, so do NOT list them. Keep instructions concise and second-person ("You are …").`;

  const res = await fetch(`${m.baseURL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(m.apiKey ? { authorization: `Bearer ${m.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: m.modelId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: idea },
      ],
      stream: false,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    throw new Error(`The model could not be reached (${res.status}). Check your connection in Settings.`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data?.choices?.[0]?.message?.content ?? "";
  return parseDraft(content, new Set(slugs));
}

function parseDraft(content: string, valid: Set<string>): Draft {
  const match = content.match(/\{[\s\S]*\}/);
  let obj: { name?: unknown; instructions?: unknown; toolSlugs?: unknown };
  try {
    obj = JSON.parse(match ? match[0] : content);
  } catch {
    throw new Error("The model didn't return valid JSON. Try rephrasing your idea, or a stronger model.");
  }
  return {
    name: String(obj.name ?? "").trim().slice(0, 60) || "New agent",
    instructions: String(obj.instructions ?? "").trim() || "You are a helpful assistant.",
    toolSlugs: Array.isArray(obj.toolSlugs) ? obj.toolSlugs.map(String).filter((s) => valid.has(s)) : [],
  };
}
