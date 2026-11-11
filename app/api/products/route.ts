import { listProducts, toPublicProduct } from "@/lib/store";

export async function GET() {
  return Response.json(listProducts().map(toPublicProduct)); // minPrice is never sent
}