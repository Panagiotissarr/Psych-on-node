import { Env } from '../env';
import { getIDToken } from '../auth';
import { getSongComments, getPlayerNameByID, submitSongComment } from '../db/queries';

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

export async function handleSongComments(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const id = url.searchParams.get('id');
    if (!id) return empty(400);

    const comments = await getSongComments(env, id);
    if (!comments || comments.length === 0) return json([]);

    const cmts = [];
    for (const comment of comments) {
      cmts.push({
        player: await getPlayerNameByID(env, comment.by),
        content: comment.content,
        at: comment.at,
        submitted: comment.submitted,
      });
    }
    return json(cmts);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleSongComment(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const [id] = getIDToken(request);
    if (!id) return empty(401);

    const body = await request.json().catch(() => ({})) as any;
    return json(await submitSongComment(env, id, body));
  } catch (exc: any) {
    console.error(exc);
    return json({ error: exc.error_message ?? "Couldn't submit..." }, 400);
  }
}
