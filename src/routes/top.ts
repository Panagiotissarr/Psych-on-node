import { Env } from '../env';
import { topScores, topPlayers, topClubs, getPlayerNameByID, getPlayerClubTag } from '../db/queries';

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

export async function handleTopSong(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const song = url.searchParams.get('song');
    if (!song) return empty(400);

    const strum = parseInt(url.searchParams.get('strum') ?? '2') || 2;
    const page = parseInt(url.searchParams.get('page') ?? '0') || 0;
    const keys = parseInt(url.searchParams.get('keys') ?? '4') || 4;
    const category = url.searchParams.get('category') ?? undefined;
    const sort = url.searchParams.get('sort') ?? undefined;

    const _top = await topScores(env, song, strum, page, keys, category, sort);
    const top = [];
    for (const score of _top) {
      top.push({
        score: score.score,
        accuracy: score.accuracy,
        points: score.points,
        player: await getPlayerNameByID(env, score.player_id),
        submitted: score.submitted,
        id: score.id,
        misses: score.misses,
        modURL: score.mod_url,
        sicks: score.sicks,
        goods: score.goods,
        bads: score.bads,
        shits: score.shits,
        playbackRate: score.playback_rate,
      });
    }
    return json(top);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleTopPlayers(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const page = parseInt(url.searchParams.get('page') ?? '0') || 0;
    const country = url.searchParams.get('country') ?? undefined;
    const category = url.searchParams.get('category') ?? undefined;
    const sort = url.searchParams.get('sort') ?? 'points_4k';

    const _top = await topPlayers(env, page, country, category, sort);
    const top: any[] = [];
    if (_top) {
      for (const player of _top) {
        top.push({
          player: player.userRe.name,
          [sort]: player[sort],
          profileHue: player.userRe.profileHue ?? 250,
          profileHue2: player.userRe.profileHue2,
          country: player.userRe.country,
          club: await getPlayerClubTag(env, player.userRe.id),
        });
      }
    }
    return json(top);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleTopClubs(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const page = parseInt(url.searchParams.get('page') ?? '0');
    if (!url.searchParams.get('page')) return empty(400);

    const top = await topClubs(env, page);
    if (!top) return empty(404);

    return json(top);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}
