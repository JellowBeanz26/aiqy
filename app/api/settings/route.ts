import { getSettings, saveSettings } from "@/lib/store";
import type { ModelConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getSettings());
}

export async function PUT(req: Request) {
  const b = (await req.json()) as Partial<ModelConfig>;
  const cfg: ModelConfig = {
    providerName: String(b.providerName || "local"),
    baseURL: String(b.baseURL || "").trim(),
    apiKey: b.apiKey ? String(b.apiKey) : "",
    modelId: String(b.modelId || "").trim(),
    contextWindow: Number(b.contextWindow) || 8192,
  };
  if (!cfg.baseURL || !cfg.modelId) {
    return Response.json({ error: "Base URL and model id are required." }, { status: 400 });
  }
  await saveSettings(cfg);
  return Response.json(cfg);
}
