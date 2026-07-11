#!/usr/bin/env node
// AIQY Eve-compatibility gate.
//
// Generates a representative agent that exercises every Eve API surface AIQY depends on
// (defineAgent + createOpenAICompatible + modelContextWindowTokens for the BYO-model moat,
// defineTool + never() for tools, eveChannel + localDev/placeholderAuth for channels),
// installs Eve at a given version, and runs `eve info` to prove it still compiles.
//
// This is the linchpin of the "curate upstream Eve updates" strategy: if a new Eve release
// breaks any shape AIQY relies on, `eve info` fails here — BEFORE it reaches a user.
//
// Usage:
//   node scripts/smoke.mjs                 # test the pinned Eve version (from lib/generator.ts)
//   EVE_VERSION=0.23.0 node scripts/smoke.mjs   # test a candidate version (weekly bump job)

import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");

/** Read the exact dependency pins straight from the generator, so the smoke agent always
 *  matches what AIQY actually ships. EVE_VERSION can override eve for the weekly bump test. */
function readPins() {
  const src = readFileSync(join(ROOT, "lib", "generator.ts"), "utf8");
  const match = (re, label) => {
    const m = src.match(re);
    if (!m) throw new Error(`Could not read the pinned version for "${label}" from lib/generator.ts`);
    return m[1];
  };
  return {
    "@ai-sdk/openai-compatible": match(/"@ai-sdk\/openai-compatible"\s*:\s*"([^"]+)"/, "@ai-sdk/openai-compatible"),
    ai: match(/^\s*ai\s*:\s*"([^"]+)"/m, "ai"),
    eve: process.env.EVE_VERSION || match(/EVE_VERSION\s*=\s*"([^"]+)"/, "eve"),
    zod: match(/^\s*zod\s*:\s*"([^"]+)"/m, "zod"),
  };
}

const AGENT_TS = `import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";

const provider = createOpenAICompatible({
  name: "local",
  baseURL: "http://127.0.0.1:11434/v1",
  apiKey: "",
});

export default defineAgent({
  model: provider("smoke-model"),
  modelContextWindowTokens: 8192,
});
`;

const CHANNEL_TS = `import { localDev, placeholderAuth } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

export default eveChannel({ auth: [localDev(), placeholderAuth()] });
`;

const TOOL_TS = `import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";

export default defineTool({
  approval: never(),
  description: "Echo the input text back.",
  inputSchema: z.object({ text: z.string() }),
  async execute({ text }) {
    return { echoed: text };
  },
});
`;

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ["agent/**/*.ts", ".eve/**/*.d.ts"],
  },
  null,
  2,
);

/** eve prints a banner before the JSON; extract the JSON object defensively. */
function parseEveJson(out) {
  try {
    return JSON.parse(out);
  } catch {
    const start = out.indexOf("{");
    const end = out.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error(`No JSON in eve output:\n${out}`);
    return JSON.parse(out.slice(start, end + 1));
  }
}

function fail(msg, extra) {
  console.error(`\n❌ SMOKE FAILED: ${msg}`);
  if (extra) console.error(extra);
  process.exit(1);
}

const deps = readPins();
console.log(`→ Eve compatibility smoke test`);
console.log(`  pins: ${Object.entries(deps).map(([k, v]) => `${k}@${v}`).join(", ")}`);

const dir = mkdtempSync(join(tmpdir(), "aiqy-smoke-"));
try {
  mkdirSync(join(dir, "agent", "tools"), { recursive: true });
  mkdirSync(join(dir, "agent", "channels"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "aiqy-smoke-agent",
        version: "0.0.0",
        private: true,
        type: "module",
        imports: { "#*": "./agent/*" },
        dependencies: deps,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(dir, "tsconfig.json"), `${TSCONFIG}\n`);
  writeFileSync(join(dir, "agent", "agent.ts"), AGENT_TS);
  writeFileSync(join(dir, "agent", "instructions.md"), "# Identity\n\nYou are a smoke-test agent.\n");
  writeFileSync(join(dir, "agent", "channels", "eve.ts"), CHANNEL_TS);
  writeFileSync(join(dir, "agent", "tools", "echo.ts"), TOOL_TS);

  console.log(`→ installing (${dir})…`);
  execSync("npm install --no-audit --no-fund --no-package-lock --loglevel=error", { cwd: dir, stdio: "inherit" });

  console.log(`→ running \`eve info --json\`…`);
  const eveBin = join(dir, "node_modules", "eve", "bin", "eve.js");
  const out = execFileSync("node", [eveBin, "info", "--json"], { cwd: dir, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const info = parseEveJson(out);

  const errors = info?.diagnostics?.errors ?? [];
  if (info?.status !== "ready") fail(`expected status "ready", got "${info?.status}"`, JSON.stringify(info?.diagnostics ?? info, null, 2));
  if (errors.length > 0) fail(`${errors.length} compile error(s)`, JSON.stringify(errors, null, 2));

  const toolNames = (info?.tools ?? []).map((t) => t.name ?? t.slug ?? t).join(", ");
  const channelNames = (info?.channels ?? []).map((c) => c.name ?? c.type ?? c).join(", ");
  console.log(`\n✅ SMOKE PASSED — eve@${deps.eve} compiles AIQY's agent shape.`);
  console.log(`   status: ${info.status} · tools: [${toolNames}] · channels: [${channelNames}]`);
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}
