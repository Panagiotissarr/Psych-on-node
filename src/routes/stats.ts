import { Env } from '../env';
import { getPersistentData } from '../db/queries';

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

export async function handleStatsDayPlayers(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const dayPlayers = await getPersistentData(env, 'day_players');
    return json(Array.isArray(dayPlayers) ? dayPlayers : []);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}

export async function handleStatsCountryPlayers(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const countryPlayers = await getPersistentData(env, 'country_players');
    const data = typeof countryPlayers === 'object' && countryPlayers !== null ? countryPlayers : {};
    const result: Record<string, number> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        result[key] = Array.isArray(data[key]) ? data[key].length : 0;
      }
    }
    return json(result);
  } catch (exc) {
    console.error(exc);
    return empty(500);
  }
}
