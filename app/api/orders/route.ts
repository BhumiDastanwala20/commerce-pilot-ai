import { listOrders } from "@/lib/store";

export async function GET() {
  return Response.json(listOrders());
}