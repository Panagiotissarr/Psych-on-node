import { Env } from '../env';
import { getIDToken } from '../auth';
import { createUser, getPlayerByEmail, getPlayerNameByID, genAccessToken, getPlayerByID } from '../db/queries';

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

export async function handleRegister(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({})) as any;

    if (!body.email || !(body.email as string).includes('@')) {
      throw { error_message: 'Invalid Email Address!' };
    }

    const existing = await getPlayerByEmail(env, body.email);
    if (existing) {
      throw { error_message: 'Email already in use!' };
    }

    const user = await createUser(env, body.username, body.email);
    return json({
      id: user.id,
      token: await genAccessToken(env, user.id),
      secret: user.secret,
    });
  } catch (exc: any) {
    console.error(exc);
    return json({ error: exc.error_message ?? "Couldn't register..." }, 400);
  }
}

export async function handleLogin(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({})) as any;

    if (!body.email || !(body.email as string).includes('@')) {
      throw { error_message: 'Invalid Email Address!' };
    }

    const player = await getPlayerByEmail(env, body.email);
    if (!player) {
      throw { error_message: "Player with that email doesn't exist!" };
    }

    return json({
      id: player.id,
      token: await genAccessToken(env, player.id),
    });
  } catch (exc: any) {
    console.error(exc);
    return json({ error: exc.error_message ?? "Couldn't login..." }, 400);
  }
}

export async function handleCookie(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const id = url.searchParams.get('id');
    const token = url.searchParams.get('token');

    if (!id || !token) {
      return empty(400);
    }

    const userName = await getPlayerNameByID(env, id);
    if (!userName) return empty(400);

    const redirectUrl = '/user/' + userName;
    const response = Response.redirect(url.origin + redirectUrl, 302);

    response.headers.append('Set-Cookie', `authid=${id}; Path=/; Expires=Tue, 19 Jan 2038 03:14:07 GMT; SameSite=Lax`);
    response.headers.append('Set-Cookie', `authtoken=${token}; Path=/; Expires=Tue, 19 Jan 2038 03:14:07 GMT; SameSite=Lax`);

    return response;
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleLogout(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const response = new Response(null, { status: 200, headers: CORS_HEADERS });
    response.headers.append('Set-Cookie', 'authid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax');
    response.headers.append('Set-Cookie', 'authtoken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax');
    return response;
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}
