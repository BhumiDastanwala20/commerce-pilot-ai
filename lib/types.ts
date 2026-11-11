export type OrderStatus = "approval_needed" | "awaiting_payment" | "paid" | "rejected" | "refunded" | "failed";

export type PublicProduct = {
  id: string; name: string; description: string; category: string;
  tags: string[]; price: number; stock: number;
};
export type OrderItem = { productId: string; name: string; qty: number; listPrice: number; unitPrice: number };
export type TraceEntry = { time: string; tool: string; input: unknown; verdict: string };

export type PublicOrder = {
  id: string; items: OrderItem[]; listTotal: number; total: number; discountPercent: number;
  status: OrderStatus; checkoutLink: string | null; createdAt: string;
};
// Owner-only fields, never sent to customers
export type OwnerOrder = PublicOrder & {
  reasoning: string; paypalOrderId: string | null; captureId: string | null;
  trace: TraceEntry[]; paidAt?: string | null; refundedAt?: string | null;
};
export type ChatApiResponse = { reply: string; order: PublicOrder | null };

export type Rules = { maxDiscountPercent: number; bulkThreshold: number; bulkDiscountPercent: number; approvalAbove: number };

export type SearchApplied = { q: string; category?: string; minPrice?: number; maxPrice?: number; inStock?: boolean; sort?: string };
export type SearchResponse = { products: PublicProduct[]; applied: SearchApplied; aiUsed: boolean; categories: string[] };
export type Recommendation = { product: PublicProduct; reason: string };

export const orderSummary = (items: OrderItem[]) => items.map((i) => `${i.qty} × ${i.name}`).join(", ");