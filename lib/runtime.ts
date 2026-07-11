import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { DATA_DIR, EVE_ENTRY } from "./paths";

// Shared Eve runtime, installed once into .data and shared by every generated agent
// (Node resolves up the tree). Every version is EXACT-pinned (no `^` ranges) so upstream
// Eve / AI-SDK releases can't change what an install pulls — you always get the exact set
// AIQY was tested against. To adopt a newer Eve, bump these numbers deliberately.
const SHARED_DEPS: Record<string, string> = {
  "@ai-sdk/openai-compatible": "3.0.6",
  ai: "7.0.18",
  eve: "0.22.5",
  zod: "4.4.3",
};

let installing: Promise<void> | null = null;

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the shared runtime is installed under .data/. Idempotent and concurrency-safe.
 * ~30s the first time; instant afterwards.
 */
export async function ensureSharedDeps(): Promise<void> {
  if (await exists(EVE_ENTRY)) return;
  if (installing) return installing;

  installing = (async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      `${DATA_DIR}/package.json`,
      JSON.stringify(
        {
          name: "aiqy-runtime",
          private: true,
          version: "0.0.0",
          type: "module",
          dependencies: SHARED_DEPS,
          overrides: { ai: "7.0.18" },
        },
        null,
        2,
      ),
    );
    await new Promise<void>((resolve, reject) => {
      const p = spawn("npm", ["install", "--no-audit", "--no-fund"], {
        cwd: DATA_DIR,
        stdio: "ignore",
        shell: process.platform === "win32",
      });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`npm install exited ${code}`))));
      p.on("error", reject);
    });
  })();

  try {
    await installing;
  } finally {
    installing = null;
  }
}

export function sharedDepsInstalled(): Promise<boolean> {
  return exists(EVE_ENTRY);
}
