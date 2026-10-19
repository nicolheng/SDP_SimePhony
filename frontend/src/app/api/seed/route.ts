import { loadSeedFromDb, SEED_DB_PATH } from "@/lib/seed-db";

// Read data/seed.db fresh on every request so regenerated seeds show up after Reset demo.
export const dynamic = "force-dynamic";

export function GET() {
  try {
    return Response.json(loadSeedFromDb());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err), path: SEED_DB_PATH }, { status: 503 });
  }
}
