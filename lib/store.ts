import { db } from "./db";
import type { OrderItem, OrderStatus, OwnerOrder, PublicOrder, PublicProduct, Rules } from "./types";

export type Product = PublicProduct & { minPrice: number };
export type Order = OwnerOrder;

const now = () => new Date().toISOString();

/* ---------------- products & rules ---------------- */
type ProductRow = { id: string; name: string; description: string; category: string; tags: string; price: number; min_price: number; stock: number };
const toProduct = (r: ProductRow): Product => ({
  id: r.id, name: r.name, description: r.description, category: r.category,
  tags: JSON.parse(r.tags) as string[], price: r.price, minPrice: r.min_price, stock: r.stock,
});
export const listProducts = (): Product[] =>
  (db.prepare("SELECT * FROM products ORDER BY name").all() as ProductRow[]).map(toProduct);
export const findProduct = (id: string): Product | undefined => {
  const r = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
  return r ? toProduct(r) : undefined;
};
export const addStock = (id: string, n: number) =>
  db.prepare("UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?").run(n, id);

export function toPublicProduct(p: Product): PublicProduct {
  return { id: p.id, name: p.name, description: p.description, category: p.category, tags: p.tags, price: p.price, stock: p.stock };
}

export function getRules(): Rules {
  const r = db.prepare("SELECT * FROM rules WHERE id = 1").get() as {
    max_discount: number; bulk_threshold: number; bulk_discount: number; approval_above: number;
  };
  return { maxDiscountPercent: r.max_discount, bulkThreshold: r.bulk_threshold, bulkDiscountPercent: r.bulk_discount, approvalAbove: r.approval_above };
}
export const saveRulesAndMinPrices = db.transaction((r: Rules, minPrices: Record<string, number>) => {
  db.prepare("UPDATE rules SET max_discount=?, bulk_threshold=?, bulk_discount=?, approval_above=? WHERE id=1")
    .run(r.maxDiscountPercent, r.bulkThreshold, r.bulkDiscountPercent, r.approvalAbove);
  for (const [id, v] of Object.entries(minPrices)) db.prepare("UPDATE products SET min_price=? WHERE id=?").run(v, id);
});

/* ---------------- orders ---------------- */
type OrderRow = {
  id: string; items: string; list_total: number; total: number; discount_percent: number; status: string;
  checkout_link: string | null; reasoning: string | null; paypal_order_id: string | null; capture_id: string | null;
  trace: string; created_at: string; paid_at: string | null; refunded_at: string | null;
};
const toOrder = (r: OrderRow): Order => ({
  id: r.id, items: JSON.parse(r.items) as OrderItem[], listTotal: r.list_total, total: r.total,
  discountPercent: r.discount_percent, status: r.status as OrderStatus, checkoutLink: r.checkout_link,
  reasoning: r.reasoning ?? "", paypalOrderId: r.paypal_order_id, captureId: r.capture_id,
  trace: JSON.parse(r.trace), createdAt: r.created_at, paidAt: r.paid_at, refundedAt: r.refunded_at,
});
export const listOrders = (): Order[] =>
  (db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all() as OrderRow[]).map(toOrder);
