export interface ModelConfig {
  /** Display/provider name, e.g. "local", "openai", "anthropic". */
  providerName: string;
  /** OpenAI-compatible base URL, e.g. http://127.0.0.1:11434/v1 (Ollama). */
  baseURL: string;
  /** API key (may be empty/placeholder for local models). */
  apiKey?: string;
  /** Model id at the endpoint, e.g. "llama3.1". */
  modelId: string;
  /** Context window in tokens — REQUIRED so Eve skips the Vercel Gateway catalog. */
  contextWindow: number;
}

export interface ToolSpec {
  slug: string;
  source: string;
}

/** A credential an agent needs at runtime (an API key, bot token, …). The value is stored
 *  locally in .data (gitignored), injected into the agent's process env at spawn, and NEVER
 *  written into source or sent to the model. */
export interface SecretSpec {
  /** Env var name the tool code reads via process.env, e.g. "OPENWEATHER_API_KEY". */
  name: string;
  /** What it's for, shown to the user. */
  description: string;
  /** Short step-by-step on how to obtain it. */
  howto: string;
}

export interface AgentSpec {
  id: string;
  name: string;
  instructions: string;
  model: ModelConfig;
  tools: ToolSpec[];
}

export interface AgentMeta {
  id: string;
  name: string;
  prompt: string;
  model: ModelConfig;
  toolSlugs: string[];
  createdAt: string;
}

export interface Validation {
  ok: boolean;
  status: string;
  errors: number;
  warnings: number;
  model: string | null;
  tools: unknown[];
  channels: string[];
  message: string | null;
}

export interface RunningState {
  running: boolean;
  ready: boolean;
  port: number | null;
}
