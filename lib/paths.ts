import { join } from "node:path";

/** Project root when Next runs (the aiqy/ dir). */
export const PROJECT_ROOT = process.cwd();

/** All AIQY runtime data lives here (gitignored). */
export const DATA_DIR = join(PROJECT_ROOT, ".data");

/** Generated agents live here, one dir per agent id. */
export const AGENTS_DIR = join(DATA_DIR, "agents");

/** Shared node_modules — installed ONCE; agents resolve Eve up the tree. */
export const SHARED_NM = join(DATA_DIR, "node_modules");

/** The eve CLI entry inside the shared install. */
export const EVE_ENTRY = join(SHARED_NM, "eve", "bin", "eve.js");

/** Global BYO model config. */
export const SETTINGS_FILE = join(DATA_DIR, "settings.json");

export const agentDir = (id: string): string => join(AGENTS_DIR, id);
export const agentMetaFile = (id: string): string => join(agentDir(id), "meta.json");
/** Per-agent secrets (API keys / tokens). Lives at the agent root, so it SURVIVES a
 *  regenerate (generateAgent only wipes agent/ and .eve/). Never committed (.data is gitignored). */
export const agentSecretsFile = (id: string): string => join(agentDir(id), "secrets.json");
