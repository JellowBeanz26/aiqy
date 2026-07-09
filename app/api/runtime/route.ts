import { ensureSharedDeps, sharedDepsInstalled } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ installed: await sharedDepsInstalled() });
}

export async function POST() {
  try {
    await ensureSharedDeps();
    return Response.json({ installed: true });
  } catch (e) {
    return Response.json({ installed: false, error: (e as Error).message }, { status: 500 });
  }
}
