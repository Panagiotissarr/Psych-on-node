import { Env } from '../env';
import { getIDToken } from '../auth';

export enum CooldownTime {
    MINUTE = 60,
    HOUR = 3600,
    DAY = 86400,
}

const cooldownTimes: Map<string, number> = new Map();

function secondsDateNow(): number {
    return Date.now() / 1000;
}

export function setCooldownTime(timerId: string, timeSeconds: number): void {
    cooldownTimes.set(timerId, timeSeconds);
}

async function getCooldownExpiry(env: Env, entityId: string): Promise<number> {
    const row = await env.DB.prepare('SELECT expires FROM cooldowns WHERE id = ?').bind(entityId).first<{ expires: number }>();
    return row?.expires ?? 0;
}

async function setCooldownExpiry(env: Env, entityId: string, expires: number): Promise<void> {
    await env.DB.prepare('INSERT OR REPLACE INTO cooldowns (id, expires) VALUES (?, ?)').bind(entityId, expires).run();
}

export async function cooldownToTime(env: Env, entityId: string, timeSeconds: number): Promise<boolean> {
    const curTime = secondsDateNow();
    const expiry = await getCooldownExpiry(env, entityId);

    if (expiry >= curTime)
        return false;

    await setCooldownExpiry(env, entityId, curTime + timeSeconds);
    return true;
}

export async function cooldown(env: Env, entityId: string, timerId: string): Promise<boolean> {
    if (!cooldownTimes.has(timerId))
        return true;

    return cooldownToTime(env, entityId + '.' + timerId, cooldownTimes.get(timerId)!);
}

export async function cooldownLeft(env: Env, ids: string[]): Promise<number> {
    const key = ids.join('.');
    const expiry = await getCooldownExpiry(env, key);
    return Math.ceil(expiry - secondsDateNow());
}

export async function cooldownReq(env: Env, request: Request, timerId?: string): Promise<boolean> {
    const [id, token] = getIDToken(request);
    return ((id && token) ? cooldown(env, id + '::' + token, timerId ?? new URL(request.url).pathname) : true);
}

export async function clearCooldowns(env: Env): Promise<void> {
    await env.DB.prepare('DELETE FROM cooldowns').run();
}
