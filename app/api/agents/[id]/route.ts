import { getState, stopAgent } from "@/lib/agent-manager";
import { deleteAgent, getMeta } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getMeta(id);
  if (!meta) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ meta, state: getState(id) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  stopAgent(id);
  await deleteAgent(id);
  return Response.json({ ok: true });
}
