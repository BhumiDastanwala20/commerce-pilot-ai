"use client";
import { useEffect, useState } from "react";
import type { PublicProduct, PublicOrder, SearchResponse } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import ChatPanel from "@/components/ChatPanel";
import OrderSummaryCard from "@/components/OrderSummaryCard";
import SearchBar from "@/components/SearchBar";
import Recommendations from "@/components/Recommendations";
import { getSessionId } from "@/components/session";

export default function ShopPage() {
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [recKey, setRecKey] = useState(0);
  const [confirmed, setConfirmed] = useState<PublicOrder | null>(null);
  const [paymentFailed, setPaymentFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ask = params.get("ask");
    if (ask) setDraft(`Tell me about the ${ask}`);
    if (params.get("payment") === "failed") setPaymentFailed(true);
    const paidId = params.get("paid");
    if (paidId) {
      fetch(`/api/order?id=${encodeURIComponent(paidId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((o: PublicOrder | null) => { if (o && o.status === "paid") setConfirmed(o); })
        .catch(() => {});
    }
  }, []);

  function askAbout(p: PublicProduct) {
    setDraft(`Tell me about the ${p.name}`);
    fetch("/api/track", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId(), productId: p.id, type: "ask" }),
    }).then(() => setRecKey((k) => k + 1)).catch(() => {});
    if (window.innerWidth < 900) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="container">
      <h1>Shop</h1>
      <p style={{ color: "var(--muted)", marginBottom: 20 }}>Search the catalog, or just tell our assistant what you need.</p>

      {confirmed && (
        <section className="card confirm" aria-label="Payment confirmation">
          <div className="note note-success"><b>Payment confirmed.</b> Order <code>{confirmed.id}</code> is on its way to the shop owner.</div>
          <OrderSummaryCard order={confirmed} />
          <button className="btn" onClick={() => setConfirmed(null)}>Continue shopping</button>
        </section>
      )}
      {paymentFailed && <div className="note note-danger" style={{ marginBottom: 20 }}>We couldn't complete that payment. You haven't been charged. Please try again from the chat.</div>}

      <div className="shop-layout">
        <section aria-label="Product catalog">
          <SearchBar onResults={setRes} onSearched={() => setRecKey((k) => k + 1)} />
          <Recommendations refreshKey={recKey} />
          {res && res.products.length === 0 && (
            <div className="note note-warn">No products match. Try fewer filters, switch on “AI understanding”, or ask the assistant.</div>
          )}
          <div className="product-grid">
            {(res?.products ?? []).map((p) => <ProductCard key={p.id} product={p} onAsk={askAbout} />)}
          </div>
        </section>

        <aside className="chat-wrap" aria-label="Sales assistant">
          <ChatPanel draft={draft} setDraft={setDraft} />
        </aside>
      </div>
    </main>
  );
}