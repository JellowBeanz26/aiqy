import { proxy } from "@/lib/agent-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  const { id, path } = await params;
  const search = new URL(req.url).search;
  const subpath = `/eve/${(path ?? []).join("/")}${search}`;
  try {
    return await proxy(id, subpath, req);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
