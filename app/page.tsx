"use client";

import { useCallback, useEffect, useState } from "react";
import Chat from "./_components/Chat";
import { TOOL_LIBRARY } from "@/lib/tool-library";
import type { AgentMeta, ModelConfig, Validation } from "@/lib/types";

type Mode = "builder" | "settings" | "agent";

export default function Page() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [settings, setSettings] = useState<ModelConfig | null>(null);
  const [mode, setMode] = useState<Mode>("builder");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ops, setOps] = useState(0);

  const refreshAgents = useCallback(async () => {
    const r = await fetch("/api/agents");
    if (r.ok) setAgents((await r.json()) as AgentMeta[]);
  }, []);

  useEffect(() => {
    void (async () => {
      const [rt, s] = await Promise.all([fetch("/api/runtime"), fetch("/api/settings")]);
      setReady(((await rt.json()) as { installed: boolean }).installed);
      setSettings((await s.json()) as ModelConfig);
      await refreshAgents();
    })();
  }, [refreshAgents]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seq = [0, 0, 1, 0, 2, 0, 0, 3, 1, 0];
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % seq.length;
      setOps(seq[i]);
    }, 1400);
    return () => clearInterval(t);
  }, []);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }

  async function installRuntime() {
    setInstalling(true);
    try {
      const r = await fetch("/api/runtime", { method: "POST" });
      const j = (await r.json()) as { installed: boolean; error?: string };
      setReady(j.installed);
      if (!j.installed) flash(j.error || "Setup failed.");
    } finally {
      setInstalling(false);
    }
  }

  const selected = agents.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="app">
      <aside className="side">
        <button className="brand" type="button" onClick={() => setMode("builder")}>
          AIQY<span className="slashes">//</span>
          <span className="tag">studio</span>
        </button>
        <button
          className="newbtn"
          type="button"
          onClick={() => {
            setMode("builder");
            setSelectedId(null);
          }}
        >
          <span className="plus">+</span> New agent
        </button>

        <div className="navlabel">Agents</div>
        <nav className="nav">
          {agents.length === 0 && <div className="nav-empty">No agents yet. Describe one →</div>}
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`agent ${mode === "agent" && selectedId === a.id ? "active" : ""}`}
              onClick={() => {
                setSelectedId(a.id);
                setMode("agent");
              }}
            >
              <span className="dot ok" />
              <span className="aname">{a.name}</span>
              <span className="kind">{a.toolSlugs.length ? `${a.toolSlugs.length}t` : "chat"}</span>
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <span className="modelchip">
            <span className="dot ok" />
            {settings ? `${settings.modelId} · ${settings.providerName}` : "…"}
          </span>
          <button className="gear" type="button" title="Settings" aria-label="Settings" onClick={() => setMode("settings")}>
            ⚙
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="crumb">
            <b>{mode === "settings" ? "Settings" : mode === "agent" && selected ? selected.name : "New agent"}</b>
            <span className="sep">//</span>
            <span>{mode === "settings" ? "model connection" : mode === "agent" ? "run" : "describe & build"}</span>
          </div>
          <div className="metric">
            <span className="dot ok" />
            <span className="n">{ops}</span> ops/s
          </div>
        </div>

        {ready === false ? (
          <Setup installing={installing} onInstall={installRuntime} />
        ) : mode === "settings" ? (
          <Settings
            settings={settings}
            onSave={async (cfg) => {
              const r = await fetch("/api/settings", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(cfg),
              });
              if (r.ok) {
                setSettings((await r.json()) as ModelConfig);
                flash("Model connection saved.");
                setMode("builder");
              } else {
                flash(((await r.json()) as { error?: string }).error || "Could not save.");
              }
            }}
          />
        ) : mode === "agent" && selected ? (
          <Chat
            agent={selected}
            onDeleted={async (id) => {
              await refreshAgents();
              setSelectedId(null);
              setMode("builder");
              flash(`Deleted ${id}.`);
            }}
          />
        ) : (
          <Builder
            onCreated={async (id) => {
              await refreshAgents();
              setSelectedId(id);
              setMode("agent");
            }}
            flash={flash}
          />
        )}
      </main>

      <footer className="statusbar">
        <span className="sb live">● host</span>
        <span className="sb">
          <b>eve</b> 0.22.1
        </span>
        <span className="sb">
          <b>runtime</b> {ready === null ? "…" : ready ? "durable" : "not set up"}
        </span>
        <div className="right">
          <span className="sb">
            <b>{agents.length}</b> agents
          </span>
          <span className="sb">model {settings ? <b>{settings.modelId}</b> : "…"}</span>
        </div>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------------- Builder ---------------- */
