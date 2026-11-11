import Anthropic from "@anthropic-ai/sdk";
import type { SearchFilters, SortKey } from "../search";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

// Turns "cheap gift for my dad who loves cofee, under 30" into structured filters
export async function parseWithClaude(query: string, categories: string[]): Promise<SearchFilters | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: "You convert a shopper's search into structured filters for a small gift and home shop. Fix typos and infer intent (for example 'something for my dad who loves coffee' means keywords 'coffee mug gift'). Always call set_filters.",
      tools: [{
        name: "set_filters",
        description: "Structured search filters",
        input_schema: {
          type: "object",
          properties: {
            keywords: { type: "string", description: "Short product keywords, typo-corrected" },
            category: { type: "string", enum: categories },
            maxPrice: { type: "number" },
            minPrice: { type: "number" },
            inStockOnly: { type: "boolean" },
            sort: { type: "string", enum: ["relevance", "price_asc", "price_desc", "name", "stock"] },
          },
          required: ["keywords"],
        },
      }],
      tool_choice: { type: "tool", name: "set_filters" },
      messages: [{ role: "user", content: query }],
    });
    const block = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!block) return null;
    const i = block.input as { keywords?: string; category?: string; maxPrice?: number; minPrice?: number; inStockOnly?: boolean; sort?: string };
    return {
      q: String(i.keywords ?? "").slice(0, 120),
      category: i.category && categories.includes(i.category) ? i.category : undefined,
      maxPrice: typeof i.maxPrice === "number" && i.maxPrice > 0 ? i.maxPrice : undefined,
      minPrice: typeof i.minPrice === "number" && i.minPrice > 0 ? i.minPrice : undefined,
      inStock: i.inStockOnly || undefined,
      sort: (["price_asc", "price_desc", "name", "stock"].includes(i.sort ?? "") ? i.sort : undefined) as SortKey | undefined,
    };
  } catch (e) {
    console.error("Query parser error:", e);
    return null; // caller falls back to the free heuristic parser
  }
}