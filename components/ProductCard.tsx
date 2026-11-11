import Link from "next/link";
import type { PublicProduct } from "@/lib/types";
import { money } from "@/lib/format";
import ProductArt from "./ProductArt";

type Props = { product: PublicProduct; onAsk?: (p: PublicProduct) => void };

export default function ProductCard({ product: p, onAsk }: Props) {
  const stockBadge =
    p.stock === 0 ? (
      <span className="badge badge-danger">Out of stock</span>
    ) : p.stock <= 40 ? (
      <span className="badge badge-warn">Low stock</span>
    ) : (
      <span className="badge badge-success">In stock</span>
    );

  return (
    <article className="card product-card">
      <ProductArt id={p.id} name={p.name} />
      <div className="body">
        <div className="meta">
          <span className="badge badge-accent">{p.category}</span>
          {stockBadge}
        </div>
        <h3 style={{ fontSize: 16 }}>{p.name}</h3>
        <p className="desc">{p.description}</p>
        <div className="foot">
          <span className="price">{money(p.price)}</span>
          {onAsk ? (
            <button className="btn btn-sm" onClick={() => onAsk(p)}>
              Ask AI about this
            </button>
          ) : (
            <Link className="btn btn-sm" href={`/shop?ask=${encodeURIComponent(p.name)}`}>
              Ask AI for a deal
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}