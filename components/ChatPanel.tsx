"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatApiResponse, PublicOrder } from "@/lib/types";
import OrderSummaryCard from "./OrderSummaryCard";
import { getSessionId } from "./session";
type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  order?: PublicOrder | null;
  error?: boolean;
};

const CHIPS = ["Do you have mugs?", "Can I get 12 mugs for a discount?", "Gift ideas under $50"];
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

type Props = { draft: string; setDraft: (v: string) => void };

export default function ChatPanel({ draft, setDraft }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view (inside the chat box only)
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // When a product card prefills the input, focus it
  useEffect(() => {
    if (draft && document.activeElement !== inputRef.current) inputRef.current?.focus();
  }, [draft]);

  async function run(convo: Msg[]) {
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            sessionId: getSessionId(),
          messages: convo.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.reply) {
        throw new Error(data?.error || "Sorry, something went wrong on my side.");
      }
      const d = data as ChatApiResponse;
      setMessages([
        ...convo,
        { id: uid(), role: "assistant", content: d.reply, time: new Date().toISOString(), order: d.order },
      ]);
    } catch (e) {
      const text = e instanceof Error ? e.message : "Sorry, something went wrong on my side.";
      setMessages([...convo, { id: uid(), role: "assistant", content: text, time: new Date().toISOString(), error: true }]);
    } finally {
      setLoading(false);
    }
  }

  function send(text: string) {
    const t = text.trim();
    if (!t || loading) return;
    const next: Msg[] = [
      ...messages.filter((m) => !m.error),
      { id: uid(), role: "user", content: t, time: new Date().toISOString() },
    ];
    setMessages(next);
    setDraft("");
    void run(next);
  }

  function retry() {
    if (loading) return;
    const base = messages.filter((m) => !m.error);
    setMessages(base);
    void run(base);
  }

  const lastId = messages[messages.length - 1]?.id;

  return (
    <div className="card chat">
      <div className="chat-head">
        <span className="dot" aria-hidden="true" />
        <div>
          <b>Sales assistant</b>
          <div className="time">Online · replies in seconds</div>
        </div>
      </div>

      <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
        <div className="msg assistant">
          <div className="bubble">Hi! I can help you find the right product and sort out the best price. What are you looking for?</div>
        </div>

        {messages.length === 0 && (
          <div className="chips" aria-label="Suggested questions">
            {CHIPS.map((c) => (
              <button key={c} className="chip" onClick={() => send(c)} disabled={loading}>
                {c}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className={`bubble${m.error ? " error" : ""}`}>{m.content}</div>
            {m.error && m.id === lastId && (
              <button className="btn btn-sm" onClick={retry} disabled={loading}>
                Retry
              </button>
            )}
            {m.order && <OrderSummaryCard order={m.order} />}
            <span className="time">{fmtTime(m.time)}</span>
          </div>
        ))}

        {loading && (
          <div className="typing" aria-label="Assistant is typing">
            <i /><i /><i />
          </div>
        )}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">Message the sales assistant</label>
        <input
          id="chat-input"
          ref={inputRef}
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about a product or a price…"
          autoComplete="off"
          disabled={loading}
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}