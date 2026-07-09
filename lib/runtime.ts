import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { DATA_DIR, EVE_ENTRY } from "./paths";

/** Deps installed ONCE at .data/ and shared by every generated agent (Node resolves up the tree). */
const SHARED_DEPS: Record<string, string> = {
  "@ai-sdk/openai-compatible": "^3.0.6", // v3.x = AI SDK v7 line (verified)
  ai: "^7.0.0",
  eve: "0.22.1", // pinned — Eve is 0.x, fast-moving
  zod: "^4.4.3",
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
 * Ensure the shared Eve runtime is installed under .data/. Idempotent and
 * concurrency-safe: the first caller runs `npm install`, others await it.
 * ~30s the very first time; instant afterwards.
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
          overrides: { ai: "^7.0.0" },
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
