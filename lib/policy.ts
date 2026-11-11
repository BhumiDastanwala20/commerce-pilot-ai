
import { findProduct, getRules } from "./store";
import type { Product } from "./store";
import type { OrderItem } from "./types";

const round = (n: number) =>
  Math.round(n * 100) / 100;

export type Verdict =
  | {
      status: "rejected";
      reason: string;
    }
  | {
      status: "approved" | "countered" | "needs_approval";
      unitPrice: number;
      total: number;
      discountPercent: number;
      reason: string;
    };

export function getFloorPrice(
  product: Product,
  qty: number
): number {
  const {
    maxDiscountPercent,
    bulkThreshold,
    bulkDiscountPercent,
  } = getRules();

  const disc =
    qty >= bulkThreshold
      ? bulkDiscountPercent
      : maxDiscountPercent;

  return round(
    Math.max(
      product.price * (1 - disc / 100),
      product.minPrice
    )
  );
}

export function checkDiscount(
  productId: string,
  qty: number,
  requestedPrice: number
): Verdict {
  const product = findProduct(productId);

  if (!product) {
    return {
      status: "rejected",
      reason: "We don't sell that product.",
    };
  }

  if (!Number.isInteger(qty) || qty < 1) {
    return {
      status: "rejected",
      reason: "Invalid quantity.",
    };
  }

  if (qty > product.stock) {
    return {
      status: "rejected",
      reason: `Only ${product.stock} in stock.`,
    };
  }

  const floor = getFloorPrice(product, qty);

  const wanted =
    Number.isFinite(requestedPrice) && requestedPrice > 0
      ? requestedPrice
      : product.price;

  const unit = round(
    Math.min(
      Math.max(wanted, floor),
      product.price
    )
  );

  const total = round(unit * qty);

  const discountPercent =
    Math.round(
      (1 - unit / product.price) * 1000
    ) / 10;

  if (total > getRules().approvalAbove) {
    return {
      status: "needs_approval",
      unitPrice: unit,
      total,
      discountPercent,
      reason:
        "Large order: the owner must approve it.",
    };
  }

  if (wanted >= floor) {
    return {
      status: "approved",
      unitPrice: unit,
      total,
      discountPercent,
      reason: "Within the owner's rules.",
    };
  }

  return {
    status: "countered",
    unitPrice: unit,
    total,
    discountPercent,
    reason: `Best allowed price is $${unit} per unit.`,
  };
}

export type CartInput = {
  productId: string;
  qty: number;
  agreedUnitPrice: number;
};

export type CartVerdict =
  | {
      status: "rejected";
      reason: string;
    }
  | {
      status: "approved" | "needs_approval";
      items: OrderItem[];
      listTotal: number;
      total: number;
      discountPercent: number;
      reason: string;
    };

export function priceCart(
  inputs: CartInput[]
): CartVerdict {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return {
      status: "rejected",
      reason: "Cart is empty.",
    };
  }

  const quantities = new Map<string, number>();
  const items: OrderItem[] = [];

  let listTotal = 0;
  let total = 0;

  for (const input of inputs) {
    const product = findProduct(input.productId);

    if (!product) {
      return {
        status: "rejected",
        reason: `Unknown product: ${input.productId}`,
      };
    }

    if (!Number.isInteger(input.qty) || input.qty < 1) {
      return {
        status: "rejected",
        reason: "Invalid quantity.",
      };
    }

    if (
      !Number.isFinite(input.agreedUnitPrice) ||
      input.agreedUnitPrice <= 0
    ) {
      return {
        status: "rejected",
        reason: `Invalid agreed price for ${product.name}.`,
      };
    }

    const combined =
      (quantities.get(product.id) ?? 0) + input.qty;

    if (combined > product.stock) {
      return {
        status: "rejected",
        reason: `Only ${product.stock} units of ${product.name} available.`,
      };
    }

    quantities.set(product.id, combined);

    const verdict = checkDiscount(
      product.id,
      combined,
      input.agreedUnitPrice
    );

    if (verdict.status === "rejected") {
      return verdict;
    }

    // Never silently increase an agreed price.
    if (
      verdict.unitPrice >
      round(input.agreedUnitPrice)
    ) {
      return {
        status: "rejected",
        reason: `Agreed price for ${product.name} is below the allowed minimum.`,
      };
    }

    items.push({
      productId: product.id,
      name: product.name,
      qty: input.qty,
      listPrice: product.price,
      unitPrice: verdict.unitPrice,
    });

    listTotal += product.price * input.qty;
    total += verdict.unitPrice * input.qty;
  }

  listTotal = round(listTotal);
  total = round(total);

  const discountPercent =
    listTotal > 0
      ? Math.round(
          (1 - total / listTotal) * 1000
        ) / 10
      : 0;

  const needsApproval =
    total > getRules().approvalAbove;

  return {
    status: needsApproval
      ? "needs_approval"
      : "approved",
    items,
    listTotal,
    total,
    discountPercent,
    reason: needsApproval
      ? "Large order: the owner must approve it."
      : "Within the owner's rules.",
  };
}
