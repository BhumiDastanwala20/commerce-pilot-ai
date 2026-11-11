"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/rules", label: "Rules" },
  { href: "/dashboard/procurement", label: "Procurement" },
];

export default function DashNav() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Dashboard sections" style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 20px 0" }}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="tab" aria-selected={path === t.href} style={{ textDecoration: "none" }}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}