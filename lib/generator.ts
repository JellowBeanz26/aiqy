import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { agentDir } from "./paths";
import type { AgentSpec, ModelConfig } from "./types";

const EVE_VERSION = "0.22.1";
const DEPS = {
  "@ai-sdk/openai-compatible": "3.0.6",
  ai: "7.0.18",
  eve: EVE_VERSION,
  zod: "4.4.3",
};

function packageJson(spec: AgentSpec): string {
  return `${JSON.stringify(
    {
      name: `aiqy-agent-${spec.id}`,
      version: "0.0.0",
      private: true,
      type: "module",
      imports: { "#*": "./agent/*" },
      dependencies: DEPS,
    },
    null,
    2,
  )}\n`;
}

const TSCONFIG = `${JSON.stringify(
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
)}\n`;

// Model values are BAKED at generation time (Eve relocates agent.ts to a cache, so
// import.meta.url can't find a config file). process.env overrides allow live changes.
function agentTs(model: ModelConfig): string {
  return `import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";

const cfg = {
  providerName: process.env.MODEL_PROVIDER_NAME ?? ${JSON.stringify(model.providerName)},
  baseURL: process.env.MODEL_BASE_URL ?? ${JSON.stringify(model.baseURL)},
  // SECURITY: the API key is never baked into source. It is injected at runtime via
  // the process env by AIQY's agent manager (from .data, which is gitignored).
  apiKey: process.env.MODEL_API_KEY ?? "",
  modelId: process.env.MODEL_ID ?? ${JSON.stringify(model.modelId)},
  contextWindow: Number(process.env.MODEL_CONTEXT_WINDOW ?? "${model.contextWindow}"),
};

const provider = createOpenAICompatible({
  name: cfg.providerName,
  baseURL: cfg.baseURL,
  apiKey: cfg.apiKey,
});

export default defineAgent({
  model: provider(cfg.modelId),
  modelContextWindowTokens: cfg.contextWindow,
});
`;
}

const CHANNEL_TS = `import { localDev, placeholderAuth } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

export default eveChannel({ auth: [localDev(), placeholderAuth()] });
`;

/** Write a complete, compilable Eve agent directory. Preserves .eve? no — resets source. */
export async function generateAgent(spec: AgentSpec): Promise<string> {
  const dir = agentDir(spec.id);
  await rm(join(dir, "agent"), { recursive: true, force: true });
  await rm(join(dir, ".eve"), { recursive: true, force: true });
  await mkdir(join(dir, "agent", "tools"), { recursive: true });
  await mkdir(join(dir, "agent", "channels"), { recursive: true });

  await writeFile(join(dir, "package.json"), packageJson(spec));
  await writeFile(join(dir, "tsconfig.json"), TSCONFIG);
  await writeFile(join(dir, "agent", "agent.ts"), agentTs(spec.model));
  await writeFile(join(dir, "agent", "instructions.md"), `# Identity\n\n${spec.instructions}\n`);
  await writeFile(join(dir, "agent", "channels", "eve.ts"), CHANNEL_TS);

  for (const tool of spec.tools) {
    await writeFile(join(dir, "agent", "tools", `${tool.slug}.ts`), tool.source);
  }

  return dir;
}
