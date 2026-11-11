import type { PurchaseOrder, Vendor } from "@/lib/procurement";

type Props = { vendor: Vendor; shop: { city: string; lat: number; lng: number }; po: PurchaseOrder };

export default function DeliveryMap({ vendor, shop, po }: Props) {
  const W = 420, H = 260, PAD = 40;
  const pts = [vendor, shop, ...po.checkpoints];
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), minLng = Math.min(...lngs);
  const spanLat = Math.max(Math.max(...lats) - minLat, 0.5);
  const spanLng = Math.max(Math.max(...lngs) - minLng, 0.5);
  const x = (lng: number) => PAD + ((lng - minLng) / spanLng) * (W - PAD * 2);
  const y = (lat: number) => H - PAD - ((lat - minLat) / spanLat) * (H - PAD * 2);

  const current = po.checkpoints[po.checkpoints.length - 1];
  const trail = [vendor, ...po.checkpoints.slice(1)];

  return (
    <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Delivery route from ${vendor.city} to ${shop.city}`}>
      <line x1={x(vendor.lng)} y1={y(vendor.lat)} x2={x(shop.lng)} y2={y(shop.lat)} stroke="var(--border)" strokeWidth="3" strokeDasharray="6 6" />
      {current && (
        <polyline
          points={trail.map((p) => `${x(p.lng)},${y(p.lat)}`).join(" ")}
          fill="none" stroke="var(--accent)" strokeWidth="3"
        />
      )}
      <circle cx={x(vendor.lng)} cy={y(vendor.lat)} r="8" fill="var(--warn)" />
      <text x={x(vendor.lng)} y={y(vendor.lat) - 14} textAnchor="middle" fontSize="12" fill="var(--text)">{vendor.city}</text>
      <circle cx={x(shop.lng)} cy={y(shop.lat)} r="8" fill="var(--success)" />
      <text x={x(shop.lng)} y={y(shop.lat) + 22} textAnchor="middle" fontSize="12" fill="var(--text)">{shop.city} (your shop)</text>
      {current && po.status !== "delivered" && (
        <>
          <circle cx={x(current.lng)} cy={y(current.lat)} r="11" fill="var(--accent)" opacity="0.25" />
          <circle cx={x(current.lng)} cy={y(current.lat)} r="6" fill="var(--accent)" />
        </>
      )}
    </svg>
  );
}