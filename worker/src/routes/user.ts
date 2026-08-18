import { Env } from '../env';
import { getIDToken, verifyToken } from '../auth';
import { getPlayerByName, getPlayerIDByName, getPlayerByID, getUserStats, getPlayerRank, getPlayerClubTag, userIDsToNames, removeFriendFromUser, requestFriendRequest, getScoresPlayer, authPlayer } from '../db/queries';
import { getAvatar, getBackground } from '../r2';

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

export async function handleUserFriendsRemove(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const [id, token] = getIDToken(request);
    if (!id || !token) return empty(401);

    const name = url.searchParams.get('name');
    if (!name) return empty(400);

    await removeFriendFromUser(env, name, id);
    return empty(200);
  } catch (exc: any) {
    return new Response(exc?.error_message ?? 'Unknown error...', { status: 400, headers: CORS_HEADERS });
  }
}

export async function handleUserFriendsRequest(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const [id, token] = getIDToken(request);
    if (!id || !token) return empty(401);

    const name = url.searchParams.get('name');
    if (!name) return empty(400);

    const targetId = await getPlayerIDByName(env, name);
    if (!targetId) return empty(404);

    await requestFriendRequest(env, id, targetId);
    return empty(200);
  } catch (exc: any) {
    return new Response(exc?.error_message ?? 'Unknown error...', { status: 400, headers: CORS_HEADERS });
  }
}

export async function handleUserAvatar(request: Request, env: Env, url: URL, userName: string): Promise<Response> {
  try {
    if (!userName) return empty(400);

    const userId = await getPlayerIDByName(env, userName);
    if (!userId) return empty(404);

    const file = await getAvatar(env, userId);
    if (!file) return empty(404);

    return new Response(file.data, {
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

export async function handleUserBackground(request: Request, env: Env, url: URL, userName: string): Promise<Response> {
  try {
    if (!userName) return empty(400);

    const userId = await getPlayerIDByName(env, userName);
    if (!userId) return empty(404);

    const file = await getBackground(env, userId);
    if (!file) return empty(404);

    return new Response(file.data, {
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

export async function handleUserInfo(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const name = url.searchParams.get('name');
    if (!name) return empty(400);

    const user = await getPlayerByName(env, name);
    if (!user) return empty(404);

    const keys = parseInt(url.searchParams.get('keys') ?? '4') || 4;
    const category = url.searchParams.get('category') ?? undefined;
    const stats = await getUserStats(env, user.id, category as any);

    return json({
      role: user.role,
      joined: user.joined,
      lastActive: user.last_active,
      profileHue: user.profile_hue ?? 250,
      profileHue2: user.profile_hue2,
      points: stats?.[`points_${keys}k`] ?? 0,
      avgAccuracy: stats?.[`avg_acc_${keys}k`] ?? 0,
      rank: await getPlayerRank(env, user.name, category as any, keys),
      country: user.country,
      club: await getPlayerClubTag(env, user.id),
    });
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleUserDetails(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const name = url.searchParams.get('name');
    if (!name) return empty(400);

    const auth = await authPlayer(request, env, false);
    const user = await getPlayerByName(env, name);
    if (!user) return empty(404);

    const keys = parseInt(url.searchParams.get('keys') ?? '4') || 4;
    const category = url.searchParams.get('category') ?? undefined;
    const stats = await getUserStats(env, user.id, category as any);

    const friendRequests: string[] = JSON.parse(user.friend_requests || '[]');

    return json({
      role: user.role,
      joined: user.joined,
      lastActive: user.last_active,
      isSelf: auth?.id === user.id,
      bio: user.bio,
      friends: await userIDsToNames(env, user.friends),
      canFriend: auth ? !friendRequests.includes(auth.id) : true,
      profileHue: user.profile_hue ?? 250,
      profileHue2: user.profile_hue2,
      points: stats?.[`points_${keys}k`] ?? 0,
      avgAccuracy: stats?.[`avg_acc_${keys}k`] ?? 0,
      rank: await getPlayerRank(env, user.name, category as any, keys),
      country: user.country,
      club: await getPlayerClubTag(env, user.id),
      ng: user.ng_url,
      warns: await import('../db/queries').then(m => m.getUserWarnings(env, user.id, false)),
    });
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleUserScores(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const name = url.searchParams.get('name');
    if (!name) return empty(400);

    const userID = await getPlayerIDByName(env, name);
    if (!userID) return empty(404);

    const page = parseInt(url.searchParams.get('page') ?? '0') || 0;
    const keys = parseInt(url.searchParams.get('keys') ?? '4') || 4;
    const category = url.searchParams.get('category') ?? undefined;
    const sort = url.searchParams.get('sort') ?? undefined;

    const scores = await getScoresPlayer(env, userID, page, keys, category, sort);
    if (!scores || scores.length === 0) return json([]);

    const coolScores = scores.map((score: any) => {
      const songIdParts = (score.song_id as string).split('-');
      songIdParts.pop();
      return {
        name: songIdParts.join(' '),
        songId: score.song_id,
        strum: score.strum,
        score: score.score,
        accuracy: score.accuracy,
        points: score.points,
        submitted: score.submitted,
        id: score.id,
        modURL: score.mod_url,
        misses: score.misses,
      };
    });

    return json(coolScores);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}
