"use client";

import { useEffect, useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface JsonResp {
  reply?: string;
  build?: { agentId: string; name: string; ok: boolean };
  error?: string;
}

export default function JsonChat({ onBuilt }: { onBuilt: (id: string) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

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
      if (j.build?.ok) onBuilt(j.build.agentId);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `⚠ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
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
