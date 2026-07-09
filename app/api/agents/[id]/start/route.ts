import { startAgent } from "@/lib/agent-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const state = await startAgent(id);
    return Response.json({ state });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
