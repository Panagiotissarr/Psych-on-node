import { Env } from '../env';
import { getIDToken } from '../auth';
import { getPlayerNameByID, getPlayerByID, getPersistentData, setPersistentData } from '../db/queries';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Network-Id, X-Network-Token',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function text(data: string, status = 200): Response {
  return new Response(data, {
    status,
    headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
  });
}

function empty(status = 200): Response {
  return new Response(null, { status, headers: CORS_HEADERS });
}

export async function handleSezdetal(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const frontMessages = await getPersistentData(env, 'front_messages');
    const messages: Array<{ player: string; message: string }> = Array.isArray(frontMessages) ? frontMessages : [];
    const sezlist = [];
    for (const msg of messages) {
      const playerName = await getPlayerNameByID(env, msg.player);
      sezlist.push({ player: playerName ?? '???', message: msg.message });
    }
    return json(sezlist);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleOnline(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    return json({ network: 0, playing: 0, rooms: [] });
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleSez(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const [id] = getIDToken(request);
    if (!id) return empty(401);

    const body = await request.json().catch(() => ({})) as any;

    if (!body.message) return empty(418);
    if (body.message.length >= 100 || (body.message as string).includes('\n')) return empty(413);

    const frontMessages = await getPersistentData(env, 'front_messages');
    const messages: Array<{ player: string; message: string }> = Array.isArray(frontMessages) ? frontMessages : [];

    if (messages.length > 0 && messages[0].player === id) return empty(418);

    messages.unshift({ player: id, message: body.message });
    if (messages.length > 5) messages.pop();
    await setPersistentData(env, 'front_messages', messages);

    return empty(200);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleNextweekreset(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const val = await getPersistentData(env, 'next_weekly_date');
    return text(String(val ?? 0));
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleFront(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const frontMessages = await getPersistentData(env, 'front_messages');
    const messages: Array<{ player: string; message: string }> = Array.isArray(frontMessages) ? frontMessages : [];
    const sezlist = [];
    for (const msg of messages) {
      const playerName = await getPlayerNameByID(env, msg.player);
      sezlist.push({ player: playerName ?? '???', message: msg.message });
    }
    return json(sezlist);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleOnlinecount(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    return json({ count: 0 });
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleRooms(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    return json({ rooms: [] });
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}
