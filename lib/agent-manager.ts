import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { EVE_ENTRY, agentDir } from "./paths";
import type { RunningState } from "./types";

interface Running {
  id: string;
  port: number;
  proc: ChildProcess;
  ready: boolean;
  log: string;
  startedAt: number;
}

// Singleton registry that survives HMR / multiple route modules in Next.
const g = globalThis as unknown as { __aiqy_registry?: Map<string, Running>; __aiqy_port?: number };
const registry: Map<string, Running> = (g.__aiqy_registry ??= new Map());

function allocatePort(): number {
  const used = new Set([...registry.values()].map((r) => r.port));
  let port = g.__aiqy_port ?? 43500;
  while (used.has(port)) port++;
  g.__aiqy_port = port + 1;
  return port;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function getState(id: string): RunningState {
  const r = registry.get(id);
  return { running: !!r, ready: r?.ready ?? false, port: r?.port ?? null };
}

export function getLog(id: string): string {
  return registry.get(id)?.log ?? "";
}

export async function startAgent(id: string): Promise<RunningState> {
  const existing = registry.get(id);
  if (existing) {
    if (!existing.ready) await waitReady(id, 90_000);
    return getState(id);
  }

  const port = allocatePort();
  const proc = spawn(process.execPath, [EVE_ENTRY, "dev", "--no-ui", "--port", String(port)], {
    cwd: agentDir(id),
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  const running: Running = { id, port, proc, ready: false, log: "", startedAt: Date.now() };
  proc.stdout?.on("data", (d: Buffer) => (running.log += d.toString()));
  proc.stderr?.on("data", (d: Buffer) => (running.log += d.toString()));
  proc.on("exit", () => {
    if (registry.get(id) === running) registry.delete(id);
  });
  registry.set(id, running);

  await waitReady(id, 90_000);
  return getState(id);
}

async function waitReady(id: string, timeoutMs: number): Promise<void> {
  const r = registry.get(id);
  if (!r) throw new Error(`agent ${id} is not running`);
  if (r.ready) return;
  const url = `http://127.0.0.1:${r.port}/eve/v1/info`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        r.ready = true;
        return;
      }
    } catch {
      // not up yet
    }
    await sleep(400);
  }
  stopAgent(id);
  throw new Error(`agent ${id} failed to become ready:\n${r.log.slice(-1200)}`);
}

export function stopAgent(id: string): void {
  const r = registry.get(id);
  if (!r) return;
  registry.delete(id);
  const pid = r.proc.pid;
  if (pid == null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      r.proc.kill("SIGKILL");
    }
  }
}

export async function ensureStarted(id: string): Promise<RunningState> {
  const s = getState(id);
  if (s.running && s.ready) return s;
  return startAgent(id);
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/** Proxy an /eve/v1/** request to the agent's running dev server (auto-starts it). */
export async function proxy(id: string, subpath: string, req: Request): Promise<Response> {
  const s = await ensureStarted(id);
  const target = `http://127.0.0.1:${s.port}${subpath}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
  });

  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const outHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) outHeaders.set(k, v);
  });
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}
