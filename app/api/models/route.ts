import { type ProviderInfo, detectProvider, fetchModels } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { apiKey?, baseURL? } -> { provider, models }.
 * - With a cloud key: auto-detect the provider and list its live models.
 * - With just a baseURL (e.g. local Ollama http://127.0.0.1:11434/v1): list local models.
 */
export async function POST(req: Request) {
  const { apiKey, baseURL } = (await req.json()) as { apiKey?: string; baseURL?: string };
  const key = (apiKey ?? "").trim();

  let provider: ProviderInfo | null = null;
  if (key) {
    provider = detectProvider(key, baseURL);
  } else if (baseURL && baseURL.trim()) {
    provider = { id: "local", label: "Local", baseURL: baseURL.trim(), defaultContextWindow: 8192 };
  }

  if (!provider) {
    return Response.json({ error: "Paste an API key, or a base URL for a local/custom endpoint." }, { status: 400 });
  }

  try {
    const models = await fetchModels(provider, key);
    return Response.json({ provider, models });
  } catch (e) {
    return Response.json({ provider, models: [], error: (e as Error).message }, { status: 200 });
  }
}
