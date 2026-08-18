import { Env } from '../env';
import { getIDToken, verifyToken } from '../auth';
import { getClub, getPlayerByID, getPlayerNameByID, getClubRank, getPlayerClub, createClub, requestJoinClub, acceptJoinClub, rejectJoinClub, getPlayerIDByName, removePlayerFromClub, promoteClubMember, demoteClubMember, postClubEdit, getUserStats, authPlayer, getPlayerClubTag } from '../db/queries';

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

export async function handleClubDetails(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const tag = url.searchParams.get('tag');
    if (!tag) return empty(400);

    const club = await getClub(env, tag);
    if (!club) return errorJson('Club not found');

    const memberIds: string[] = JSON.parse(club.members || '[]');
    const members = [];
    for (const memberId of memberIds) {
      const user = await getPlayerByID(env, memberId);
      const stats = await getUserStats(env, user?.id ?? memberId);
      members.push({
        player: user?.name ?? '???',
        points: stats?.points_4k ?? 0,
        profileHue: user?.profile_hue ?? 250,
        profileHue2: user?.profile_hue2 ?? null,
        country: user?.country ?? null,
      });
    }

    const leaderIds: string[] = JSON.parse(club.leaders || '[]');
    const leaders: (string | null)[] = [];
    for (const leaderId of leaderIds) {
      leaders.push(await getPlayerNameByID(env, leaderId));
    }

    members.sort((a: any, b: any) => {
      if (leaders.includes(a.player) === leaders.includes(b.player)) {
        return b.points - a.points;
      }
      return leaders.includes(a.player) ? -1 : 1;
    });

    return json({
      name: club.name,
      tag: club.tag,
      members,
      leaders,
      content: club.content,
      created: club.created,
      points: Number(club.points),
      rank: await getClubRank(env, club.tag),
      hue: club.hue,
    });
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleClubBanner(request: Request, env: Env, url: URL, tag: string): Promise<Response> {
  try {
    if (!tag) return empty(400);

    const banner = await env.DB.prepare('SELECT id, r2_key FROM file_banners WHERE club_tag = ?').bind(tag).first() as any;
    if (!banner) return empty(404);

    const obj = await env.R2.get(banner.r2_key);
    if (!obj) return empty(404);

    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        ...CORS_HEADERS,
      },
    });
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleClubPending(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const club = await getPlayerClub(env, id);
    if (!club) return errorJson('Not in a club');

    const leaderIds: string[] = JSON.parse(club.leaders || '[]');
    if (!leaderIds.includes(id)) {
      throw { error_message: 'Only club leaders can do that!' };
    }

    const pendingIds: string[] = JSON.parse(club.pending || '[]');
    const pending = [];
    for (const userId of pendingIds) {
      pending.push(await getPlayerNameByID(env, userId));
    }

    return json(pending);
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleClubCreate(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const body = await request.json().catch(() => ({})) as any;
    const club = await createClub(env, id, body);
    return json(club.tag);
  } catch (exc: any) {
    if (!exc?.error_message) console.error(exc);
    return errorJson(exc.error_message ?? "Couldn't create a club...");
  }
}