export const findOrder = (id: string): Order | undefined => {
  const r = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  return r ? toOrder(r) : undefined;
};
export const findOrderByPaypalId = (pid: string): Order | undefined => {
  const r = db.prepare("SELECT * FROM orders WHERE paypal_order_id = ?").get(pid) as OrderRow | undefined;
  return r ? toOrder(r) : undefined;
};
export const findOrderByCaptureId = (cid: string): Order | undefined => {
  const r = db.prepare("SELECT * FROM orders WHERE capture_id = ?").get(cid) as OrderRow | undefined;
  return r ? toOrder(r) : undefined;
};
export function saveOrder(o: Order) {
  db.prepare(`INSERT OR REPLACE INTO orders
    (id,items,list_total,total,discount_percent,status,checkout_link,reasoning,paypal_order_id,capture_id,trace,created_at,paid_at,refunded_at)
    VALUES (@id,@items,@listTotal,@total,@discountPercent,@status,@checkoutLink,@reasoning,@paypalOrderId,@captureId,@trace,@createdAt,@paidAt,@refundedAt)`)
    .run({
      id: o.id, items: JSON.stringify(o.items), listTotal: o.listTotal, total: o.total,
      discountPercent: o.discountPercent, status: o.status, checkoutLink: o.checkoutLink,
      reasoning: o.reasoning, paypalOrderId: o.paypalOrderId, captureId: o.captureId,
      trace: JSON.stringify(o.trace), createdAt: o.createdAt, paidAt: o.paidAt ?? null, refundedAt: o.refundedAt ?? null,
    });
}
export function toPublicOrder(o: Order): PublicOrder {
  return {
    id: o.id, items: o.items, listTotal: o.listTotal, total: o.total, discountPercent: o.discountPercent,
    status: o.status, checkoutLink: o.checkoutLink, createdAt: o.createdAt,
  };
}

// Idempotent: the return route and the webhook can both call it, stock is decremented once
export const markOrderPaid = db.transaction((id: string, captureId?: string | null): boolean => {
  const o = findOrder(id);
  if (!o || o.status === "paid" || o.status === "refunded" || o.status === "rejected") return false;
  for (const it of o.items) {
    db.prepare("UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?").run(it.qty, it.productId);
  }
  o.status = "paid";
  o.paidAt = now();
  if (captureId) o.captureId = captureId;
  saveOrder(o);
  return true;
});

export const markOrderRefunded = db.transaction((id: string): boolean => {
  const o = findOrder(id);
  if (!o || o.status !== "paid") return false;
  for (const it of o.items) addStock(it.productId, it.qty); // goods return to stock
  o.status = "refunded";
  o.refundedAt = now();
  saveOrder(o);
  return true;
});

/* ---------------- searches, events, security ---------------- */
export function logSearch(sid: string, q: string, ids: string[]) {
  const last = db.prepare("SELECT id, query, created_at FROM searches WHERE session_id=? ORDER BY id DESC LIMIT 1")
    .get(sid) as { id: number; query: string; created_at: string } | undefined;
  // While the user is still typing the same query, update the row instead of adding noise
  if (last && Date.now() - Date.parse(last.created_at) < 10_000 && q.startsWith(last.query)) {
    db.prepare("UPDATE searches SET query=?, product_ids=?, created_at=? WHERE id=?").run(q, JSON.stringify(ids), now(), last.id);
    return;
  }
  db.prepare("INSERT INTO searches (session_id, query, product_ids, created_at) VALUES (?,?,?,?)").run(sid, q, JSON.stringify(ids), now());
}
export function recentSearches(sid: string, n: number): { query: string }[] {
  const rows = db.prepare("SELECT query FROM searches WHERE session_id=? ORDER BY id DESC LIMIT ?").all(sid, n * 2) as { query: string }[];
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.query) && seen.add(r.query)).slice(0, n);
}
export function topSearches(n: number): { q: string; c: number }[] {
  return db.prepare("SELECT lower(query) AS q, COUNT(*) AS c FROM searches GROUP BY lower(query) ORDER BY c DESC LIMIT ?").all(n) as { q: string; c: number }[];
}
export function logEvent(sid: string, productId: string, type: "view" | "ask" | "order") {
  db.prepare("INSERT INTO events (session_id, product_id, type, created_at) VALUES (?,?,?,?)").run(sid, productId, type, now());
}
export function recentEvents(sid: string, n: number): { productId: string; type: string }[] {
  return (db.prepare("SELECT product_id, type FROM events WHERE session_id=? ORDER BY id DESC LIMIT ?").all(sid, n) as { product_id: string; type: string }[])
    .map((r) => ({ productId: r.product_id, type: r.type }));
}
export function logAttempt(sid: string, message: string) {
  db.prepare("INSERT INTO security_events (session_id, message, created_at) VALUES (?,?,?)").run(sid, message.slice(0, 200), now());
}
export const countAttempts = () => (db.prepare("SELECT COUNT(*) AS c FROM security_events").get() as { c: number }).c;

