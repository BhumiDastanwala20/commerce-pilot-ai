"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import type { OrderStatus, OwnerOrder } from "@/lib/types";
import { orderSummary } from "@/lib/types";
import { money } from "@/lib/format";
import RevenueChart from "@/components/RevenueChart";
import PayoutCard from "@/components/PayoutCard";
import { useToast } from "@/components/Toast";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--surface)", foregroundColor: "var(--text)", headerBackgroundColor: "var(--surface-2)",
  borderColor: "var(--border)", accentColor: "var(--accent)",
});

const BADGE: Record<OrderStatus, string> = {
  paid: "badge-success", awaiting_payment: "badge-accent", approval_needed: "badge-warn",
  rejected: "badge-danger", refunded: "badge-danger", failed: "badge-danger",
};
const StatusBadge = ({ status }: { status: OrderStatus }) => <span className={`badge ${BADGE[status]}`}>{status.replace("_", " ")}</span>;

type Insights = { blocked: number; topSearches: { q: string; c: number }[]; lowStock: { id: string; name: string; stock: number }[] };

const columns: ColDef<OwnerOrder>[] = [
  { field: "id", headerName: "Order", width: 130 },
  { headerName: "Items", valueGetter: (p) => (p.data ? orderSummary(p.data.items) : ""), flex: 2, minWidth: 180 },
  { field: "total", headerName: "Total", valueFormatter: (p) => money(p.value as number), width: 110 },
  { field: "discountPercent", headerName: "Discount", valueFormatter: (p) => `${p.value}%`, width: 110 },
  { field: "status", width: 170, cellRenderer: (p: { value: OrderStatus }) => <StatusBadge status={p.value} /> },
  {
    field: "createdAt", headerName: "Created", width: 170, sort: "desc",
    valueFormatter: (p) => new Date(p.value as string).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
  },
];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card stat">
      <div className="time">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="time">{hint}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const prev = useRef<Map<string, string>>(new Map());
  const first = useRef(true);
  const { toast, node } = useToast();

  const load = useCallback(async () => {
    try {
      const [o, i] = await Promise.all([fetch("/api/orders"), fetch("/api/insights")]);
      if (o.ok) {
        const data: OwnerOrder[] = await o.json();
        const changed = data.filter((x) => prev.current.get(x.id) !== x.status).map((x) => x.id);
        if (!first.current && changed.length) {
          setFlash(new Set(changed));
          setTimeout(() => setFlash(new Set()), 2500);
        }
        first.current = false;
        prev.current = new Map(data.map((x) => [x.id, x.status]));
        setOrders(data);
        setLoaded(true);
      }
      if (i.ok) setInsights(await i.json());
    } catch {}
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  async function post(url: string, body: unknown, ok: string) {
    setBusy(true);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      if (r.ok) toast(ok); else toast(d?.error || "Something went wrong.", "err");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const stats = useMemo(() => {
    const paid = orders.filter((o) => o.status === "paid");
    const counted = orders.filter((o) => o.status !== "rejected");
    return {
      revenue: paid.reduce((s, o) => s + o.total, 0),
      paid: paid.length,
      awaiting: orders.filter((o) => o.status === "awaiting_payment").length,
      pending: orders.filter((o) => o.status === "approval_needed"),
      avgDiscount: counted.length ? counted.reduce((s, o) => s + o.discountPercent, 0) / counted.length : 0,
      conversion: orders.length ? (paid.length / orders.length) * 100 : 0,
    };
  }, [orders]);

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  return (
    <main className="container">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Owner dashboard</h1>
        <span className="live"><i className="dot" aria-hidden="true" /> Live</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-sm" disabled={busy} onClick={() => post("/api/demo", { action: "seed" }, "Demo data loaded.")}>Load demo data</button>
          <button className="btn btn-sm" disabled={busy} onClick={() => post("/api/demo", { action: "reset" }, "Demo data removed.")}>Reset demo</button>
        </span>
      </div>

      <section className="stats" aria-label="Key numbers">
        <Stat label="Revenue" value={money(stats.revenue)} />
        <Stat label="Orders paid" value={String(stats.paid)} />
        <Stat label="Awaiting payment" value={String(stats.awaiting)} />
        <Stat label="Pending approvals" value={String(stats.pending.length)} />
        <Stat label="Avg discount" value={`${stats.avgDiscount.toFixed(1)}%`} />
        <Stat label="Conversion" value={`${stats.conversion.toFixed(0)}%`} hint="paid / all orders" />
      </section>

      {insights && insights.lowStock.length > 0 && (
        <div className="note note-warn" style={{ marginBottom: 12 }}>
          <b>Low stock:</b> {insights.lowStock.map((p) => `${p.name} (${p.stock})`).join(", ")}. <a href="/dashboard/procurement">Reorder</a>
        </div>
      )}

      {stats.pending.length > 0 && (
        <section className="card" style={{ padding: 16, marginBottom: 16, borderColor: "var(--warn)" }} aria-label="Approvals needed">
          <h2 style={{ fontSize: 18 }}>Approvals needed</h2>
          {stats.pending.map((o) => (
            <div key={o.id} className="approval">
              <div>
                <b>{orderSummary(o.items)}</b> · {money(o.total)} ({o.discountPercent}% off)
                <div className="time">Reason: {o.reasoning || "Order is above your approval limit."}</div>
              </div>
              <span style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => post("/api/approvals", { orderId: o.id, action: "approve" }, "Approved. PayPal checkout created.")}>Approve</button>
                <button className="btn btn-sm" disabled={busy} onClick={() => post("/api/approvals", { orderId: o.id, action: "reject" }, "Order rejected.")}>Reject</button>
              </span>
            </div>
          ))}
        </section>
      )}

      <div className="two-col">
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 18 }}>Revenue, last 7 days</h2>
          {loaded ? <RevenueChart orders={orders} /> : <p>Loading…</p>}
        </section>
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 18 }}>Shopper insights</h2>
          <p style={{ margin: "0 0 6px" }}><span className="badge badge-danger">{insights?.blocked ?? 0}</span> blocked manipulation attempts</p>
          <div className="time" style={{ marginTop: 10 }}>Top searches</div>
          {insights?.topSearches.length ? (
            <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>{insights.topSearches.map((s) => <li key={s.q}>{s.q} <span className="time">({s.c})</span></li>)}</ol>
          ) : <p className="time">No searches yet.</p>}
        </section>
      </div>

      <h2 style={{ fontSize: 18, margin: "20px 0 8px" }}>All orders</h2>
      <div style={{ height: 380, marginBottom: 20 }}>
        <AgGridReact<OwnerOrder>
          theme={gridTheme}
          rowData={orders}
          columnDefs={columns}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          getRowId={(p) => p.data.id}
          getRowClass={(p) => (p.data && flash.has(p.data.id) ? "row-flash" : "")}
          onRowClicked={(e) => setSelectedId(e.data?.id ?? null)}
          overlayNoRowsTemplate="No orders yet. Chat on /shop or click Load demo data."
        />
      </div>

      <PayoutCard />

      {selected && (
        <aside className="drawer" role="dialog" aria-label={`Order ${selected.id}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>{selected.id}</h2>
            <button className="btn btn-sm" onClick={() => setSelectedId(null)} aria-label="Close details">Close</button>
          </div>
          <p><StatusBadge status={selected.status} /></p>
          <table className="simple">
            <tbody>
              {selected.items.map((i) => <tr key={i.productId}><td>{i.qty} × {i.name}</td><td>{money(i.listPrice)} → <b>{money(i.unitPrice)}</b></td></tr>)}
              <tr><td>List total</td><td>{money(selected.listTotal)}</td></tr>
              <tr><td>Discount</td><td>{selected.discountPercent}%</td></tr>
              <tr><td><b>Total</b></td><td><b>{money(selected.total)}</b></td></tr>
            </tbody>
          </table>
          <h3 style={{ fontSize: 15, marginTop: 16 }}>Why the AI offered this price</h3>
          <p style={{ margin: "0 0 8px" }}>{selected.reasoning || "No reasoning recorded."}</p>
          {selected.trace.length > 0 && (
            <ol className="trace">
              {selected.trace.map((t, i) => (
                <li key={i}><b>{t.tool}</b> → <span className="badge">{t.verdict}</span><div className="time">{JSON.stringify(t.input).slice(0, 110)}</div></li>
              ))}
            </ol>
          )}
          <h3 style={{ fontSize: 15, marginTop: 16 }}>Details</h3>
          <div className="time">Created: {new Date(selected.createdAt).toLocaleString()}</div>
          {selected.paidAt && <div className="time">Paid: {new Date(selected.paidAt).toLocaleString()}</div>}
          {selected.paypalOrderId && <div className="time">PayPal order: {selected.paypalOrderId}</div>}
          {selected.captureId && <div className="time">Capture: {selected.captureId}</div>}
          {selected.status === "paid" && (
            <button className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={() => post("/api/refund", { orderId: selected.id }, "Refunded and stock restored.")}>Refund this order</button>
          )}
        </aside>
      )}
      {node}
    </main>
  );
}