# Contributing to AIQY

Thanks for your interest — AIQY is an open-source, self-hostable AI agent builder, and
contributions are very welcome.

## Getting started

Requirements: **Node.js ≥ 24**.

```bash
git clone https://github.com/JellowBeanz26/aiqy.git
cd aiqy
npm install
npm run dev   # http://localhost:4300
```

See the [README](./README.md) for how it works and how to connect a model.

## Good ways to help

- 🐛 **Report bugs** or 💡 **request features** via [Issues](../../issues).
- 🧰 **Add a tool** to the built-in library — see `lib/tool-library.ts`.
- 🔌 **Add a model provider** — see `lib/providers.ts` (auto-detection + model listing).
- 🤖 **Improve Json** (the chat builder), the generator, or the UI.
- 📖 **Improve the docs.**

## Pull requests

1. Fork the repo and create a focused branch.
2. Keep changes small and self-contained.
3. Make sure it builds: `npm run build` must pass (and `npx tsc --noEmit` for types).
4. Open a PR describing **what** changed and **why**.

Be kind and constructive — see the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Project layout

| Path | What |
| --- | --- |
| `app/` | Next.js UI + API routes |
| `lib/generator.ts` | writes an Eve agent from a spec |
| `lib/validate.ts` | compiles + returns diagnostics |
| `lib/agent-manager.ts` | runs one `eve dev` per agent + proxy |
| `lib/json-builder.ts` | Json — the chat-first, code-writing builder |
| `lib/providers.ts` | universal model connector |
