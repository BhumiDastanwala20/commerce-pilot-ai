export default function HelpPage() {
  return (
    <main className="container" style={{ maxWidth: 720 }}>
      <h1>How to test the payment flow</h1>
      <p>CommercePilot uses the <b>PayPal sandbox</b>. No real money moves.</p>
      <ol>
        <li>Open the <a href="/shop">Shop</a> and chat with the assistant to build an order.</li>
        <li>Click <b>Pay with PayPal</b>. Log in with a sandbox <b>Personal</b> test account from the PayPal Developer Dashboard (Testing Tools → Sandbox Accounts).</li>
        <li>Approve the payment. You return to the shop with a confirmation.</li>
        <li>Open the <a href="/dashboard">Dashboard</a>. The order is marked paid and stock is reduced.</li>
        <li>Try a refund from the order details drawer, or run the AI restock agent in <a href="/dashboard/procurement">Procurement</a>.</li>
      </ol>
      <p className="time">Tip: use "Load demo data" on the dashboard to fill it with sample orders. Vendors and deliveries in Procurement are simulated.</p>
    </main>
  );
}