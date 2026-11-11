import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]', price REAL NOT NULL, min_price REAL NOT NULL, stock INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY CHECK (id = 1), max_discount REAL NOT NULL, bulk_threshold INTEGER NOT NULL,
  bulk_discount REAL NOT NULL, approval_above REAL NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, items TEXT NOT NULL, list_total REAL NOT NULL, total REAL NOT NULL,
  discount_percent REAL NOT NULL, status TEXT NOT NULL, checkout_link TEXT, reasoning TEXT,
  paypal_order_id TEXT, capture_id TEXT, trace TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL, paid_at TEXT, refunded_at TEXT);
CREATE INDEX IF NOT EXISTS idx_orders_paypal ON orders(paypal_order_id);
CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, query TEXT NOT NULL,
  product_ids TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, product_id TEXT NOT NULL,
  type TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, amount REAL NOT NULL, note TEXT,
  status TEXT NOT NULL, batch_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

// id, name, category, description, tags, price, minPrice, stock
const PRODUCTS: [string, string, string, string, string[], number, number, number][] = [
  ["mug", "Ceramic Coffee Mug", "Kitchen", "350ml handmade mug in blue, white or black", ["coffee", "tea", "drink", "cup", "gift"], 18, 13, 200],
  ["notebook", "Leather Notebook", "Stationery", "A5 refillable notebook, brown leather", ["journal", "writing", "diary", "office", "gift"], 32, 24, 80],
  ["tote", "Canvas Tote Bag", "Accessories", "Heavy cotton tote, natural color", ["bag", "shopping", "eco", "carry"], 15, 10, 150],
  ["candle", "Scented Soy Candle", "Home", "Lavender or vanilla, 40 hour burn time", ["scent", "relax", "aroma", "decor", "gift"], 22, 16, 120],
  ["organizer", "Wooden Desk Organizer", "Office", "Walnut finish with 5 compartments", ["desk", "storage", "wood", "workspace"], 45, 34, 40],
  ["stand", "Phone Stand", "Tech", "Adjustable aluminum stand, silver or black", ["phone", "desk", "holder", "aluminum"], 25, 18, 90],
  ["charger", "Wireless Charging Pad", "Tech", "15W Qi wireless charger", ["phone", "wireless", "power", "qi"], 29, 21, 60],
  ["giftbox", "Gift Box Set", "Gifts", "Mug, candle and notebook, gift wrapped", ["present", "birthday", "set", "wrapped", "coffee"], 60, 48, 30],
  ["bottle", "Insulated Steel Bottle", "Kitchen", "Keeps drinks cold 24h or hot 12h", ["water", "drink", "travel", "gym", "eco"], 28, 20, 110],
  ["coasters", "Bamboo Coaster Set", "Home", "Set of 6 bamboo coasters", ["table", "drink", "eco", "kitchen"], 14, 10, 140],
  ["lamp", "LED Desk Lamp", "Office", "Dimmable lamp with USB port", ["light", "study", "workspace", "tech"], 38, 28, 55],
  ["planter", "Ceramic Planter", "Home", "Matte ceramic pot for small plants", ["plant", "decor", "garden", "gift"], 24, 17, 70],
];

function open(): Database.Database {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "commercepilot.db"));
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  db.prepare("INSERT OR IGNORE INTO rules VALUES (1, 10, 10, 15, 500)").run();
  const ins = db.prepare("INSERT OR IGNORE INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const [id, name, cat, desc, tags, price, min, stock] of PRODUCTS) {
    ins.run(id, name, desc, cat, JSON.stringify(tags), price, min, stock);
  }
  return db;
}

const g = globalThis as unknown as { __db?: Database.Database };
export const db: Database.Database = (g.__db ??= open());