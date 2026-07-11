<p align="center">
  <img src="assets/logo.svg" alt="AIQY — the open agent studio" width="460" />
</p>

<p align="center">
  <strong>Describe an agent in plain language — AIQY builds and runs a real, durable AI agent on <em>your own</em> model.</strong>
</p>

<p align="center">
  <a href="#installation">Install</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#security">Security</a> ·
  <a href="#built-on-eve">Built on Eve</a>
</p>

AIQY is an open-source, self-hostable studio for building AI agents. You write what
the agent should do, pick a few tools, and AIQY generates a real agent, compiles it,
and runs it — all on a model _you_ connect (any OpenAI-compatible endpoint, including
local Ollama / LM Studio / vLLM). No cloud lock-in, no keys leaving your machine.

Under the hood AIQY builds on [**Eve**](https://github.com/vercel/eve), Vercel's
open-source agent framework, and reuses its durable runtime, sandbox, and channels —
so AIQY focuses on the layer Eve doesn't have: a visual, model-agnostic builder for
everyone, not just developers.

Or just **talk to Json** — a chat-first builder that designs the agent, writes the tool
code itself (compiling and self-correcting until it works), and builds it while you
describe what you want.

<p align="center">
  <img src="assets/demo.gif" alt="Talk to Json — it designs, writes, and builds your agent" width="820" />
</p>

---

## Why AIQY

- **Bring your own model.** Any OpenAI-compatible endpoint — local or cloud. AIQY runs
  entirely outside the Vercel AI Gateway (the thing that normally ties Eve to Vercel).
- **Real agents, not toy flows.** Every agent is a genuine Eve project with durable
  execution, tools, and a running HTTP endpoint — generated as inspectable files.
- **Instant.** Dependencies install once; each new agent is just files, created in an
  instant.
- **Self-hosted & private.** Runs on your machine. Your model, your keys, your data.
- **Open source.** MIT licensed. Fork it, extend it, ship it.

## Installation

### Prerequisites

- **Node.js ≥ 24** — [download here](https://nodejs.org).
- **A model** — either a local model via [Ollama](https://ollama.com) (free & private) or a
  cloud API key (OpenAI, Anthropic, Google, Groq, OpenRouter). You can set this up after install.

### 1. Get the code

```bash
git clone https://github.com/JellowBeanz26/aiqy.git
cd aiqy
```

_(Or download the ZIP from the green **Code** button on GitHub and unzip it.)_

### 2. Install & run

```bash
npm install
npm run dev
```

Open **http://localhost:4300**. The first run installs a shared Eve runtime once (~30s — one time only).

> **Pinned & reproducible.** AIQY installs Eve and the AI SDK at **exact** versions (no floating `^` ranges), so upstream releases can never change what your install pulls — you always get the exact set AIQY was tested against. You never install Eve by hand; AIQY does it for you.

### 3. Connect a model

In **Settings**, pick one:

- **Local — free & private.** Install [Ollama](https://ollama.com), then pull a model:
  ```bash
  ollama pull qwen2.5:3b     # small & fast — good on a laptop CPU
  ```
  In Settings → **Local model** → **Connect** (`http://127.0.0.1:11434/v1`) → choose the model.
- **Cloud — fast & powerful.** Settings → **Cloud API** → paste any key
  (`sk-…` OpenAI, `sk-ant-…` Anthropic, `AIza…` Google, `gsk_…` Groq, `sk-or-…` OpenRouter).
  AIQY detects the provider and lists its models automatically.

> On a CPU-only machine, prefer ~3B–7B local models (or an MoE like `qwen3:30b-a3b`), or use a
> cloud key for the biggest models.

### 4. Build an agent

- **Talk to Json** — describe what you want in the chat; Json designs it, writes any tools it
  needs, and builds it.
- Or **New agent** — write the instructions, pick tools, and hit **Build agent**.

Then chat with your agent. That's it. 🎉

## How it works

```
┌──────────────────────────────────────────────────────────┐
│  AIQY (Next.js, single-user, self-hosted)                 │
│  • Settings (BYO model)  • Builder  • Agents + chat        │
│  • Agent Manager: one `eve dev` process per agent,         │
│    proxied at /api/agents/:id/eve/**                       │
└───────────────┬───────────────────────────┬──────────────┘
                │ generates files            │ proxies HTTP
        ┌───────▼────────┐          ┌────────▼─────────┐
        │ Generator      │          │ Generated agent  │  (Eve project,
        │ (spec → files) │          │  running on your │   BYO model,
        │ + validator    │          │  model)          │   durable runtime)
        └────────────────┘          └──────────────────┘
```

- **Generator** (`lib/generator.ts`) writes a complete Eve agent from a spec. The model
  is configured via a baked `defineAgent({ model: createOpenAICompatible(...), modelContextWindowTokens })`
  — the `modelContextWindowTokens` is what lets Eve skip the Vercel model catalog and use
  any endpoint.
- **Validator** (`lib/validate.ts`) runs `eve info --json` and returns a structured verdict.
- **Agent Manager** (`lib/agent-manager.ts`) spawns and supervises one `eve dev` process
  per agent and proxies its HTTP API.
- **Chat client** (`lib/eve-client.ts`) drives an Eve session (POST create + NDJSON stream).

Generated agents and settings live under `.data/` (gitignored).

## Tool library

The built-in Eve framework tools (`web_fetch`, `web_search`, `bash`, `read_file`,
`write_file`, …) are available to every agent for free. AIQY adds a small curated
library for the gaps (`lib/tool-library.ts`): `http_request` (call any API),
`get_current_time`, and more to come.

## Roadmap

- [x] Bring-your-own-model (local + cloud), builder, run/chat, self-correct validation.
- [ ] AI-assisted builder — turn a one-liner into instructions + tool selection.
- [ ] Studio — a visual run dashboard (session/turn/step waterfall + token/cost).
- [ ] More channels (Slack, Telegram, WhatsApp, email) and a one-command Docker deploy.

## Security

AIQY is a **single-user, self-hosted** tool. Its security model:

- **Your keys stay local.** API keys live only under `.data/` (gitignored, never
  committed) and are injected into agents at runtime via the process environment — they
  are **never written into an agent's source files**.
- **Generated tool code is real code.** Agents (and Json) can generate tools whose
  `execute()` runs in the agent's Node process with your user's permissions. Build and
  run only agents you trust — treat it like running code you wrote.
- **Nothing is exposed by default.** AIQY listens on localhost and agents run as local
  processes. If you deploy it beyond your own machine, add authentication and isolate the
  agent processes (e.g. one container per agent).

## Screenshots

| Run + live trace | Talk to Json | Connect any model |
| --- | --- | --- |
| ![chat](assets/chat.png) | ![json](assets/json.png) | ![settings](assets/settings.png) |

## Built on Eve

AIQY is an independent open-source project built on top of
[Eve](https://github.com/vercel/eve) by Vercel (Apache-2.0). It uses Eve as a
dependency and does not redistribute Eve's source. "Eve" and "Vercel" are
trademarks of Vercel, Inc.; AIQY is not affiliated with or endorsed by Vercel.
See [`NOTICE`](./NOTICE).

## License

MIT — see [`LICENSE`](./LICENSE).
