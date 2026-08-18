import { Env } from '../env';
import { getIDToken, verifyToken } from '../auth';
import { pingPlayer, getUserStats, getPlayerClubTag, getPlayerByID, userIDsToNames, getSentFriendRequests, getPlayerProfileHue, setPlayerBio, renamePlayer, setEmail, getPlayerByEmail, deleteUser, getNotifications, deleteNotification, getNotificationsCount, resetSecret, authPlayer } from '../db/queries';

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

function errorJson(msg: string, status = 400): Response {
  return json({ error: msg }, status);
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

export async function handleAccountMe(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);

    const [id] = auth;
    const player = await pingPlayer(env, id);
    const keys = parseInt(url.searchParams.get('keys') ?? '4') || 4;
    const category = url.searchParams.get('category') ?? undefined;
    const stats = await getUserStats(env, id, category as any);

    if (!player) return empty(403);

    return json({
      name: player.name,
      points: stats?.[`points_${keys}k`] ?? 0,
      avgAccuracy: stats?.[`avg_acc_${keys}k`] ?? 0,
      role: player.role,
      profileHue: player.profileHue ?? 250,
      profileHue2: player.profileHue2,
      country: player.country,
      access: [],
      club: await getPlayerClubTag(env, id),
      notifs: await getNotificationsCount(env, id),
    });
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleAccountInfo(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);

    const [id] = auth;
    const user = await pingPlayer(env, id);
    const keys = parseInt(url.searchParams.get('keys') ?? '4') || 4;
    const category = url.searchParams.get('category') ?? undefined;
    const stats = await getUserStats(env, id, category as any);

    return json({
      name: user?.name,
      role: user?.role,
      joined: user?.joined,
      lastActive: user?.lastActive,
      points: stats?.[`points_${keys}k`] ?? 0,
      avgAccuracy: stats?.[`avg_acc_${keys}k`] ?? 0,
      club: await getPlayerClubTag(env, id),
    });
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleAccountFriends(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);

    const [id] = auth;
    const player = await getPlayerByID(env, id);
    if (!player) return empty(403);

    const friendNames = await userIDsToNames(env, player.friends);
    const gotRequests = await userIDsToNames(env, player.friend_requests);
    const sentRequests = await getSentFriendRequests(env, player.id);

    const friends = [];
    for (const friend of friendNames) {
      const hue = await getPlayerProfileHue(env, friend);
      friends.push({
        name: friend,
        status: 'Offline',
        hue: hue?.[0] ?? 250,
        hue2: hue?.[1] ?? null,
      });
    }

    return json({
      friends,
      pending: sentRequests,
      requests: gotRequests,
    });
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleAccountAvatar(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return errorJson('No file uploaded');

    if (file.size > 1024 * 250) return empty(413);

    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif'];
    if (!allowedTypes.includes(file.type)) return empty(415);

    const buffer = await file.arrayBuffer();
    const r2Key = `avatars/${id}`;

    await env.R2.put(r2Key, buffer);
    await env.DB.prepare('DELETE FROM file_avatars WHERE owner = ?').bind(id).run();

    const fileIdBytes = new Uint8Array(16);
    crypto.getRandomValues(fileIdBytes);
    const fileId = Array.from(fileIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO file_avatars (id, r2_key, size, owner) VALUES (?, ?, ?, ?)').bind(fileId, r2Key, file.size, id).run();

    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return errorJson(exc.error_message ?? "Couldn't upload...");
  }
}

export async function handleAccountBackground(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const stats = await getUserStats(env, id);
    if ((stats?.points_4k ?? 0) < 1000) return empty(418);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return errorJson('No file uploaded');

    if (file.size > 1024 * 1000) return empty(413);

    const allowedTypes = ['image/png', 'image/jpeg'];
    if (!allowedTypes.includes(file.type)) return empty(415);

    const buffer = await file.arrayBuffer();
    const r2Key = `backgrounds/${id}`;

    await env.R2.put(r2Key, buffer);
    await env.DB.prepare('DELETE FROM file_backgrounds WHERE owner = ?').bind(id).run();

    const fileIdBytes = new Uint8Array(16);
    crypto.getRandomValues(fileIdBytes);
    const fileId = Array.from(fileIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO file_backgrounds (id, r2_key, size, owner) VALUES (?, ?, ?, ?)').bind(fileId, r2Key, file.size, id).run();

    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return errorJson(exc.error_message ?? "Couldn't upload...");
  }
}

export async function handleAccountRemoveImages(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    await env.DB.prepare('DELETE FROM file_backgrounds WHERE owner = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM file_avatars WHERE owner = ?').bind(id).run();

    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return errorJson(exc.error_message ?? "Couldn't remove...");
  }
}