/* ---------------- payouts & key-value ---------------- */
export function insertPayout(email: string, amount: number, note: string, status: string, batchId: string | null) {
  db.prepare("INSERT INTO payouts (email, amount, note, status, batch_id, created_at) VALUES (?,?,?,?,?,?)").run(email, amount, note, status, batchId, now());
}
export const listPayouts = () =>
  db.prepare("SELECT id, email, amount, note, status, batch_id AS batchId, created_at AS createdAt FROM payouts ORDER BY id DESC LIMIT 20").all();

export function loadKv<T>(key: string): T | null {
  const r = db.prepare("SELECT value FROM kv WHERE key=?").get(key) as { value: string } | undefined;
  return r ? (JSON.parse(r.value) as T) : null;
}
export function saveKv(key: string, value: unknown) {
  db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
}

/* ---------------- demo data ---------------- */
const DAY = 86_400_000;
const PLAN: [[string, number][], number, OrderStatus][] = [
  [[["mug", 12]], 6, "paid"], [[["candle", 2], ["notebook", 1]], 6, "paid"], [[["giftbox", 3]], 5, "paid"],
  [[["mug", 2], ["coasters", 1]], 5, "paid"], [[["tote", 20]], 4, "paid"], [[["stand", 3], ["charger", 2]], 4, "paid"],
  [[["candle", 6]], 3, "paid"], [[["bottle", 5]], 3, "paid"], [[["giftbox", 12]], 2, "approval_needed"],
  [[["lamp", 2], ["organizer", 1]], 2, "paid"], [[["mug", 3], ["candle", 1]], 1, "paid"], [[["planter", 3]], 1, "awaiting_payment"],
  [[["notebook", 2]], 0, "paid"], [[["lamp", 2]], 0, "refunded"], [[["coasters", 8]], 0, "paid"],
];
export function resetDemo() {
  db.prepare("DELETE FROM orders WHERE id LIKE 'demo_%'").run();
}
export function seedDemo() {
  resetDemo();
  PLAN.forEach(([lines, daysAgo, status], i) => {
    const items: OrderItem[] = lines.flatMap(([pid, qty]) => {
      const p = findProduct(pid);
      if (!p) return [];
      const unit = Math.round(p.price * (qty >= 10 ? 0.85 : 0.95) * 100) / 100;
      return [{ productId: pid, name: p.name, qty, listPrice: p.price, unitPrice: Math.max(unit, p.minPrice) }];
    });
    if (!items.length) return;
    const total = Math.round(items.reduce((s, x) => s + x.unitPrice * x.qty, 0) * 100) / 100;
    const listTotal = Math.round(items.reduce((s, x) => s + x.listPrice * x.qty, 0) * 100) / 100;
    const created = new Date(Date.now() - daysAgo * DAY - i * 3_600_000).toISOString();
    const paid = status === "paid" || status === "refunded";
    saveOrder({
      id: `demo_${i.toString().padStart(3, "0")}`, items, listTotal, total,
      discountPercent: Math.round((1 - total / listTotal) * 1000) / 10, status,
      checkoutLink: null, reasoning: "Demo order: bulk and loyalty discount applied within owner rules.",
      paypalOrderId: null, captureId: null,
      trace: [{ time: created, tool: "check_discount", input: { productId: items[0].productId, qty: items[0].qty }, verdict: "approved" }],
      createdAt: created, paidAt: paid ? new Date(Date.parse(created) + 300_000).toISOString() : null,
      refundedAt: status === "refunded" ? now() : null,
    });
  });
}