import { stopAgent } from "@/lib/agent-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  stopAgent(id);
  return Response.json({ ok: true });
}
