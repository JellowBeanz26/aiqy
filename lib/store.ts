import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { AGENTS_DIR, DATA_DIR, SETTINGS_FILE, agentDir, agentMetaFile, agentSecretsFile } from "./paths";
import type { AgentMeta, ModelConfig } from "./types";

export const DEFAULT_MODEL: ModelConfig = {
  providerName: "local",
  baseURL: "http://127.0.0.1:11434/v1",
  apiKey: "",
  modelId: "llama3.1",
  contextWindow: 8192,
};

export async function getSettings(): Promise<ModelConfig> {
  try {
    return { ...DEFAULT_MODEL, ...JSON.parse(await readFile(SETTINGS_FILE, "utf8")) };
  } catch {
    return DEFAULT_MODEL;
  }
}

export async function saveSettings(cfg: ModelConfig): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(cfg, null, 2));
}

export async function saveMeta(meta: AgentMeta): Promise<void> {
  await mkdir(agentDir(meta.id), { recursive: true });
  await writeFile(agentMetaFile(meta.id), JSON.stringify(meta, null, 2));
}

export async function getMeta(id: string): Promise<AgentMeta | null> {
  try {
    return JSON.parse(await readFile(agentMetaFile(id), "utf8")) as AgentMeta;
  } catch {
    return null;
  }
}

export async function listAgents(): Promise<AgentMeta[]> {
  try {
    const entries = await readdir(AGENTS_DIR, { withFileTypes: true });
    const metas = await Promise.all(entries.filter((e) => e.isDirectory()).map((e) => getMeta(e.name)));
    return metas
      .filter((m): m is AgentMeta => Boolean(m))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function deleteAgent(id: string): Promise<void> {
  await rm(agentDir(id), { recursive: true, force: true });
}

/* ---- Per-agent secrets (API keys / tokens) — local only, never committed or sent to the model ---- */

export async function getSecrets(id: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(agentSecretsFile(id), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Names only — the client never receives secret values. */
export async function listSecretNames(id: string): Promise<string[]> {
  return Object.keys(await getSecrets(id));
}

export async function setSecret(id: string, name: string, value: string): Promise<void> {
  const secrets = await getSecrets(id);
  secrets[name] = value;
  await mkdir(agentDir(id), { recursive: true });
  await writeFile(agentSecretsFile(id), JSON.stringify(secrets, null, 2));
}

export async function deleteSecret(id: string, name: string): Promise<void> {
  const secrets = await getSecrets(id);
  if (!(name in secrets)) return;
  delete secrets[name];
  await writeFile(agentSecretsFile(id), JSON.stringify(secrets, null, 2));
}

/** Turn a name into a unique, filesystem-safe agent id. */
export async function makeAgentId(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 32) || "agent";
  const existing = new Set((await listAgents()).map((a) => a.id));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
