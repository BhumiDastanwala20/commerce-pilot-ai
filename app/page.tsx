import Link from "next/link";
import ProductGrid from "@/components/ProductGrid";

const steps = [
  ["1", "Ask", "Customers chat about products in plain language."],
  ["2", "Negotiate", "The AI haggles, but code enforces your limits."],
  ["3", "Pay", "A PayPal checkout appears right in the chat."],
  ["4", "Track", "The sale shows up live on your dashboard."],
];

export default function Home() {
  return (
    <main className="container">
      <section className="hero">
        <span className="badge badge-accent">Built with PayPal + AI</span>
        <h1>Your AI sales agent, open 24/7</h1>
        <p>
          It answers customers, negotiates within your rules, and sends a PayPal checkout link. You stay in control of
          every price.
        </p>
        <div className="actions">
          <Link href="/shop" className="btn btn-primary">Chat with the sales agent</Link>
          <Link href="/dashboard" className="btn">Owner dashboard</Link>
        </div>
      </section>

      <section className="steps" aria-label="How it works">
        {steps.map(([n, title, text]) => (
          <div key={n} className="card step">
            <span className="num">{n}</span>
            <b>{title}</b>
            <p>{text}</p>
          </div>
        ))}
      </section>

      <h2>Our products</h2>
      <ProductGrid />
    </main>
  );
}