import { designAgent } from "@/lib/designer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { idea } = (await req.json()) as { idea?: string };
  if (!idea || !idea.trim()) {
    return Response.json({ error: "Describe your idea in a line." }, { status: 400 });
  }
  try {
    return Response.json(await designAgent(idea.trim()));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
