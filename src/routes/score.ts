import { Env } from '../env';
import { getIDToken, verifyToken } from '../auth';
import { getScore, getReplayFile, getPlayerNameByID, submitReport, submitScore, authPlayer, removeScore, setScoreModURL, getPlayerByID } from '../db/queries';

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

export async function handleScoreReplay(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const id = url.searchParams.get('id');
    if (!id) return empty(400);

    const score = await getScore(env, id);
    if (!score) return empty(404);

    const file = await getReplayFile(env, score.replay_file_id);
    if (!file || !file.data) return empty(404);

    const replay = JSON.parse(new TextDecoder().decode(file.data));
    replay.player = await getPlayerNameByID(env, score.player_id);
    replay.songId = score.song_id;

    return new Response(JSON.stringify(replay), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleScoreReport(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await authPlayer(request, env);
    if (!auth) return empty(401);
    const [id] = getIDToken(request);

    const body = await request.json().catch(() => ({})) as any;
    return json(await submitReport(env, id!, body.content));
  } catch (exc: any) {
    return json({ error: exc.error_message ?? "Couldn't report..." }, 400);
  }
}

export async function handleScoreSubmit(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await authPlayer(request, env);
    if (!auth) return empty(401);
    const [id] = getIDToken(request);

    const body = await request.json().catch(() => ({})) as any;
    return json(await submitScore(env, id!, body));
  } catch (exc: any) {
    console.error(exc);
    return json({ error: exc.error_message ?? "Couldn't submit..." }, 400);
  }
}

export async function handleScoreDelete(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await authPlayer(request, env);
    if (!auth) return empty(403);

    const scoreId = url.searchParams.get('id');
    await removeScore(env, scoreId!, false, auth.id);
    return empty(200);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleScoreSetModurl(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const auth = await authPlayer(request, env);
    if (!auth) return empty(403);

    const scoreId = url.searchParams.get('id');
    const modUrl = url.searchParams.get('url') ?? '';

    const score = await getScore(env, scoreId!);
    if (!score || score.player_id !== auth.id) return empty(403);

    await setScoreModURL(env, scoreId!, modUrl);
    return empty(200);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}
