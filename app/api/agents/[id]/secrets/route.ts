import { stopAgent } from "@/lib/agent-manager";
import { deleteSecret, getMeta, listSecretNames, setSecret } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Names only — the client never receives secret values.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json({ names: await listSecretNames(id) });
}

// Store a secret locally and restart the agent so it picks up the new env. The value is
// written to .data (gitignored) and injected into the agent process — never into source,
// never sent back to the client or the model.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getMeta(id);
  if (!meta) return Response.json({ error: "not found" }, { status: 404 });

  const { name, value } = (await req.json()) as { name?: string; value?: string };
  const key = (name ?? "").trim();
  if (!key || typeof value !== "string" || value.trim().length === 0) {
    return Response.json({ error: "name and value are required" }, { status: 400 });
  }

  await setSecret(id, key, value.trim());
  stopAgent(id); // next request respawns the agent with the secret in its env
  return Response.json({ ok: true, names: await listSecretNames(id) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = (await req.json()) as { name?: string };
  if (name) {
    await deleteSecret(id, name.trim());
    stopAgent(id);
  }
  return Response.json({ ok: true, names: await listSecretNames(id) });
}
