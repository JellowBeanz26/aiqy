import { type ChatMsg, runJson } from "@/lib/json-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages?: ChatMsg[] };
  if (!Array.isArray(messages)) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }
  try {
    return Response.json(await runJson(messages));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
