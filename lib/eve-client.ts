// Browser-side driver for an Eve agent session, via the AIQY proxy
// (/api/agents/:id/eve/v1/**). POST creates/continues; the reply arrives over a
// separate GET NDJSON stream. Verified against the real contract.

export interface Session {
  sessionId: string;
  continuationToken: string;
  index: number; // event cursor for ?startIndex on continue turns
}

export interface TurnCallbacks {
  onDelta?: (soFar: string) => void;
  onEvent?: (type: string) => void;
}

const base = (id: string): string => `/api/agents/${encodeURIComponent(id)}/eve/v1`;

export async function createSession(id: string, message: string): Promise<Session> {
  const res = await fetch(`${base(id)}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`Could not start a session (${res.status}).`);
  const j = (await res.json()) as { sessionId: string; continuationToken: string };
  return { sessionId: j.sessionId, continuationToken: j.continuationToken, index: 0 };
}

export async function continueSession(id: string, s: Session, message: string): Promise<void> {
  const res = await fetch(`${base(id)}/session/${encodeURIComponent(s.sessionId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ continuationToken: s.continuationToken, message }),
  });
  if (!res.ok) throw new Error(`Could not send the message (${res.status}).`);
}

/** Read one assistant turn from the NDJSON stream. Returns the final text. */
export async function readTurn(id: string, s: Session, cb: TurnCallbacks = {}): Promise<string> {
  let res: Response | null = null;
  for (let i = 0; i < 40; i++) {
    res = await fetch(`${base(id)}/session/${encodeURIComponent(s.sessionId)}/stream?startIndex=${s.index}`, {
      headers: { accept: "application/x-ndjson" },
    });
    if (res.ok) break;
    if (![404, 409, 425, 500, 502, 503].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!res || !res.ok || !res.body) throw new Error("The agent stream is not available.");

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let finalText = "";

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let evt: { type?: string; data?: { messageSoFar?: string; message?: string; finishReason?: string } };
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      s.index++;
      if (evt.type) cb.onEvent?.(evt.type);
      if (evt.type === "message.appended" && typeof evt.data?.messageSoFar === "string") {
        cb.onDelta?.(evt.data.messageSoFar);
      }
      if (evt.type === "message.completed" && evt.data?.finishReason !== "tool-calls") {
        finalText = evt.data?.message ?? finalText;
      }
      if (evt.type === "session.waiting" || evt.type === "session.completed" || evt.type === "session.failed") {
        try {
          await reader.cancel();
        } catch {}
        break outer;
      }
    }
  }
  return finalText;
}