export async function handleClubJoin(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const tag = url.searchParams.get('tag');
    if (!tag) return empty(400);

    await requestJoinClub(env, tag, id);
    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleClubAccept(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const userName = url.searchParams.get('user');
    if (!userName) return empty(400);

    const club = await getPlayerClub(env, id);
    if (!club) return errorJson('Not in a club');

    const leaderIds: string[] = JSON.parse(club.leaders || '[]');
    if (!leaderIds.includes(id)) {
      throw { error_message: 'Only club leaders can do that!' };
    }

    const targetId = await getPlayerIDByName(env, userName);
    await acceptJoinClub(env, club.tag, targetId!);
    return empty(200);
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleClubReject(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const userName = url.searchParams.get('user');
    if (!userName) return empty(400);

    const club = await getPlayerClub(env, id);
    if (!club) return errorJson('Not in a club');

    const leaderIds: string[] = JSON.parse(club.leaders || '[]');
    if (!leaderIds.includes(id)) {
      throw { error_message: 'Only club leaders can do that!' };
    }

    const targetId = await getPlayerIDByName(env, userName);
    await rejectJoinClub(env, club.tag, targetId!);
    return empty(200);
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleClubKick(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const userName = url.searchParams.get('user');
    if (!userName) return empty(400);

    const club = await getPlayerClub(env, id);
    if (!club) return errorJson('Not in a club');

    const reqID = await getPlayerIDByName(env, userName);
    if (reqID === id) throw { error_message: 'You cannot kick yourself!' };

    const clubReq = await getPlayerClub(env, reqID!);
    const leaderIds: string[] = JSON.parse(club.leaders || '[]');
    if (!leaderIds.includes(id)) {
      throw { error_message: 'Only club leaders can do that!' };
    }
    if (club.id !== clubReq?.id) {
      throw { error_message: "You can't manage this club!" };
    }

    await removePlayerFromClub(env, reqID!);
    return empty(200);
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleClubPromote(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const userName = url.searchParams.get('user');
    if (!userName) return empty(400);

    const club = await getPlayerClub(env, id);
    if (!club) return errorJson('Not in a club');

    const targetId = await getPlayerIDByName(env, userName);
    const clubReq = await getPlayerClub(env, targetId!);
    const leaderIds: string[] = JSON.parse(club.leaders || '[]');
    if (!leaderIds.includes(id)) {
      throw { error_message: 'Only club leaders can do that!' };
    }
    if (club.id !== clubReq?.id) {
      throw { error_message: "You can't manage this club!" };
    }

    await promoteClubMember(env, targetId!);
    return empty(200);
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleClubDemote(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const userName = url.searchParams.get('user');
    if (!userName) return empty(400);

    const club = await getPlayerClub(env, id);
    if (!club) return errorJson('Not in a club');

    const targetId = await getPlayerIDByName(env, userName);
    const clubReq = await getPlayerClub(env, targetId!);
    const leaderIds: string[] = JSON.parse(club.leaders || '[]');
    if (!leaderIds.includes(id)) {
      throw { error_message: 'Only club leaders can do that!' };
    }
    if (club.id !== clubReq?.id) {
      throw { error_message: "You can't manage this club!" };
    }

    await demoteClubMember(env, targetId!);
    return empty(200);
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleClubLeave(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const club = await getPlayerClub(env, id);
    if (!club) throw { error_message: 'You are not in a club!' };

    await removePlayerFromClub(env, id);
    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}

export async function handleClubBannerPost(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const tag = url.searchParams.get('tag');
    if (!tag) throw { error_message: 'Invalid Request!' };

    const club = await getClub(env, tag);
    if (!club) return errorJson('Club not found');

    const leaderIds: string[] = JSON.parse(club.leaders || '[]');
    if (!leaderIds.includes(id)) {
      throw { error_message: 'Only club leaders can do that!' };
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return errorJson('No file uploaded');

    if (file.size > 1024 * 350) return empty(413);

    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif'];
    if (!allowedTypes.includes(file.type)) return empty(415);

    const buffer = await file.arrayBuffer();
    const r2Key = `banners/${tag}`;

    await env.R2.put(r2Key, buffer);
    await env.DB.prepare('DELETE FROM file_banners WHERE club_tag = ?').bind(tag).run();

    const fileIdBytes = new Uint8Array(16);
    crypto.getRandomValues(fileIdBytes);
    const fileId = Array.from(fileIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO file_banners (id, r2_key, size, club_tag) VALUES (?, ?, ?, ?)').bind(fileId, r2Key, file.size, tag).run();

    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return errorJson(exc.error_message ?? "Couldn't upload...");
  }
}

export async function handleClubEdit(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const [id] = auth;

    const tag = url.searchParams.get('tag');
    if (!tag) throw { error_message: 'Invalid Request!' };

    const club = await getClub(env, tag);
    if (!club) return errorJson('Club not found');

    const leaderIds: string[] = JSON.parse(club.leaders || '[]');
    if (!leaderIds.includes(id)) {
      throw { error_message: 'Only club leaders can do that!' };
    }

    const body = await request.json().catch(() => ({})) as any;
    await postClubEdit(env, club.tag, body);
    return empty(200);
  } catch (exc: any) {
    return errorJson(exc?.error_message ?? 'Unknown error...');
  }
}
