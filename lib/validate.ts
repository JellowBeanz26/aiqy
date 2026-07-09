import { spawnSync } from "node:child_process";
import { EVE_ENTRY, agentDir } from "./paths";
import type { Validation } from "./types";

/** Run `eve info --json` on a generated agent and return a structured verdict. */
export function validateAgent(id: string): Validation {
  const dir = agentDir(id);
  const res = spawnSync(process.execPath, [EVE_ENTRY, "info", "--json"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 120_000,
  });

  const stdout = res.stdout || "";
  const combined = `${stdout}\n${res.stderr || ""}`;
  const jsonStart = stdout.indexOf("{");

  let info: {
    status?: string;
    diagnostics?: { errors?: number; warnings?: number };
    model?: string;
    tools?: unknown[];
    channels?: { urlPath?: string }[];
  } | null = null;

  if (jsonStart >= 0) {
    try {
      info = JSON.parse(stdout.slice(jsonStart));
    } catch {
      info = null;
    }
  }

  if (info && info.status) {
    const errors = info.diagnostics?.errors ?? 0;
    return {
      ok: info.status === "ready" && errors === 0,
      status: info.status,
      errors,
      warnings: info.diagnostics?.warnings ?? 0,
      model: info.model ?? null,
      tools: info.tools ?? [],
      channels: (info.channels ?? []).map((c) => c.urlPath ?? "").filter(Boolean),
      message: null,
    };
  }

  const message =
    combined
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .find((s) => /cannot|error|enoent|failed|assertion|throw/i.test(s)) ||
    combined.trim().slice(0, 400) ||
    "eve info produced no output";

  return {
    ok: false,
    status: "failed",
    errors: 1,
    warnings: 0,
    model: null,
    tools: [],
    channels: [],
    message,
  };
}
