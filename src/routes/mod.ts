import { Env } from '../env';
import { getIDToken, verifyToken } from '../auth';
import { getMod, submitMod, editMod, deleteMod, toggleFavMod, giveDownloadURL, submitDownloadForMod, removeDownloadForMod, editDownloadForMod, userIDsToNames, getPlayerByID } from '../db/queries';

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

function empty(status = 200): Response {
  return new Response(null, { status, headers: CORS_HEADERS });
}

async function requireAuth(request: Request, env: Env): Promise<[string, string] | null> {
  const [id, token] = getIDToken(request);
  if (!id || !token) return null;
  const player = await getPlayerByID(env, id);
  if (!player) return null;
  const valid = await verifyToken(token, player.secret);
  if (!valid) return null;
  return [id, token];
}

export async function handleModDetails(request: Request, env: Env, url: URL, modId: string): Promise<Response> {
  try {
    const mod = await getMod(env, modId);
    if (!mod) return empty(404);

    mod.favorited = await userIDsToNames(env, mod.favorited);
    return json(mod);
  } catch (exc: any) {
    return new Response(exc?.error_message ?? 'None found...', { status: 400, headers: CORS_HEADERS });
  }
}

export async function handleModSubmit(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);

    const body = await request.json().catch(() => ({})) as any;
    return json(await submitMod(env, body));
  } catch (exc: any) {
    console.error(exc);
    return new Response(exc?.error_message ?? 'Failed to submit...', { status: 400, headers: CORS_HEADERS });
  }
}

export async function handleModEdit(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);

    const body = await request.json().catch(() => ({})) as any;
    return json(await editMod(env, body));
  } catch (exc: any) {
    console.error(exc);
    return new Response(exc?.error_message ?? 'Failed to submit...', { status: 400, headers: CORS_HEADERS });
  }
}

export async function handleModDelete(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);

    const body = await request.json().catch(() => ({})) as any;
    await deleteMod(env, body);
    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return new Response(exc?.error_message ?? 'Failed to submit...', { status: 400, headers: CORS_HEADERS });
  }
}

export async function handleModFav(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [userId] = auth;

    const body = await request.json().catch(() => ({})) as any;
    await toggleFavMod(env, userId, body.id as string);
    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return new Response(exc?.error_message ?? 'Failed to submit...', { status: 400, headers: CORS_HEADERS });
  }
}

export async function handleModDlRedirect(request: Request, env: Env, url: URL, modId: string, dlId: string): Promise<Response> {
  try {
    const url_result = await giveDownloadURL(env, modId + ':' + dlId);
    if (!url_result) return empty(404);
    return Response.redirect(url_result, 302);
  } catch (exc: any) {
    return new Response(exc?.error_message ?? 'None found...', { status: 400, headers: CORS_HEADERS });
  }
}

export async function handleModDlSubmit(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);

    const body = await request.json().catch(() => ({})) as any;
    await submitDownloadForMod(env, body.id as string, body.urls as string[], body.mod_id as string);
    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return new Response(exc?.error_message ?? 'None found...', { status: 400, headers: CORS_HEADERS });
  }
}

export async function handleModDlDelete(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);

    const body = await request.json().catch(() => ({})) as any;
    await removeDownloadForMod(env, body.id as string);
    return empty(200);
  } catch (exc: any) {
    return new Response(exc?.error_message ?? 'None found...', { status: 400, headers: CORS_HEADERS });
  }
}

export async function handleModDlEdit(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);

    const body = await request.json().catch(() => ({})) as any;
    await editDownloadForMod(env, body);
    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return new Response(exc?.error_message ?? 'Failed to submit...', { status: 400, headers: CORS_HEADERS });
  }
}
