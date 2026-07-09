// Universal API connector: detect the provider from an API key and fetch its live
// model list. Every provider is reached through its OpenAI-compatible endpoint, so
// the agent generator (createOpenAICompatible) works unchanged for all of them.

export interface ProviderInfo {
  id: string;
  label: string;
  /** OpenAI-compatible base URL the generated agent talks to. */
  baseURL: string;
  defaultContextWindow: number;
}

const PROVIDERS: { test: (k: string) => boolean; info: ProviderInfo }[] = [
  {
    test: (k) => k.startsWith("sk-ant-"),
    info: { id: "anthropic", label: "Anthropic (Claude)", baseURL: "https://api.anthropic.com/v1", defaultContextWindow: 200000 },
  },
  {
    test: (k) => k.startsWith("AIza"),
    info: { id: "google", label: "Google (Gemini)", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", defaultContextWindow: 1000000 },
  },
  {
    test: (k) => k.startsWith("gsk_"),
    info: { id: "groq", label: "Groq", baseURL: "https://api.groq.com/openai/v1", defaultContextWindow: 128000 },
  },
  {
    test: (k) => k.startsWith("sk-or-"),
    info: { id: "openrouter", label: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", defaultContextWindow: 128000 },
  },
  {
    // OpenAI keys: sk-... / sk-proj-... (checked last so more specific prefixes win)
    test: (k) => k.startsWith("sk-"),
    info: { id: "openai", label: "OpenAI (GPT)", baseURL: "https://api.openai.com/v1", defaultContextWindow: 128000 },
  },
];

/** Detect the provider from a key. If nothing matches but a base URL is given, treat as custom. */
export function detectProvider(key: string, baseURL?: string): ProviderInfo | null {
  const k = key.trim();
  for (const p of PROVIDERS) if (p.test(k)) return p.info;
  if (baseURL && baseURL.trim()) {
    return { id: "custom", label: "Custom (OpenAI-compatible)", baseURL: baseURL.trim(), defaultContextWindow: 32000 };
  }
  return null;
}

interface OpenAIModelList {
  data?: { id?: string }[];
}
interface GoogleModelList {
  models?: { name?: string }[];
}

/** Fetch the provider's live model list. */
export async function fetchModels(p: ProviderInfo, key: string): Promise<string[]> {
  if (p.id === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (!r.ok) throw new Error(`Anthropic returned ${r.status} — check the key.`);
    const d = (await r.json()) as OpenAIModelList;
    return (d.data ?? []).map((m) => m.id ?? "").filter(Boolean);
  }

  if (p.id === "google") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`);
    if (!r.ok) throw new Error(`Google returned ${r.status} — check the key.`);
    const d = (await r.json()) as GoogleModelList;
    return (d.models ?? [])
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter((n) => /gemini|gemma/i.test(n));
  }

  // OpenAI-compatible (OpenAI, Groq, OpenRouter, custom, and local Ollama)
  const headers: Record<string, string> = {};
  if (key) headers.authorization = `Bearer ${key}`;
  const r = await fetch(`${p.baseURL.replace(/\/+$/, "")}/models`, { headers });
  if (!r.ok) throw new Error(`${p.label} returned ${r.status} — check the key/URL.`);
  const d = (await r.json()) as OpenAIModelList;
  return (d.data ?? []).map((m) => m.id ?? "").filter(Boolean);
}
