"use client";

import { useCallback, useEffect, useState } from "react";
import Chat from "./_components/Chat";
import JsonChat from "./_components/JsonChat";
import { TOOL_LIBRARY } from "@/lib/tool-library";
import type { AgentMeta, ModelConfig, Validation } from "@/lib/types";

type Mode = "builder" | "settings" | "agent" | "json";

export default function Page() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [settings, setSettings] = useState<ModelConfig | null>(null);
  const [mode, setMode] = useState<Mode>("builder");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentMeta | null>(null);
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
        <button className={`jsonbtn ${mode === "json" ? "on" : ""}`} type="button" onClick={() => { setMode("json"); setSelectedId(null); setEditing(null); }}>
          <span className="spark">✦</span> Build with Json
        </button>
        <button
          className="newbtn"
          type="button"
          onClick={() => {
            setMode("builder");
            setSelectedId(null);
            setEditing(null);
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
            <b>{mode === "settings" ? "Settings" : mode === "agent" && selected ? selected.name : editing ? editing.name : "New agent"}</b>
            <span className="sep">//</span>
            <span>{mode === "settings" ? "model connection" : mode === "agent" ? "run" : editing ? "edit & regenerate" : "describe & build"}</span>
          </div>
          <div className="metric">
            <span className="dot ok" />
            <span className="n">{ops}</span> ops/s
          </div>
        </div>

        {ready === false ? (
          <Setup installing={installing} onInstall={installRuntime} />
        ) : mode === "json" ? (
          <JsonChat
            onBuilt={async (id) => {
              await refreshAgents();
              setSelectedId(id);
              setMode("agent");
              flash("Json built your agent.");
            }}
          />
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
            onEdit={() => {
              setEditing(selected);
              setMode("builder");
            }}
            onDeleted={async (id) => {
              await refreshAgents();
              setSelectedId(null);
              setMode("builder");
              setEditing(null);
              flash(`Deleted ${id}.`);
            }}
          />
        ) : (
          <Builder
            key={editing?.id ?? "new"}
            editing={editing}
            onCreated={async (id) => {
              await refreshAgents();
              setSelectedId(id);
              setMode("agent");
              setEditing(null);
            }}
            flash={flash}
          />
        )}
      </main>

      <footer className="statusbar">
        <span className="sb live">● host</span>
        <span className="sb">
          <b>eve</b> 0.22.5
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
function Builder({
  onCreated,
  flash,
  editing,
}: {
  onCreated: (id: string) => void;
  flash: (m: string) => void;
  editing?: AgentMeta | null;
}) {
  const isLibrary = (slug: string) => TOOL_LIBRARY.some((t) => t.slug === slug);
  const [name, setName] = useState(editing?.name ?? "");
  const [prompt, setPrompt] = useState(editing?.prompt ?? "Summarize any URL I send and reply with a short summary.");
  const [tools, setTools] = useState<string[]>(editing ? editing.toolSlugs.filter(isLibrary) : ["http_request"]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ validation: Validation } | null>(null);
  const [idea, setIdea] = useState("");
  const [designing, setDesigning] = useState(false);

  // Custom tools Json wrote (not in the library) aren't shown as toggles, but the edit route
  // preserves them — surface them so the user knows they're kept.
  const customTools = editing ? editing.toolSlugs.filter((s) => !isLibrary(s)) : [];

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
      const r = await fetch(editing ? `/api/agents/${editing.id}` : "/api/agents", {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name || prompt.slice(0, 40), prompt, toolSlugs: tools }),
      });
      const j = (await r.json()) as { id?: string; validation?: Validation; error?: string };
      if (r.ok && j.id) {
        flash(editing ? "Changes saved · ready" : "Agent built · ready");
        onCreated(j.id);
      } else if (j.validation) {
        setResult({ validation: j.validation });
      } else {
        flash(j.error || (editing ? "Save failed." : "Build failed."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="canvas">
      <div className="eyebrow">
        <span className="bar" /> {editing ? "edit · regenerate · run" : "describe · generate · run"}
      </div>
      <h1 className="q">
        {editing ? (
          <>
            Edit <em>{editing.name}</em>
          </>
        ) : (
          <>
            What should your <em>agent</em> do?
          </>
        )}
      </h1>
      <p className="sub">
        {editing
          ? "Tweak the instructions or tools — AIQY regenerates the agent on your model. Any custom tools Json wrote are kept."
          : "Write it in plain language — it becomes the agent's brain. AIQY generates a real, durable agent on your own model, then runs it."}
      </p>

      {!editing && (
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
      )}

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
            {busy ? (editing ? "Saving…" : "Building…") : editing ? "Save changes" : "Build agent"}{" "}
            <span className="arrow">→</span>
          </button>
        </div>
        {editing && customTools.length > 0 && (
          <div className="ai-hint" style={{ marginTop: 10 }}>
            Keeping {customTools.length} custom tool{customTools.length > 1 ? "s" : ""} Json wrote:{" "}
            <b>{customTools.join(", ")}</b>
          </div>
        )}
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
interface DetectedProvider {
  id: string;
  label: string;
  baseURL: string;
  defaultContextWindow: number;
}

const LOCAL_PRESETS: { label: string; baseURL: string }[] = [
  { label: "Ollama", baseURL: "http://127.0.0.1:11434/v1" },
  { label: "LM Studio", baseURL: "http://127.0.0.1:1234/v1" },
  { label: "vLLM", baseURL: "http://127.0.0.1:8000/v1" },
];

function Settings({ settings, onSave }: { settings: ModelConfig | null; onSave: (c: ModelConfig) => void }) {
  const isCloud = Boolean(
    settings?.apiKey && settings.apiKey !== "ollama" && !/127\.0\.0\.1|localhost/.test(settings.baseURL),
  );
  const [tab, setTab] = useState<"cloud" | "local">(isCloud ? "cloud" : "local");
  const [apiKey, setApiKey] = useState(settings?.apiKey && settings.apiKey !== "ollama" ? settings.apiKey : "");
  const [baseURL, setBaseURL] = useState(settings?.baseURL || "http://127.0.0.1:11434/v1");
  const [provider, setProvider] = useState<DetectedProvider | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelId, setModelId] = useState(settings?.modelId || "");
  const [ctx, setCtx] = useState<number>(settings?.contextWindow || 8192);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setModels([]);
    setProvider(null);
    setErr(null);
  }

  async function connect() {
    setLoading(true);
    reset();
    try {
      const body = tab === "cloud" ? { apiKey } : { baseURL };
      const r = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { provider?: DetectedProvider; models?: string[]; error?: string };
      if (j.provider) {
        setProvider(j.provider);
        if (tab === "cloud") setBaseURL(j.provider.baseURL);
        setCtx((c) => c || j.provider!.defaultContextWindow);
      }
      if (j.models && j.models.length) {
        setModels(j.models);
        setModelId((m) => (j.models!.includes(m) ? m : j.models![0]));
      }
      if (j.error) setErr(j.error);
      else if (!j.models || !j.models.length) setErr("Connected, but no models came back.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function save() {
    if (!modelId) {
      setErr("Pick a model first.");
      return;
    }
    onSave({
      providerName: provider?.id || (tab === "cloud" ? "cloud" : "local"),
      baseURL: tab === "cloud" ? provider?.baseURL || baseURL : baseURL,
      apiKey: tab === "cloud" ? apiKey : apiKey || "ollama",
      modelId,
      contextWindow: ctx || provider?.defaultContextWindow || 8192,
    });
  }

  return (
    <div className="canvas">
      <div className="eyebrow">
        <span className="bar" /> bring your own model
      </div>
      <h1 className="q">
        Connect <em>any</em> model
      </h1>
      <p className="sub">
        Two ways in: a <strong>cloud API key</strong> (GPT, Claude, Gemini, Groq, OpenRouter…) — AIQY detects the
        provider and lists its models — or a <strong>local model</strong>. Your key stays on this machine.
      </p>

      <div className="tabs">
        <button type="button" className={`tab ${tab === "cloud" ? "on" : ""}`} onClick={() => { setTab("cloud"); reset(); }}>
          Cloud API
        </button>
        <button type="button" className={`tab ${tab === "local" ? "on" : ""}`} onClick={() => { setTab("local"); reset(); }}>
          Local model
        </button>
      </div>

      <div className="form">
        {tab === "cloud" ? (
          <div className="field">
            <label htmlFor="key">API key</label>
            <div className="ai-row">
              <input
                id="key"
                className="input mono"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="paste any key — sk-… / sk-ant-… / AIza… / gsk_… / sk-or-…"
              />
              <button className="btn" type="button" onClick={connect} disabled={loading || !apiKey.trim()}>
                {loading ? "Connecting…" : "Connect"}
              </button>
            </div>
            <span className="hint">Auto-detects OpenAI, Anthropic (Claude), Google (Gemini), Groq, or OpenRouter from the key.</span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="baseURL">Local endpoint (OpenAI-compatible)</label>
            <div className="presets">
              {LOCAL_PRESETS.map((p) => (
                <button key={p.label} type="button" className="ctl" onClick={() => setBaseURL(p.baseURL)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="ai-row" style={{ marginTop: 8 }}>
              <input id="baseURL" className="input mono" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="http://127.0.0.1:11434/v1" />
              <button className="btn" type="button" onClick={connect} disabled={loading || !baseURL.trim()}>
                {loading ? "Connecting…" : "Connect"}
              </button>
            </div>
            <span className="hint">Ollama, LM Studio, vLLM… AIQY lists the models you have installed.</span>
            <div className="modeltip">
              <span className="tip-eyebrow">Which open-source model?</span>
              A <strong>~3B</strong> model (e.g. <code>qwen2.5:3b</code>) is great for running simple agents and
              chatting. But for <strong>Json</strong> to reliably <em>write custom tool code</em>, use a more capable
              model — a <strong>7B+</strong> on a GPU, or an <strong>MoE</strong> like <code>qwen3:30b-a3b</code> on a
              CPU-only machine. Smaller models may fail to write working tools.
            </div>
          </div>
        )}

        {provider && tab === "cloud" && <div className="hint" style={{ color: "var(--ok)" }}>Detected: {provider.label}</div>}
        {err && <div className="hint" style={{ color: "var(--err)" }}>{err}</div>}

        {models.length > 0 && (
          <>
            <div className="grid2">
              <div className="field">
                <label htmlFor="modelId">Model</label>
                <select id="modelId" className="input mono" value={modelId} onChange={(e) => setModelId(e.target.value)}>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <span className="hint">{models.length} models available.</span>
              </div>
              <div className="field">
                <label htmlFor="ctx">Context window (tokens)</label>
                <input id="ctx" className="input mono" type="number" value={ctx} onChange={(e) => setCtx(Number(e.target.value))} />
                <span className="hint">Lets AIQY skip the Vercel model catalog.</span>
              </div>
            </div>
            <div>
              <button className="build" type="button" onClick={save}>
                Save connection <span className="arrow">→</span>
              </button>
            </div>
          </>
        )}
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
