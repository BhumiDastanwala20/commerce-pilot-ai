
import { addStock, findProduct, listProducts, loadKv, saveKv } from "./store";

export const SHOP = {
  name: "Your shop",
  city: "Mumbai",
  lat: 19.076,
  lng: 72.877,
};

export type Vendor = {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  lat: number;
  lng: number;
  rating: number;
  leadTimeDays: number;
  minOrderQty: number;
  prices: Record<string, number>;
};

export type PoStatus =
  | "quoted"
  | "accepted"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type PoMessage = {
  id: string;
  from: "owner" | "vendor" | "system";
  text: string;
  time: string;
};

export type Checkpoint = {
  label: string;
  city: string;
  lat: number;
  lng: number;
  time: string;
};

export type PurchaseOrder = {
  id: string;
  vendorId: string;
  vendorName: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  total: number;
  status: PoStatus;
  trackingId: string;
  messages: PoMessage[];
  checkpoints: Checkpoint[];
  eta: string;
  createdAt: string;
};

export type InventoryRow = {
  id: string;
  name: string;
  category: string;
  stock: number;
  reorderLevel: number;
  incoming: number;
  low: boolean;
  suggestedQty: number;
};

export type Snapshot = {
  shop: typeof SHOP;
  inventory: InventoryRow[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

const uid = (p: string) =>
  p + Math.random().toString(36).slice(2, 8);

const now = () => new Date().toISOString();

const SEEDS = [
  {
    id: "v1",
    name: "Bengaluru Craft Supply",
    contact: "Anita Rao",
    email: "orders@bengalurucraft.example",
    phone: "+91 80 5550 0101",
    city: "Bengaluru",
    lat: 12.972,
    lng: 77.595,
    rating: 4.6,
    leadTimeDays: 5,
    minOrderQty: 20,
    factor: 1.0,
    skip: [] as string[],
  },
  {
    id: "v2",
    name: "Delhi Wholesale Hub",
    contact: "Rohit Mehra",
    email: "sales@delhiwholesale.example",
    phone: "+91 11 5550 0102",
    city: "Delhi",
    lat: 28.614,
    lng: 77.209,
    rating: 4.2,
    leadTimeDays: 7,
    minOrderQty: 10,
    factor: 0.92,
    skip: ["giftbox"],
  },
  {
    id: "v3",
    name: "Pune QuickSupply",
    contact: "Neha Kulkarni",
    email: "hello@punequick.example",
    phone: "+91 20 5550 0103",
    city: "Pune",
    lat: 18.52,
    lng: 73.857,
    rating: 4.8,
    leadTimeDays: 2,
    minOrderQty: 25,
    factor: 1.12,
    skip: [] as string[],
  },
  {
    id: "v4",
    name: "Jaipur Artisans",
    contact: "Vikram Singh",
    email: "trade@jaipurartisans.example",
    phone: "+91 141 555 0104",
    city: "Jaipur",
    lat: 26.912,
    lng: 75.787,
    rating: 4.4,
    leadTimeDays: 4,
    minOrderQty: 15,
    factor: 0.97,
    skip: ["charger", "stand"],
  },
];

type State = {
  vendors: Vendor[];
  pos: PurchaseOrder[];
  reorderLevel: number;
};

function create(): State {
  return {
    reorderLevel: 50,
    pos: [],
    vendors: SEEDS.map(({ factor, skip, ...v }) => ({
      ...v,
      prices: Object.fromEntries(
        listProducts()
          .filter((p) => !skip.includes(p.id))
          .map((p) => [
            p.id,
            r2(p.minPrice * 0.6 * factor),
          ])
      ),
    })),
  };
}

const g = globalThis as unknown as {
  __proc?: State;
};

export const proc: State = (
  g.__proc ??= loadKv<State>("proc") ?? create()
);

export const findPo = (id: string) =>
  proc.pos.find((p) => p.id === id);

export const findVendor = (id: string) =>
  proc.vendors.find((v) => v.id === id);

export function addMessage(
  po: PurchaseOrder,
  from: PoMessage["from"],
  text: string
) {
  po.messages.push({
    id: uid("m_"),
    from,
    text,
    time: now(),
  });
}

export function snapshot(): Snapshot {
  const open = proc.pos.filter(
    (p) =>
      p.status !== "delivered" &&
      p.status !== "cancelled"
  );

  const inventory: InventoryRow[] = listProducts().map(
    (p) => {
      const incoming = open
        .filter((o) => o.productId === p.id)
        .reduce((s, o) => s + o.qty, 0);

      const need =
        proc.reorderLevel * 3 -
        p.stock -
        incoming;

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        stock: p.stock,
        reorderLevel: proc.reorderLevel,
        incoming,
        low: p.stock <= proc.reorderLevel,
        suggestedQty:
          need > 0
            ? Math.ceil(need / 10) * 10
            : 0,
      };
    }
  );

  return {
    shop: SHOP,
    inventory,
    vendors: proc.vendors,
    purchaseOrders: proc.pos,
  };
}

type Result =
  | { po: PurchaseOrder }
  | { error: string };

export function createPo(
  vendorId: string,
  productId: string,
  qty: number
): Result {
  const vendor = findVendor(vendorId);
  const product = findProduct(productId);

  if (!vendor || !product)
    return {
      error: "Unknown vendor or product.",
    };

  if (
    !Number.isInteger(qty) ||
    qty < 1 ||
    qty > 5000
  )
    return {
      error: "Quantity must be 1 to 5000.",
    };

  const unitPrice = vendor.prices[productId];

  if (unitPrice === undefined)
    return {
      error: `${vendor.name} doesn't supply this product.`,
    };

  if (qty < vendor.minOrderQty)
    return {
      error: `${vendor.name} requires at least ${vendor.minOrderQty} units.`,
    };

  const total = r2(unitPrice * qty);

  const po: PurchaseOrder = {
    id: uid("po_"),
    vendorId,
    vendorName: vendor.name,
    productId,
    productName: product.name,
    qty,
    unitPrice,
    total,
    status: "quoted",
    trackingId:
      "TRK" +
      Math.random()
        .toString(36)
        .slice(2, 9)
        .toUpperCase(),
    messages: [],
    checkpoints: [],
    eta: new Date(
      Date.now() +
        vendor.leadTimeDays * 86_400_000
    ).toISOString(),
    createdAt: now(),
  };

  addMessage(
    po,
    "system",
    `Restock request sent: ${qty} x ${product.name}.`
  );

  addMessage(
    po,
    "vendor",
    `Hi, ${vendor.contact} here from ${vendor.name}. Our quote for ${qty} x ${product.name} is $${unitPrice.toFixed(2)} per unit ($${total.toFixed(2)} total), delivered in about ${vendor.leadTimeDays} days. Reply "accept" in the app to confirm.`
  );

  proc.pos.unshift(po);

  return { po };
}

export function acceptPo(
  po: PurchaseOrder
): Result {
  if (po.status !== "quoted")
    return {
      error: "Only quoted orders can be accepted.",
    };

  po.status = "accepted";

  addMessage(
    po,
    "vendor",
    "Thank you, order confirmed. We'll dispatch within 24 hours."
  );

  return { po };
}

export function cancelPo(
  po: PurchaseOrder
): Result {
  if (
    po.status !== "quoted" &&
    po.status !== "accepted"
  )
    return {
      error: "Too late to cancel this order.",
    };

  po.status = "cancelled";

  addMessage(
    po,
    "system",
    "Order cancelled by the owner."
  );

  return { po };
}

const NEXT: Partial<
  Record<PoStatus, PoStatus>
> = {
  accepted: "shipped",
  shipped: "in_transit",
  in_transit: "out_for_delivery",
  out_for_delivery: "delivered",
};

const STEP: Partial<
  Record<PoStatus, number>
> = {
  shipped: 0,
  in_transit: 1,
  out_for_delivery: 2,
  delivered: 3,
};

// Demo only: real updates should come
// from a courier or vendor API.
export function advancePo(
  po: PurchaseOrder
): Result {
  const next = NEXT[po.status];
  const vendor = findVendor(po.vendorId);

  if (!next || !vendor)
    return {
      error: "Nothing to advance.",
    };

  const lerp = (t: number) => ({
    lat:
      vendor.lat +
      (SHOP.lat - vendor.lat) * t,
    lng:
      vendor.lng +
      (SHOP.lng - vendor.lng) * t,
  });

  const stops = [
    {
      label: "Dispatched from vendor warehouse",
      city: vendor.city,
      lat: vendor.lat,
      lng: vendor.lng,
    },
    {
      label: "Arrived at regional sorting hub",
      city: "Regional hub",
      ...lerp(0.45),
    },
    {
      label: "Out for delivery",
      city: `Near ${SHOP.city}`,
      ...lerp(0.88),
    },
    {
      label: "Delivered to your shop",
      city: SHOP.city,
      lat: SHOP.lat,
      lng: SHOP.lng,
    },
  ];

  const stop = stops[STEP[next] ?? 0];

  po.checkpoints.push({
    ...stop,
    time: now(),
  });

  po.status = next;

  if (next === "shipped")
    addMessage(
      po,
      "vendor",
      `Your order has been dispatched. Tracking ID: ${po.trackingId}.`
    );

  if (next === "delivered") {
    const product = findProduct(po.productId);

    if (product) {
      addStock(po.productId, po.qty);
    }

    addMessage(
      po,
      "system",
      `Delivered. ${po.qty} units added to your stock.`
    );
  }

  return { po };
}

export function scoreOffers(
  productId: string,
  qty: number
) {
  const list = proc.vendors
    .filter(
      (v) =>
        v.prices[productId] !== undefined
    )
    .map((v) => ({
      vendorId: v.id,
      vendor: v.name,
      city: v.city,
      unitPrice: v.prices[productId],
      total: r2(
        v.prices[productId] * qty
      ),
      leadTimeDays: v.leadTimeDays,
      rating: v.rating,
      minOrderQty: v.minOrderQty,
      moqOk: qty >= v.minOrderQty,
    }));

  if (!list.length) return [];

  const minP = Math.min(
    ...list.map((o) => o.unitPrice)
  );

  const minL = Math.min(
    ...list.map((o) => o.leadTimeDays)
  );

  return list
    .map((o) => ({
      ...o,
      score: Math.round(
        (50 * minP) / o.unitPrice +
          (30 * minL) / o.leadTimeDays +
          (20 * o.rating) / 5
      ),
    }))
    .sort(
      (a, b) => b.score - a.score
    );
}

export const saveProc = () =>
  saveKv("proc", proc);
