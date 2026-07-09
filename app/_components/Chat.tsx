"use client";

import { useEffect, useRef, useState } from "react";
import { type Session, type TurnEvent, continueSession, createSession, readTurn } from "@/lib/eve-client";
import type { AgentMeta } from "@/lib/types";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

type Status = "idle" | "starting" | "thinking" | "ready" | "error";

const STATUS_LABEL: Record<Status, string> = {
  idle: "idle",
  starting: "starting runtime…",
  thinking: "thinking…",
  ready: "ready",
  error: "error",
};

const EV_LABEL: Record<string, string> = {
  "session.started": "session started",
  "turn.started": "turn started",
  "message.received": "message received",
  "step.started": "step",
  "message.appended": "streaming reply",
  "message.completed": "reply ready",
  "step.completed": "step done",
  "turn.completed": "turn done",
  "session.waiting": "waiting for you",
  "session.completed": "session done",
  "session.failed": "failed",
  "actions.requested": "tool call",
  "action.result": "tool result",
  "reasoning.appended": "reasoning",
};

function evClass(t: string): string {
  if (t.includes("failed")) return "err";
  if (t.includes("completed") || t === "session.waiting") return "ok";
  if (t.startsWith("action")) return "warn";
  return "";
}

export default function Chat({ agent, onDeleted }: { agent: AgentMeta; onDeleted: (id: string) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [trace, setTrace] = useState<TurnEvent[]>([]);
  const sessionRef = useRef<Session | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMsgs([]);
    setInput("");
    setTrace([]);
    sessionRef.current = null;
    setStatus("idle");
  }, [agent.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setTrace([]);
    setBusy(true);
    try {
      if (!sessionRef.current) {
        setStatus("starting");
        sessionRef.current = await createSession(agent.id, text);
      } else {
        await continueSession(agent.id, sessionRef.current, text);
      }
      setStatus("thinking");
      await readTurn(agent.id, sessionRef.current, {
        onDelta: (soFar) =>
          setMsgs((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "assistant", text: soFar };
            return c;
          }),
        onEvent: (e) =>
          setTrace((t) => (e.type === "message.appended" && t[t.length - 1]?.type === "message.appended" ? t : [...t, e])),
      });
      setStatus("ready");
    } catch (e) {
      setMsgs((m) => {
        const c = [...m];
        c[c.length - 1] = { role: "assistant", text: `⚠ ${(e as Error).message}` };
        return c;
      });
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    await fetch(`/api/agents/${agent.id}/stop`, { method: "POST" });
    sessionRef.current = null;
    setStatus("idle");
  }

  async function del() {
    if (!window.confirm(`Delete agent "${agent.name}"? This removes its files.`)) return;
    await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
    onDeleted(agent.id);
  }

  return (
    <div className="runwrap">
      <div className="chat">
        <div className="runhead">
          <span
            className={`dot ${status === "error" ? "err" : status === "idle" ? "" : status === "ready" ? "ok" : "warn"}`}
          />
          <div className="info">
            <div className="n">{agent.name}</div>
            <div className="p">{agent.prompt}</div>
          </div>
          <span className="spacer" />
          <span className="pill">{STATUS_LABEL[status]}</span>
          <button type="button" className="btn" onClick={stop}>
            Stop
          </button>
          <button type="button" className="btn danger" onClick={del}>
            Delete
          </button>
        </div>

        <div className="msgs">
          {msgs.length === 0 && (
            <div className="typing">
              Send a message to start the agent and chat. The first message boots the runtime (~a few seconds).
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="avatar">{m.role === "user" ? "you" : "AI"}</div>
              <div style={{ minWidth: 0 }}>
                <div className="who">{m.role === "user" ? "you" : agent.name}</div>
                <div className="bubble">
                  {m.text || (busy && i === msgs.length - 1 ? <span className="typing">…</span> : "")}
                </div>
              </div>
            </div>
          ))}
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
            placeholder={`Message ${agent.name}…`}
            aria-label="Message the agent"
            rows={1}
          />
          <button type="button" className="send" onClick={send} disabled={busy || !input.trim()}>
            Send
          </button>
        </div>
      </div>

      <aside className="activity">
        <h4>
          Activity <span className="mono">// live run</span>
        </h4>
        <div className="evs">
          {trace.length === 0 && <div className="evs-empty">The run trace appears here as the agent works — every session, turn, step, and tool call.</div>}
          {trace.map((e, i) => (
            <div key={i} className="ev">
              <span className={`evdot ${evClass(e.type)}`} />
              <span className="evname">{EV_LABEL[e.type] ?? e.type}</span>
              <span className="evtype">{e.type}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
