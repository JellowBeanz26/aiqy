# Security Policy

AIQY is a **single-user, self-hosted** tool. Its trust model (also in the README):

- **Your keys stay local** — API keys live only under `.data/` (gitignored, never
  committed) and are injected into agents at runtime via the process environment; they are
  never written into an agent's source files.
- **Generated tool code is real code** — agents (and Json) can generate tools whose
  `execute()` runs in the agent process with your user's permissions. Build and run only
  agents you trust.
- **Nothing is exposed by default** — AIQY listens on localhost and agents run as local
  processes. If you deploy it beyond your machine, add authentication and isolate the agent
  processes (e.g. one container per agent).

## Reporting a vulnerability

Please report security issues **privately** using GitHub's
[**Report a vulnerability**](../../security/advisories/new) button on the Security tab —
not a public issue. We'll acknowledge and respond as soon as we can. Thank you for helping
keep AIQY and its users safe.
