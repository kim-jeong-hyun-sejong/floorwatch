import { env } from "cloudflare:workers";

export const runtime = "edge";
const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const validRoom = (room: unknown): room is string => typeof room === "string" && /^[a-f0-9]{32}$/.test(room);

export async function GET(request: Request) {
  const room = new URL(request.url).searchParams.get("room");
  if (!validRoom(room)) return Response.json({ error: "invalid_room" }, { status: 400, headers });
  if (!env.DB) return Response.json({ error: "unavailable" }, { status: 503, headers });
  try {
    const result = await env.DB.prepare("SELECT floor, count, updated_at FROM floor_signals WHERE room = ?").bind(room).all<{ floor: number; count: number; updated_at: number }>();
    const now = Date.now();
    const floors = [3, 2, 1].map(floor => {
      const row = result.results.find(r => r.floor === floor);
      const fresh = !!row && now - row.updated_at <= 12_000 && now >= row.updated_at;
      return { floor, count: fresh ? row.count : 0, updatedAt: row?.updated_at ?? null, state: !fresh ? "offline" : row.count > 0 ? "active" : "empty" };
    });
    return Response.json({ floors }, { headers });
  } catch (error) {
    console.error("Floor state read failed", error);
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  if (!env.DB) return Response.json({ error: "unavailable" }, { status: 503, headers });
  try {
    if (Number(request.headers.get("content-length") ?? "0") > 512) return Response.json({ error: "too_large" }, { status: 413, headers });
    const data = await request.json() as { room?: unknown; floor?: unknown; count?: unknown };
    if (!validRoom(data.room) || !Number.isInteger(data.floor) || ![1, 2, 3].includes(data.floor as number) || !Number.isInteger(data.count) || (data.count as number) < 0 || (data.count as number) > 20) {
      return Response.json({ error: "invalid_signal" }, { status: 400, headers });
    }
    await env.DB.prepare("INSERT INTO floor_signals (room, floor, count, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(room, floor) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at")
      .bind(data.room, data.floor, data.count, Date.now()).run();
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Floor signal write failed", error);
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
