
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PoStatus, PurchaseOrder, Snapshot } from "@/lib/procurement";
import { money } from "@/lib/format";
import DeliveryMap from "@/components/DeliveryMap";

type Tab = "stock" | "compare" | "orders";

const LABEL: Record<PoStatus, string> = {
  quoted: "Quote received",
  accepted: "Accepted",
  shipped: "Shipped",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STEPS: PoStatus[] = [
  "quoted",
  "accepted",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString([], {
    dateStyle: "medium",
  });

export default function ProcurementPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("stock");
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState(0);
  const [poId, setPoId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // AI Restock Agent
  const [agentMsg, setAgentMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/procurement");

      if (r.ok) {
        setSnap(await r.json());
      }
    } catch {
      // Keep existing data if refresh fails.
    }
  }, []);

  useEffect(() => {
    void load();

    const t = setInterval(load, 3000);

    return () => clearInterval(t);
  }, [load]);

  async function act(
    body: Record<string, unknown>
  ): Promise<PurchaseOrder | null> {
    setBusy(true);
    setErr("");

    try {
      const r = await fetch("/api/procurement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const d = await r.json().catch(() => null);

      if (!r.ok) {
        setErr(d?.error || "Something went wrong.");
        return null;
      }

      await load();

      return d as PurchaseOrder;
    } catch {
      setErr("Unable to connect to the server.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const effPid =
    pid ||
    snap?.inventory.find((i) => i.low)?.id ||
    snap?.inventory[0]?.id ||
    "";

  const row = snap?.inventory.find(
    (i) => i.id === effPid
  );

  const effQty =
    qty > 0 ? qty : row?.suggestedQty || 50;

  const offers = useMemo(() => {
    if (!snap) return [];

    const list = snap.vendors
      .filter(
        (v) => v.prices[effPid] !== undefined
      )
      .map((v) => ({
        v,
        price: v.prices[effPid],
        total: v.prices[effPid] * effQty,
        moqOk: effQty >= v.minOrderQty,
      }));

    if (!list.length) return [];

    const minP = Math.min(
      ...list.map((o) => o.price)
    );

    const minL = Math.min(
      ...list.map((o) => o.v.leadTimeDays)
    );

    return list
      .map((o) => ({
        ...o,
        score: Math.round(
          (50 * minP) / o.price +
            (30 * minL) / o.v.leadTimeDays +
            (20 * o.v.rating) / 5
        ),
      }))
      .sort((a, b) => b.score - a.score);
  }, [snap, effPid, effQty]);

  const cheapest = offers.length
    ? Math.min(...offers.map((o) => o.price))
    : 0;

  const fastest = offers.length
    ? Math.min(
        ...offers.map((o) => o.v.leadTimeDays)
      )
    : 0;

  const po =
    snap?.purchaseOrders.find(
      (p) => p.id === poId
    ) ?? snap?.purchaseOrders[0];

  const poVendor = po
    ? snap?.vendors.find(
        (v) => v.id === po.vendorId
      )
    : undefined;

  function reorder(
    id: string,
    suggested: number
  ) {
    setPid(id);
    setQty(suggested);
    setTab("compare");
  }

  // AI Restock Agent
  async function runRestockAgent() {
    setBusy(true);
    setErr("");

    setAgentMsg(
      "The agent is checking stock and comparing vendors…"
    );

    try {
      const r = await fetch("/api/agent/restock", {
        method: "POST",
      });

      const d = await r.json().catch(() => null);

      if (!r.ok) {
        setAgentMsg(
          d?.error ||
            "Unable to run the restock agent."
        );
        return;
      }

      setAgentMsg(
        d?.summary || d?.error || "Done."
      );

      await load();

      if (d?.created?.length) {
        setPoId(d.created[0]);
        setTab("orders");
      }
    } catch {
      setAgentMsg(
        "Failed to connect to the AI restock agent."
      );
    } finally {
      setBusy(false);
    }
  }

  async function order(vendorId: string) {
    const created = await act({
      action: "create",
      vendorId,
      productId: effPid,
      qty: effQty,
    });

    if (created) {
      setPoId(created.id);
      setTab("orders");
    }
  }

  async function sendMessage() {
    if (!po || !text.trim()) return;

    const t = text;
    setText("");

    await act({
      action: "message",
      poId: po.id,
      text: t,
    });
  }

  if (!snap) {
    return (
      <main className="container">
        <p>Loading…</p>
      </main>
    );
  }

  const low = snap.inventory.filter(
    (i) => i.low
  ).length;

  const openPos = snap.purchaseOrders.filter(
    (p) =>
      p.status !== "delivered" &&
      p.status !== "cancelled"
  ).length;

  return (
    <main className="container">
      <h1>Procurement</h1>

      <p style={{ color: "var(--muted)" }}>
        Track stock, compare vendors, order more,
        and follow deliveries.{" "}
        <b>{low}</b> low-stock item(s) ·{" "}
        <b>{openPos}</b> open purchase order(s)
      </p>

      <div className="tabs" role="tablist">
        {(
          ["stock", "compare", "orders"] as Tab[]
        ).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className="tab"
            onClick={() => setTab(t)}
          >
            {t === "stock"
              ? "Stock"
              : t === "compare"
              ? "Compare & order"
              : `Purchase orders (${snap.purchaseOrders.length})`}
          </button>
        ))}
      </div>

      {err && (
        <div
          className="note note-danger"
          style={{ marginBottom: 12 }}
          role="alert"
        >
          {err}
        </div>
      )}

      {/* ---------- STOCK ---------- */}
      {tab === "stock" && (
        <>
          {/* AI RESTOCK AGENT */}
          <div
            className="card"
            style={{
              padding: 14,
              marginBottom: 12,
            }}
          >
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={runRestockAgent}
            >
              {busy
                ? "Agent running…"
                : "Run AI restock agent"}
            </button>

            <span
              className="time"
              style={{ marginLeft: 10 }}
            >
              Reads stock and sales speed,
              compares vendors, drafts purchase
              orders. You approve every quote.
            </span>

            {agentMsg && (
              <p
                style={{
                  margin: "10px 0 0",
                  whiteSpace: "pre-wrap",
                }}
                role="status"
              >
                {agentMsg}
              </p>
            )}
          </div>

          {/* INVENTORY TABLE */}
          <div className="card table-wrap">
            <table className="simple">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>In stock</th>
                  <th>Level</th>
                  <th>Incoming</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {snap.inventory.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <b>{i.name}</b>
                      <div className="time">
                        {i.category}
                      </div>
                    </td>

                    <td>{i.stock}</td>

                    <td
                      style={{ minWidth: 120 }}
                    >
                      <div
                        className={`bar${
                          i.low ? " low" : ""
                        }`}
                      >
                        <i
                          style={{
                            width: `${Math.min(
                              100,
                              (i.stock /
                                (i.reorderLevel *
                                  3)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </td>

                    <td>
                      {i.incoming > 0
                        ? `+${i.incoming}`
                        : "-"}
                    </td>

                    <td>
                      {i.stock === 0 ? (
                        <span className="badge badge-danger">
                          Out of stock
                        </span>
                      ) : i.low ? (
                        <span className="badge badge-warn">
                          Low stock
                        </span>
                      ) : (
                        <span className="badge badge-success">
                          Healthy
                        </span>
                      )}
                    </td>

                    <td>
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          reorder(
                            i.id,
                            i.suggestedQty || 50
                          )
                        }
                      >
                        Reorder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---------- COMPARE ---------- */}
      {tab === "compare" && (
        <>
          <div
            className="card"
            style={{
              padding: 16,
              marginBottom: 16,
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "end",
            }}
          >
            <label>
              <div className="time">
                Product
              </div>

              <select
                value={effPid}
                onChange={(e) => {
                  setPid(e.target.value);
                  setQty(0);
                }}
                className="field"
              >
                {snap.inventory.map((i) => (
                  <option
                    key={i.id}
                    value={i.id}
                  >
                    {i.name} ({i.stock} in
                    stock)
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className="time">
                Quantity
              </div>

              <input
                className="field"
                type="number"
                min={1}
                max={5000}
                value={effQty}
                onChange={(e) =>
                  setQty(
                    Number(e.target.value)
                  )
                }
              />
            </label>

            {row &&
              row.suggestedQty > 0 && (
                <span className="badge badge-accent">
                  Suggested:{" "}
                  {row.suggestedQty} units
                </span>
              )}
          </div>

          <div className="card table-wrap">
            <table className="simple">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Location</th>
                  <th>Unit price</th>
                  <th>Total</th>
                  <th>Lead time</th>
                  <th>Rating</th>
                  <th>Min order</th>
                  <th>Match</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {offers.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      No vendor supplies this
                      product.
                    </td>
                  </tr>
                )}

                {offers.map((o, idx) => (
                  <tr key={o.v.id}>
                    <td>
                      <b>{o.v.name}</b>
                      <div className="time">
                        {o.v.contact} ·{" "}
                        {o.v.email}
                      </div>
                    </td>

                    <td>{o.v.city}</td>

                    <td>
                      {money(o.price)}{" "}
                      {o.price === cheapest && (
                        <span className="badge badge-success">
                          Cheapest
                        </span>
                      )}
                    </td>

                    <td>
                      {money(o.total)}
                    </td>

                    <td>
                      {o.v.leadTimeDays} days{" "}
                      {o.v.leadTimeDays ===
                        fastest && (
                        <span className="badge badge-accent">
                          Fastest
                        </span>
                      )}
                    </td>

                    <td>
                      {o.v.rating.toFixed(1)} /
                      5
                    </td>

                    <td>
                      {o.v.minOrderQty}

                      {!o.moqOk && (
                        <div
                          className="time"
                          style={{
                            color:
                              "var(--danger)",
                          }}
                        >
                          Below minimum
                        </div>
                      )}
                    </td>

                    <td>
                      {o.score}

                      {idx === 0 && (
                        <div>
                          <span className="badge badge-accent">
                            Recommended
                          </span>
                        </div>
                      )}
                    </td>

                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={
                          busy || !o.moqOk
                        }
                        onClick={() =>
                          order(o.v.id)
                        }
                      >
                        Request restock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p
            className="time"
            style={{ marginTop: 8 }}
          >
            Match score = 50% price, 30%
            delivery speed, 20% vendor rating.
          </p>
        </>
      )}

      {/* ---------- PURCHASE ORDERS ---------- */}
      {tab === "orders" &&
        (snap.purchaseOrders.length === 0 ? (
          <div
            className="card"
            style={{ padding: 20 }}
          >
            No purchase orders yet. Go to{" "}
            <b>Compare & order</b> to request
            a restock.
          </div>
        ) : (
          <div className="split">
            <div
              style={{
                display: "grid",
                gap: 8,
              }}
            >
              {snap.purchaseOrders.map(
                (p) => (
                  <button
                    key={p.id}
                    className="card po-item"
                    aria-pressed={
                      po?.id === p.id
                    }
                    onClick={() =>
                      setPoId(p.id)
                    }
                  >
                    <b>
                      {p.qty} ×{" "}
                      {p.productName}
                    </b>

                    <div className="time">
                      {p.vendorName}
                    </div>

                    <span
                      className={`badge ${
                        p.status ===
                        "delivered"
                          ? "badge-success"
                          : p.status ===
                            "cancelled"
                          ? "badge-danger"
                          : "badge-accent"
                      }`}
                    >
                      {LABEL[p.status]}
                    </span>
                  </button>
                )
              )}
            </div>

            {po && poVendor && (
              <div
                style={{
                  display: "grid",
                  gap: 16,
                }}
              >
                <section
                  className="card"
                  style={{ padding: 16 }}
                >
                  <h2
                    style={{
                      fontSize: 18,
                    }}
                  >
                    {po.qty} ×{" "}
                    {po.productName}
                  </h2>

                  <p
                    style={{
                      margin:
                        "0 0 12px",
                      color:
                        "var(--muted)",
                    }}
                  >
                    {po.vendorName} ·{" "}
                    {money(
                      po.unitPrice
                    )}{" "}
                    each ·{" "}
                    <b>
                      {money(
                        po.total
                      )}
                    </b>{" "}
                    total · ETA{" "}
                    {fmtDay(po.eta)}
                  </p>

                  {po.status ===
                  "cancelled" ? (
                    <span className="badge badge-danger">
                      Cancelled
                    </span>
                  ) : (
                    <div
                      className="stepper"
                      aria-label="Order progress"
                    >
                      {STEPS.map(
                        (s) => {
                          const done =
                            STEPS.indexOf(
                              s
                            ) <=
                            STEPS.indexOf(
                              po.status
                            );

                          return (
                            <span
                              key={s}
                              className={`badge ${
                                done
                                  ? "badge-success"
                                  : ""
                              }`}
                            >
                              {
                                LABEL[
                                  s
                                ]
                              }
                            </span>
                          );
                        }
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      display:
                        "flex",
                      gap: 8,
                      marginTop: 14,
                      flexWrap:
                        "wrap",
                    }}
                  >
                    {po.status ===
                      "quoted" && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={
                          busy
                        }
                        onClick={() =>
                          act({
                            action:
                              "accept",
                            poId:
                              po.id,
                          })
                        }
                      >
                        Accept quote
                      </button>
                    )}

                    {(po.status ===
                      "quoted" ||
                      po.status ===
                        "accepted") && (
                      <button
                        className="btn btn-sm"
                        disabled={
                          busy
                        }
                        onClick={() =>
                          act({
                            action:
                              "cancel",
                            poId:
                              po.id,
                          })
                        }
                      >
                        Cancel order
                      </button>
                    )}

                    {[
                      "accepted",
                      "shipped",
                      "in_transit",
                      "out_for_delivery",
                    ].includes(
                      po.status
                    ) && (
                      <button
                        className="btn btn-sm"
                        disabled={
                          busy
                        }
                        onClick={() =>
                          act({
                            action:
                              "advance",
                            poId:
                              po.id,
                          })
                        }
                      >
                        Demo: advance
                        delivery
                      </button>
                    )}
                  </div>
                </section>

                <section
                  className="card"
                  style={{
                    padding: 16,
                  }}
                >
                  <h3
                    style={{
                      fontSize: 16,
                    }}
                  >
                    Delivery tracking
                  </h3>

                  <p className="time">
                    Tracking ID:{" "}
                    {po.status ===
                      "quoted" ||
                    po.status ===
                      "accepted"
                      ? "assigned at dispatch"
                      : po.trackingId}{" "}
                    · Demo map,
                    simulated tracking
                  </p>

                  <DeliveryMap
                    vendor={
                      poVendor
                    }
                    shop={
                      snap.shop
                    }
                    po={po}
                  />

                  <ol
                    style={{
                      paddingLeft: 18,
                      margin:
                        "10px 0 0",
                    }}
                  >
                    {po.checkpoints
                      .length ===
                      0 && (
                      <li>
                        Not
                        dispatched
                        yet. Vendor
                        is in{" "}
                        {
                          poVendor.city
                        }
                        .
                      </li>
                    )}

                    {po.checkpoints.map(
                      (c, i) => (
                        <li key={i}>
                          <b>
                            {
                              c.label
                            }
                          </b>{" "}
                          (
                          {c.city}
                          ),{" "}
                          <span className="time">
                            {fmt(
                              c.time
                            )}
                          </span>
                        </li>
                      )
                    )}
                  </ol>
                </section>

                <section
                  className="card"
                  style={{
                    padding: 16,
                  }}
                >
                  <h3
                    style={{
                      fontSize: 16,
                    }}
                  >
                    Chat with{" "}
                    {
                      poVendor.contact
                    }{" "}
                    (
                    {
                      poVendor.name
                    }
                    )
                  </h3>

                  <p className="time">
                    {
                      poVendor.email
                    }{" "}
                    ·{" "}
                    {
                      poVendor.phone
                    }
                  </p>

                  <div
                    className="thread"
                    role="log"
                    aria-live="polite"
                  >
                    {po.messages.map(
                      (m) => (
                        <div
                          key={
                            m.id
                          }
                          className={`tmsg ${
                            m.from
                          }`}
                        >
                          <div>
                            {
                              m.text
                            }
                          </div>

                          <span className="time">
                            {m.from ===
                            "system"
                              ? "System"
                              : m.from ===
                                "owner"
                              ? "You"
                              : poVendor.contact}{" "}
                            ·{" "}
                            {fmt(
                              m.time
                            )}
                          </span>
                        </div>
                      )
                    )}

                    {busy && (
                      <div className="time">
                        Vendor is
                        typing…
                      </div>
                    )}
                  </div>

                  <form
                    className="composer"
                    style={{
                      padding:
                        "12px 0 0",
                      border: 0,
                    }}
                    onSubmit={(
                      e
                    ) => {
                      e.preventDefault();
                      void sendMessage();
                    }}
                  >
                    <label
                      htmlFor="vmsg"
                      className="sr-only"
                    >
                      Message the
                      vendor
                    </label>

                    <input
                      id="vmsg"
                      className="field"
                      style={{
                        flex: 1,
                      }}
                      maxLength={
                        500
                      }
                      value={
                        text
                      }
                      onChange={(
                        e
                      ) =>
                        setText(
                          e.target.value
                        )
                      }
                      placeholder="Ask about delivery, packaging, payment terms…"
                      disabled={
                        po.status ===
                        "cancelled"
                      }
                    />

                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={
                        busy ||
                        !text.trim() ||
                        po.status ===
                          "cancelled"
                      }
                    >
                      Send
                    </button>
                  </form>
                </section>
              </div>
            )}
          </div>
        ))}
    </main>
  );
}
