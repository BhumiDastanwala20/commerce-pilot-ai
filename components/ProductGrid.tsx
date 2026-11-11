"use client";
import ProductCard from "./ProductCard";
import { useProducts } from "./useProducts";

export default function ProductGrid() {
  const { products, loading, error } = useProducts();
  if (loading) return <p>Loading products…</p>;
  if (error) return <p className="note note-danger">Couldn't load products. Please refresh.</p>;
  return (
    <div className="product-grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}