export async function handleAccountClub(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const clubTag = await getPlayerClubTag(env, id);
    if (!clubTag) return empty(404);

    return json(clubTag);
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleAccountProfileSet(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const body = await request.json().catch(() => ({})) as any;
    await setPlayerBio(env, id, body.bio ?? '', parseInt(body.hue) || 0, body.country ?? '', parseInt(body.hue2 as string ?? '0') || 0);

    return empty(200);
  } catch (exc: any) {
    return errorJson(exc.error_message ?? "Couldn't set bio...");
  }
}

export async function handleAccountRename(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const body = await request.json().catch(() => ({})) as any;
    const result = await renamePlayer(env, id, body.username);
    return json(result.new);
  } catch (exc: any) {
    if (!exc?.error_message) console.error(exc);
    return errorJson(exc.error_message ?? "Couldn't change your handle...");
  }
}

export async function handleAccountEmailSet(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const body = await request.json().catch(() => ({})) as any;

    if (!body.email || !(body.email as string).includes('@')) {
      throw { error_message: 'Invalid Email Address!' };
    }

    const player = await getPlayerByID(env, id);
    if (player?.email && player.email !== body.old_email) {
      throw { error_message: 'Currently Set Email is Not Provided!' };
    }

    await setEmail(env, id, body.email);
    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return errorJson(exc.error_message ?? "Couldn't set the email...");
  }
}

export async function handleAccountDelete(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const player = await getPlayerByID(env, id);
    if (!player) return empty(400);

    await deleteUser(env, player.id);
    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return errorJson(exc.error_message ?? "Couldn't delete your account...");
  }
}

export async function handleAccountNotifications(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    return json(await getNotifications(env, id));
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleAccountNotificationsDelete(request: Request, env: Env, url: URL, notifId: string): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const notifs = await getNotifications(env, id);
    const hasNotif = notifs.some((n: any) => n.id === notifId);
    if (!hasNotif) return empty(401);

    await deleteNotification(env, notifId);
    return empty(200);
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

const ngSessions = new Map<string, any>();

export async function handleAccountLinkNewgrounds(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const user = await getPlayerByID(env, id);
    if (user?.ng_id) {
      return empty(200);
    }

    const lastSession = ngSessions.get(id);
    if (lastSession) {
      const formData = new URLSearchParams();
      formData.append('request', JSON.stringify({
        app_id: env.NETWORK_ENABLED,
        execute: { component: 'App.checkSession' },
        session_id: lastSession.id,
      }));

      const response = await fetch('https://www.newgrounds.io/gateway_v3.php', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      const data = await response.json() as any;

      if (data.success && data.result?.data) {
        const sessionData = data.result.data;
        if (!sessionData.expired && sessionData.session) {
          if (!sessionData.session.user) {
            ngSessions.set(id, sessionData.session);
            return json(sessionData.session.passport_url);
          }
          const { linkNewgrounds } = await import('../db/queries');
          await linkNewgrounds(env, id, Number(sessionData.session.user.id).toString(), sessionData.session.user.url);
          ngSessions.delete(id);
          return empty(200);
        }
      }
      ngSessions.delete(id);
    }

    const formData = new URLSearchParams();
    formData.append('request', JSON.stringify({
      app_id: env.NETWORK_ENABLED,
      execute: { component: 'App.startSession' },
    }));

    const response = await fetch('https://www.newgrounds.io/gateway_v3.php', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    const data = await response.json() as any;

    if (data.success && data.result?.data?.session) {
      ngSessions.set(id, data.result.data.session);
      return json(data.result.data.session.passport_url);
    }

    return errorJson('NG Refused');
  } catch (exc) {
    console.error(exc);
    return errorJson((exc as any)?.error_message ?? 'Unknown error...');
  }
}

export async function handleAccountUnlinkNewgrounds(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    ngSessions.delete(id);
    const { linkNewgrounds } = await import('../db/queries');
    await linkNewgrounds(env, id, null, null);
    return empty(200);
  } catch (exc) {
    console.error(exc);
    return errorJson((exc as any)?.error_message ?? 'Unknown error...');
  }
}

export async function handleAccountResetSecret(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    await resetSecret(env, id);
    return empty(200);
  } catch (exc) {
    console.error(exc);
    return errorJson((exc as any)?.error_message ?? 'Unknown error...');
  }
}
