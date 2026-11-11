import type { PublicOrder } from "@/lib/types";
import { money } from "@/lib/format";

const statusBadge: Record<PublicOrder["status"], [string, string]> = {
  approval_needed: ["Awaiting approval", "badge-warn"],
  awaiting_payment: ["Ready to pay", "badge-accent"],
  paid: ["Paid", "badge-success"],
  rejected: ["Declined", "badge-danger"],
  refunded: ["Refunded", "badge-danger"],
  failed: ["Payment failed", "badge-danger"],
};

export default function OrderSummaryCard({ order }: { order: PublicOrder }) {
  const [label, cls] = statusBadge[order.status];
  return (
    <section className="card order-card" aria-label={`Order summary ${order.id}`}>
      <h4>Order summary <span className={`badge ${cls}`}>{label}</span></h4>
      <dl>
        {order.items.map((i) => (
          <div key={i.productId} style={{ display: "contents" }}>
            <dt>{i.qty} × {i.name}</dt>
            <dd>{money(i.unitPrice * i.qty)}</dd>
          </div>
        ))}
        {order.discountPercent > 0 && (<><dt>Discount applied</dt><dd>{order.discountPercent}% off</dd></>)}
        <dt className="total">Total</dt>
        <dd className="total">{money(order.total)}</dd>
      </dl>
      {order.status === "awaiting_payment" && order.checkoutLink && (
        <a className="btn btn-paypal" href={order.checkoutLink}>Pay with PayPal</a>
      )}
      {order.status === "approval_needed" && (
        <div className="note note-warn">The shop owner needs to approve this larger order. You'll get your payment link once it's approved.</div>
      )}
      {order.status === "paid" && <div className="note note-success">Payment received. Thank you!</div>}
    </section>
  );
}