function Builder({ onCreated, flash }: { onCreated: (id: string) => void; flash: (m: string) => void }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("Summarize any URL I send and reply with a short summary.");
  const [tools, setTools] = useState<string[]>(["http_request"]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ validation: Validation } | null>(null);
  const [idea, setIdea] = useState("");
  const [designing, setDesigning] = useState(false);

  function toggle(slug: string) {
    setTools((t) => (t.includes(slug) ? t.filter((s) => s !== slug) : [...t, slug]));
  }

  async function design() {
    if (!idea.trim() || designing) return;
    setDesigning(true);
    try {
      const r = await fetch("/api/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const j = (await r.json()) as { name?: string; instructions?: string; toolSlugs?: string[]; error?: string };
      if (r.ok) {
        setName(j.name ?? "");
        setPrompt(j.instructions ?? "");
        setTools(j.toolSlugs ?? []);
        flash("Drafted by AI — review and build.");
      } else {
        flash(j.error || "Design failed.");
      }
    } finally {
      setDesigning(false);
    }
  }

  async function build() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name || prompt.slice(0, 40), prompt, toolSlugs: tools }),
      });
      const j = (await r.json()) as { id?: string; validation?: Validation; error?: string };
      if (r.ok && j.id) {
        flash("Agent built · ready");
        onCreated(j.id);
      } else if (j.validation) {
        setResult({ validation: j.validation });
      } else {
        flash(j.error || "Build failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="canvas">
      <div className="eyebrow">
        <span className="bar" /> describe · generate · run
      </div>
      <h1 className="q">
        What should your <em>agent</em> do?
      </h1>
      <p className="sub">
        Write it in plain language — it becomes the agent&apos;s brain. AIQY generates a real, durable agent on your own
        model, then runs it.
      </p>

      <div className="aidesign">
        <div className="ai-eyebrow">✨ design with AI</div>
        <div className="ai-row">
          <input
            className="input"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void design();
              }
            }}
            placeholder="one line — e.g. watch Hacker News and summarize the top AI stories for me"
            aria-label="Describe your idea in one line"
          />
          <button className="build" type="button" onClick={design} disabled={designing || !idea.trim()}>
            {designing ? "Designing…" : "Design"} <span className="arrow">✨</span>
          </button>
        </div>
        <div className="ai-hint">The model drafts a name, instructions, and tools below — review, tweak, then build.</div>
      </div>

      <div className="builder">
        <input
          className="title"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent name (optional)"
          aria-label="Agent name"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          spellCheck={false}
          aria-label="Describe your agent"
        />
        <div className="controls">
          {TOOL_LIBRARY.map((t) => (
            <button
              key={t.slug}
              type="button"
              className={`ctl ${tools.includes(t.slug) ? "on" : ""}`}
              title={t.description}
              onClick={() => toggle(t.slug)}
            >
              {t.slug} <span className="x">{tools.includes(t.slug) ? "×" : "+"}</span>
            </button>
          ))}
          <span className="spacer" />
          <button className="build" type="button" onClick={build} disabled={busy || !prompt.trim()}>
            {busy ? "Building…" : "Build agent"} <span className="arrow">→</span>
          </button>
        </div>
      </div>

      {result && (
        <div className={`out ${result.validation.ok ? "" : "err"}`}>
          <div className="out-head">
            <span className="t">generated agent/</span>
            <span className={`status ${result.validation.ok ? "ready" : "bad"}`}>
              <span className={`dot ${result.validation.ok ? "ok" : "err"}`} />
              {result.validation.ok
                ? `ready · ${result.validation.errors} errors`
                : `failed · ${result.validation.errors} error(s)`}
            </span>
          </div>
          {!result.validation.ok && result.validation.message && (
            <div className="out-msg">{result.validation.message}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Settings ---------------- */
const PRESETS: { label: string; cfg: Partial<ModelConfig> }[] = [
  { label: "Ollama (local)", cfg: { providerName: "ollama", baseURL: "http://127.0.0.1:11434/v1", modelId: "llama3.1", contextWindow: 8192 } },
  { label: "LM Studio", cfg: { providerName: "lmstudio", baseURL: "http://127.0.0.1:1234/v1", modelId: "local-model", contextWindow: 8192 } },
  { label: "OpenAI", cfg: { providerName: "openai", baseURL: "https://api.openai.com/v1", modelId: "gpt-4o-mini", contextWindow: 128000 } },
];

function Settings({ settings, onSave }: { settings: ModelConfig | null; onSave: (c: ModelConfig) => void }) {
  const [cfg, setCfg] = useState<ModelConfig>(
    settings ?? { providerName: "local", baseURL: "http://127.0.0.1:11434/v1", apiKey: "", modelId: "llama3.1", contextWindow: 8192 },
  );

  const set = (patch: Partial<ModelConfig>) => setCfg((c) => ({ ...c, ...patch }));

  return (
    <div className="canvas">
      <div className="eyebrow">
        <span className="bar" /> bring your own model
      </div>
      <h1 className="q">
        Connect <em>any</em> model
      </h1>
      <p className="sub">
        Any OpenAI-compatible endpoint — local (Ollama, LM Studio, vLLM) or cloud. Runs entirely outside the Vercel
        Gateway. Your key stays on this machine.
      </p>

      <div className="form">
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="ctl" onClick={() => set(p.cfg)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="baseURL">Base URL</label>
          <input
            id="baseURL"
            className="input mono"
            value={cfg.baseURL}
            onChange={(e) => set({ baseURL: e.target.value })}
            placeholder="http://127.0.0.1:11434/v1"
          />
          <span className="hint">The OpenAI-compatible endpoint (ends in /v1). For Ollama in Docker use host.docker.internal.</span>
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="modelId">Model id</label>
            <input id="modelId" className="input mono" value={cfg.modelId} onChange={(e) => set({ modelId: e.target.value })} placeholder="llama3.1" />
          </div>
          <div className="field">
            <label htmlFor="ctx">Context window (tokens)</label>
            <input
              id="ctx"
              className="input mono"
              type="number"
              value={cfg.contextWindow}
              onChange={(e) => set({ contextWindow: Number(e.target.value) })}
            />
            <span className="hint">Required — lets AIQY skip the Vercel model catalog.</span>
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="provider">Provider name</label>
            <input id="provider" className="input mono" value={cfg.providerName} onChange={(e) => set({ providerName: e.target.value })} placeholder="local" />
          </div>
          <div className="field">
            <label htmlFor="key">API key (optional)</label>
            <input
              id="key"
              className="input mono"
              type="password"
              value={cfg.apiKey ?? ""}
              onChange={(e) => set({ apiKey: e.target.value })}
              placeholder="leave blank for local models"
            />
          </div>
        </div>

        <div>
          <button className="build" type="button" onClick={() => onSave(cfg)}>
            Save connection <span className="arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Setup ---------------- */
function Setup({ installing, onInstall }: { installing: boolean; onInstall: () => void }) {
  return (
    <div className="setup">
      <div className="logo">
        AIQY<span className="slashes grad-text">//</span>
      </div>
      <p>
        One-time setup: AIQY installs a shared Eve runtime (~30s). After this, every agent you build is just files —
        created in an instant.
      </p>
      <p style={{ marginTop: 22 }}>
        <button className="build" type="button" onClick={onInstall} disabled={installing}>
          {installing ? "Setting up…" : "Set up AIQY"} <span className="arrow">→</span>
        </button>
      </p>
    </div>
  );
}
