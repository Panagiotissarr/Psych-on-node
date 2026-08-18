import { Env } from '../env';

interface RoomInfo {
  roomId: string;
  name: string;
  clients: number;
  maxClients: number;
  isPrivate: boolean;
  isLocked: boolean;
  networkOnly: boolean;
  host: string | null;
  points: number | null;
  ping: number | null;
  doId: string;
}

export class RoomRegistryDO {
  ctx: DurableObjectState;
  env: Env;
  rooms: Map<string, RoomInfo> = new Map();
  lobbyIds: Set<string> = new Set();
  ipCounts: Map<string, number> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.ctx = state;
    this.env = env;

    this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get<Map<string, RoomInfo>>('rooms');
      if (saved) this.rooms = new Map(Object.entries(saved as any));
      const savedLobby = await this.ctx.storage.get<string[]>('lobbyIds');
      if (savedLobby) this.lobbyIds = new Set(savedLobby);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/register') {
      const body = await request.json<RoomInfo>();
      this.rooms.set(body.roomId, body);
      this.lobbyIds.add(body.roomId);
      await this.save();
      return Response.json({ ok: true });
    }

    if (path === '/unregister') {
      const body = await request.json<{ roomId: string }>();
      this.rooms.delete(body.roomId);
      this.lobbyIds.delete(body.roomId);
      await this.save();
      return Response.json({ ok: true });
    }

    if (path === '/update') {
      const body = await request.json<{ roomId: string; clients?: number; isPrivate?: boolean; isLocked?: boolean; meta?: any }>();
      const room = this.rooms.get(body.roomId);
      if (room) {
        if (body.clients !== undefined) room.clients = body.clients;
        if (body.isPrivate !== undefined) room.isPrivate = body.isPrivate;
        if (body.isLocked !== undefined) room.isLocked = body.isLocked;
        if (body.meta) {
          if (body.meta.name) room.name = body.meta.name;
          if (body.meta.ping !== undefined) room.ping = body.meta.ping;
          if (body.meta.points !== undefined) room.points = body.meta.points;
        }
        await this.save();
      }
      return Response.json({ ok: true });
    }

    if (path === '/list') {
      const showRooms: any[] = [];
      for (const [, room] of this.rooms) {
        if (!room.isPrivate && !room.isLocked && room.clients < room.maxClients) {
          showRooms.push({
            roomId: room.roomId,
            clients: room.clients,
            maxClients: room.maxClients,
            name: room.name,
            ping: room.ping,
            points: room.points,
          });
        }
      }
      return Response.json(showRooms);
    }

    if (path === '/query') {
      const body = await request.json<any>();
      const results: any[] = [];
      for (const [, room] of this.rooms) {
        if (body.name && room.name !== body.name) continue;
        if (body.locked !== undefined && room.isLocked !== body.locked) continue;
        if (body.private !== undefined && room.isPrivate !== body.private) continue;
        results.push({
          roomId: room.roomId,
          clients: room.clients,
          maxClients: room.maxClients,
          metadata: { name: room.name, ping: room.ping, points: room.points },
        });
      }
      return Response.json(results);
    }

    if (path === '/ip-check') {
      const body = await request.json<{ ip: string }>();
      const count = this.ipCounts.get(body.ip) || 0;
      if (count < 4) {
        this.ipCounts.set(body.ip, count + 1);
        await this.save();
        return Response.json({ allowed: true, count: count + 1 });
      }
      return Response.json({ allowed: false, count });
    }

    if (path === '/ip-release') {
      const body = await request.json<{ ip: string }>();
      const count = this.ipCounts.get(body.ip) || 0;
      if (count > 1) {
        this.ipCounts.set(body.ip, count - 1);
      } else {
        this.ipCounts.delete(body.ip);
      }
      await this.save();
      return Response.json({ ok: true });
    }

    if (path === '/generate-id') {
      const existing = Array.from(this.rooms.keys());
      let id: string;
      do {
        id = '';
        for (let i = 0; i < 4; i++) {
          id += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(Math.floor(Math.random() * 26));
        }
      } while (existing.includes(id));
      return Response.json({ id });
    }

    if (path === '/online-count') {
      let playerCount = 0;
      let roomFreeCount = 0;
      for (const [, room] of this.rooms) {
        playerCount += room.clients;
        if (!room.isPrivate && !room.isLocked) roomFreeCount++;
      }
      return Response.json({ playerCount, roomFreeCount });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  async save() {
    await this.ctx.storage.put('rooms', Object.fromEntries(this.rooms));
    await this.ctx.storage.put('lobbyIds', Array.from(this.lobbyIds));
  }
}
