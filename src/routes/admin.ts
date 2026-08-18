import { Env } from '../env';
import { getIDToken, verifyToken } from '../auth';
import {
  authPlayer, getPlayerByName, getPlayerByID, setEmail, deleteUser, deleteClub, updateClubPoints,
  setUserBanStatus, warnUser, removeUserWarn, getLookForWarned, removeScore, getScore, getReplayFile,
  getPlayerNameByID, getPlayerIDByName, renamePlayer, listReports, getReport, removeReport,
  endWeekly, updatePlayerStats, grantPlayerRole, sendNotification, userIDsToNames,
  searchSameIPUsersByUserID, getPersistentData, setPersistentData, topScores,
} from '../db/queries';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Network-Id, X-Network-Token',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function empty(status = 200): Response {
  return new Response(null, { status, headers: CORS });
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

export async function handleAdminUserIps(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const username = url.searchParams.get('username');
    const userId = await getPlayerIDByName(env, username!);
    const matchingIds = await searchSameIPUsersByUserID(env, userId!);
    return json(await userIDsToNames(env, matchingIds));
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminUserData(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(403);
    const user = await getPlayerByName(env, url.searchParams.get('username')!);
    return json(user);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminUserSetEmail(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(403);
    const user = await getPlayerByName(env, url.searchParams.get('username')!);
    if (!user) return empty(404);
    await setEmail(env, user.id, url.searchParams.get('email')!);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminUserDelete(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(403);
    const target = await getPlayerByName(env, url.searchParams.get('username')!);
    if (!target) return empty(404);
    await deleteUser(env, target.id);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminClubDelete(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    await deleteClub(env, url.searchParams.get('tag')!);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminClubUpdatefp(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    await updateClubPoints(env, url.searchParams.get('tag')!);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminUserBan(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(403);
    const target = await getPlayerByName(env, url.searchParams.get('username')!);
    if (!target) return empty(404);
    const to = (url.searchParams.get('to') ?? 'false') === 'true';
    const reason = url.searchParams.get('reason') ?? '';
    if (to) await warnUser(env, target.id, auth[0], reason);
    await setUserBanStatus(env, target.id, to, reason);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminUserWarn(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(403);
    const target = await getPlayerByName(env, url.searchParams.get('username')!);
    if (!target) return empty(404);
    await warnUser(env, target.id, auth[0], url.searchParams.get('reason') ?? '');
    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return json({ error: exc.error_message ?? 'Failed to warn...' }, 400);
  }
}

export async function handleAdminUserWarnDelete(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    await removeUserWarn(env, url.searchParams.get('id')!);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminUserWarnList(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    return json(await getLookForWarned(env));
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminScoreDelete(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(403);
    await removeScore(env, url.searchParams.get('id')!, true);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminPlayers(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(403);
    return json({ rooms: [], playing_rooms: {} });
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminReloadconfig(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(403);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminUserGrant(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(403);
    const username = url.searchParams.get('username')!;
    const role = url.searchParams.get('role')!;
    if (await grantPlayerRole(env, username, role)) return empty(200);
    return empty(400);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminUserNotify(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const userId = await getPlayerIDByName(env, url.searchParams.get('user')!);
    await sendNotification(env, userId!, {
      title: url.searchParams.get('title') ?? '',
      content: url.searchParams.get('content') ?? undefined,
      image: url.searchParams.get('image') ?? undefined,
      href: url.searchParams.get('href') ?? undefined,
    });
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminUserRename(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const userId = await getPlayerIDByName(env, url.searchParams.get('user')!);
    await renamePlayer(env, userId!, url.searchParams.get('new')!);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminReportList(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const reports = await listReports(env);
    const data = [];
    for (const report of reports) {
      data.push({
        id: report.id,
        by: await getPlayerNameByID(env, report.by) ?? report.by,
        content: report.content,
        date: report.submitted,
      });
    }
    return json(data);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminReportContent(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const report = await getReport(env, url.searchParams.get('id')!);
    if (!report) return empty(404);
    if (report.content.startsWith('{')) {
      return json(JSON.parse(report.content));
    }
    return new Response(report.content, {
      status: 200,
      headers: { 'Content-Type': 'text/plain', ...CORS },
    });
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminReportDelete(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    await removeReport(env, url.searchParams.get('id')!);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminLogs(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const logs = await getPersistentData(env, 'logged_mod_actions');
    return json(Array.isArray(logs) ? logs : []);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminLogsProcess(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    return json([]);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminCooldownClear(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminEndweekly(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    await endWeekly(env);
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminUpdateweekly(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const rows = await env.DB.prepare('SELECT DISTINCT user_id FROM user_stats WHERE type = \'week\' AND (points_4k > 0 OR points_5k > 0 OR points_6k > 0 OR points_7k > 0 OR points_8k > 0 OR points_9k > 0)').all();
    for (const row of rows.results as any[]) {
      await updatePlayerStats(env, row.user_id);
    }
    return empty(200);
  } catch (exc) { console.error(exc); return empty(500); }
}

export async function handleAdminSongSubmit(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await requireAuth(request, env);
    if (!auth) return empty(401);
    const body = await request.json().catch(() => ({})) as any;
    const top = await topScores(env, body.id, 2, 0, body.keys);
    if (!top || top.length === 0) return empty(404);
    return empty(200);
  } catch (exc: any) {
    console.error(exc);
    return json({ error: exc.error_message ?? "Couldn't submit..." }, 400);
  }
}
