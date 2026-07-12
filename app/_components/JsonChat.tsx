"use client";

import { useEffect, useRef, useState } from "react";
import type { SecretSpec } from "@/lib/types";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface JsonResp {
  reply?: string;
  build?: { agentId: string; name: string; ok: boolean; secrets?: SecretSpec[] };
  error?: string;
}

interface SecretCard {
  agentId: string;
  agentName: string;
  items: SecretSpec[];
}

export default function JsonChat({ onBuilt }: { onBuilt: (id: string) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [secretCard, setSecretCard] = useState<SecretCard | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, secretCard]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setBusy(true);
    try {
      const r = await fetch("/api/json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const j = (await r.json()) as JsonResp;
      setMsgs((m) => [...m, { role: "assistant", content: j.reply || j.error || "…" }]);
      if (!j.build) return;

      const secrets = j.build.secrets ?? [];
      if (secrets.length === 0) {
        if (j.build.ok) onBuilt(j.build.agentId);
        return;
      }
      // Some credentials are needed — show which aren't set yet, and collect them securely.
      let missing = secrets;
      try {
        const s = await fetch(`/api/agents/${j.build.agentId}/secrets`);
        const { names } = (await s.json()) as { names: string[] };
        missing = secrets.filter((x) => !names.includes(x.name));
      } catch {
        // keep all as missing
      }
      if (missing.length > 0) {
        setSecretCard({ agentId: j.build.agentId, agentName: j.build.name, items: missing });
      } else if (j.build.ok) {
        onBuilt(j.build.agentId);
      }
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `⚠ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function handleSaved(name: string) {
    if (!secretCard) return;
    const items = secretCard.items.filter((i) => i.name !== name);
    if (items.length === 0) {
      const agentId = secretCard.agentId;
      setSecretCard(null);
      setMsgs((m) => [...m, { role: "assistant", content: "✅ All set — your agent has what it needs. Opening it now." }]);
      onBuilt(agentId);
    } else {
      setSecretCard({ ...secretCard, items });
    }
  }

  return (
    <div className="chat">
      <div className="runhead">
        <span className="avatar" style={{ background: "var(--grad)", color: "white", width: 28, height: 28, borderRadius: 8 }}>
          J
        </span>
        <div className="info">
          <div className="n">Json</div>
          <div className="p">Describe an agent in plain language — I build it and write any code it needs.</div>
        </div>
      </div>

      <div className="msgs">
        {msgs.length === 0 && (
          <div className="typing">
            Hi — I&apos;m Json. Tell me what agent you want, in your own words. For example: “a bot that tells me a joke”, or
            “an agent that fetches a web page and summarizes it”. I&apos;ll design it, write the tools, and build it for you.
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="avatar">{m.role === "user" ? "you" : "J"}</div>
            <div style={{ minWidth: 0 }}>
              <div className="who">{m.role === "user" ? "you" : "Json"}</div>
              <div className="bubble">{m.content}</div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <div className="avatar">J</div>
            <div>
              <div className="who">Json</div>
              <div className="bubble">
                <span className="typing">thinking &amp; building…</span>
              </div>
            </div>
          </div>
        )}

        {secretCard && (
          <div className="secretcard">
            <div className="secret-eyebrow">🔒 keys needed — stored on your machine, never sent to the model</div>
            {secretCard.items.map((s) => (
              <SecretField key={s.name} agentId={secretCard.agentId} spec={s} onSaved={() => handleSaved(s.name)} />
            ))}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Tell Json what to build…"
          aria-label="Message Json"
          rows={1}
        />
        <button type="button" className="send" onClick={send} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

/** A single secure credential field. The value is POSTed straight to the agent's secrets
 *  endpoint — it is NEVER added to the chat messages, so the model never sees it. */
function SecretField({ agentId, spec, onSaved }: { agentId: string; spec: SecretSpec; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!value.trim() || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/agents/${agentId}/secrets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: spec.name, value }),
      });
      if (r.ok) {
        setValue("");
        onSaved();
      } else {
        setErr(((await r.json()) as { error?: string }).error || "Could not save.");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="secretitem">
      <div className="secretname">{spec.name}</div>
      {spec.description && <div className="secretdesc">{spec.description}</div>}
      {spec.howto && <div className="secrethow">{spec.howto}</div>}
      <div className="ai-row" style={{ marginTop: 8 }}>
        <input
          className="input mono"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
          placeholder={`Paste ${spec.name}…`}
          aria-label={`Paste ${spec.name}`}
        />
        <button className="btn" type="button" onClick={save} disabled={saving || !value.trim()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {err && (
        <div className="hint" style={{ color: "var(--err)" }}>
          {err}
        </div>
      )}
    </div>
  );
}
