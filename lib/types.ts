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
