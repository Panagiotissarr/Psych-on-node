import { Env } from '../env';
import { searchSongs, searchUsers, searchMods } from '../db/queries';

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

export async function handleSearchSongs(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const q = url.searchParams.get('q') ?? '';
    const page = parseInt(url.searchParams.get('page') ?? '0') || 0;
    return json(await searchSongs(env, q, page));
  } catch (exc: any) {
    return json(exc?.error_message ?? 'None found...', 400);
  }
}

export async function handleSearchUsers(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const q = url.searchParams.get('q') ?? '';
    const page = parseInt(url.searchParams.get('page') ?? '0') || 0;
    return json(await searchUsers(env, q, page));
  } catch (exc: any) {
    return json(exc?.error_message ?? 'None found...', 400);
  }
}

export async function handleSearchMods(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const q = url.searchParams.get('q') ?? '';
    const page = parseInt(url.searchParams.get('page') ?? '0') || 0;
    const sort = url.searchParams.get('sort') ?? undefined;
    return json(await searchMods(env, q, page, sort));
  } catch (exc: any) {
    console.error(exc);
    return json(exc?.error_message ?? 'None found...', 400);
  }
}
