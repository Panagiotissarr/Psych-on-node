import { Env } from './env';
import { handleRequest } from './routes/index';
import { GameRoomDO } from './durable-objects/GameRoomDO';
import { NetworkRoomDO } from './durable-objects/NetworkRoomDO';
import { RoomRegistryDO } from './durable-objects/RoomRegistryDO';

export { GameRoomDO, NetworkRoomDO, RoomRegistryDO };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Network-Id, X-Network-Token',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      const response = await handleRequest(request, env);

      // Add CORS headers to all responses
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Network-Id, X-Network-Token');

      return response;
    } catch (err: any) {
      console.error('Worker error:', err);
      return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Cron trigger for weekly resets and stats
    const now = Date.now();

    // Check weekly reset
    try {
      const row = await env.DB.prepare("SELECT value FROM persistent_data WHERE key = 'next_weekly_date'").first();
      if (row) {
        const nextWeekly = parseInt(row.value as string);
        if (now >= nextWeekly && nextWeekly > 0) {
          const WEEK_MS = 604800000;
          let newDate = nextWeekly + WEEK_MS;
          while (now >= newDate) {
            newDate += WEEK_MS;
          }
          await env.DB.prepare("UPDATE persistent_data SET value = ? WHERE key = 'next_weekly_date'")
            .bind(String(newDate)).run();

          // End weekly - delete all week category scores
          const weekScores = await env.DB.prepare(
            "SELECT id FROM scores WHERE category = 'week'"
          ).all();

          if (weekScores.results.length > 0) {
            const ids = weekScores.results.map(r => `'${r.id}'`).join(',');
            await env.DB.prepare(`DELETE FROM scores WHERE category = 'week'`).run();
          }

          // Notify via NetworkRoom DO
          const doId = env.NETWORK_ROOM.idFromName('network');
          const stub = env.NETWORK_ROOM.get(doId);
          await stub.fetch(new Request('https://do.internal/action/logToAll', {
            method: 'POST',
            body: JSON.stringify({ content: '[!] The weekly leaderboard has been reset!' }),
          }));
        }
      }
    } catch (err) {
      console.error('Weekly reset error:', err);
    }
  },
};

export { GameRoomDO as GameRoomDONamed } from './durable-objects/GameRoomDO';
export { NetworkRoomDO as NetworkRoomDONamed } from './durable-objects/NetworkRoomDO';
export { RoomRegistryDO as RoomRegistryDONamed } from './durable-objects/RoomRegistryDO';
