"use client";
import { useEffect, useState } from "react";
import { useToast } from "./Toast";
import { money } from "@/lib/format";

type Payout = { id: number; email: string; amount: number; status: string; createdAt: string };

export default function PayoutCard() {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("10");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Payout[]>([]);
  const { toast, node } = useToast();

  async function load() {
    const r = await fetch("/api/payouts").catch(() => null);
    if (r?.ok) setList(await r.json());
  }
  useEffect(() => {
    void load();
  }, []);

  async function send() {
    setBusy(true);
    try {
      const r = await fetch("/api/payouts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, amount: Number(amount), note: "Supplier payment (sandbox)" }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) toast("Payout sent (sandbox)."); else toast(d?.error || "Payout failed.", "err");
      setConfirming(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ padding: 16 }} aria-label="Supplier payout">
      <h3 style={{ fontSize: 16 }}>Pay a supplier <span className="badge badge-warn">PayPal sandbox</span></h3>
      <p className="time">Sends test money through the PayPal Payouts API. Capped at $50.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="field" type="email" placeholder="supplier sandbox email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Supplier email" />
        <input className="field" type="number" min={1} max={50} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 90 }} aria-label="Amount in USD" />
        <button className="btn btn-primary" disabled={!email || busy} onClick={() => setConfirming(true)}>Pay</button>
      </div>
      {confirming && (
        <div className="note note-warn" style={{ marginTop: 10 }}>
          Send <b>{money(Number(amount) || 0)}</b> (sandbox) to <b>{email}</b>?{" "}
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={send}>Confirm</button>{" "}
          <button className="btn btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
      {list.length > 0 && (
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 14 }}>
          {list.slice(0, 5).map((p) => <li key={p.id}>{money(p.amount)} to {p.email}, <span className="time">{p.status}</span></li>)}
        </ul>
      )}
      {node}
    </section>
  );
}