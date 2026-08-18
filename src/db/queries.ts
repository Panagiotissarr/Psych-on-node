import { Env, UserProfile, UserStats, ScoreRow, ClubRow, ModRow, ModDownloadRow, NotificationRow, ReportRow, SongCommentRow, UserWarningRow, KEYS_LIST } from '../env';
import { generateToken, verifyToken, getIDToken } from '../auth';
import { filterUsername, filterSongName, hasOnlyLettersAndNumbers, removeFromArray } from '../utils';

const cachedIDtoName = new Map<string, string>();
const cachedNameToID = new Map<string, string>();
const cachedProfileNameHue = new Map<string, [number, number | null]>();
const cachedUserIDClubTag = new Map<string, string>();

function cachePlayerUniques(id: string, name: string) {
  cachedIDtoName.set(id, name);
  cachedNameToID.set(name, id);
}

export async function authPlayer(request: Request, env: Env, checkPerms = true): Promise<UserProfile | null> {
  const [id, token] = getIDToken(request);
  const player = await getPlayerByID(env, id);
  if (!player || !token || !id) return null;

  const valid = await verifyToken(token, player.secret);
  if (!valid) return null;

  return player;
}

export async function getPlayerByID(env: Env, id: string | null): Promise<UserProfile | null> {
  if (!id) return null;
  try {
    return await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first() as UserProfile | null;
  } catch {
    return null;
  }
}

export async function getPlayerByName(env: Env, name: string): Promise<UserProfile | null> {
  if (!name) return null;
  try {
    return await env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(name).first() as UserProfile | null;
  } catch {
    return null;
  }
}

export async function getPlayerNameByID(env: Env, id: string | null): Promise<string | null> {
  if (!id) return null;
  if (cachedIDtoName.has(id)) return cachedIDtoName.get(id)!;
  try {
    const row = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(id).first() as any;
    if (row) {
      cachePlayerUniques(id, row.name);
      return row.name;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getPlayerIDByName(env: Env, name: string | null): Promise<string | null> {
  if (!name) return null;
  if (cachedNameToID.has(name)) return cachedNameToID.get(name)!;
  try {
    const row = await env.DB.prepare('SELECT id FROM users WHERE name = ?').bind(name).first() as any;
    if (row) {
      cachePlayerUniques(row.id, name);
      return row.id;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getPlayerByEmail(env: Env, email: string): Promise<UserProfile | null> {
  if (!email) return null;
  try {
    return await env.DB.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').bind(email).first() as UserProfile | null;
  } catch {
    return null;
  }
}

export async function getPlayerClubTag(env: Env, id: string | null): Promise<string | null> {
  if (!id) return null;
  if (cachedUserIDClubTag.has(id)) return cachedUserIDClubTag.get(id)!;
  try {
    const club = await getPlayerClub(env, id);
    if (!club) return null;
    cachedUserIDClubTag.set(id, club.tag);
    return club.tag;
  } catch {
    return null;
  }
}

export async function pingPlayer(env: Env, id: string, keys?: number): Promise<any> {
  if (Number.isNaN(keys)) keys = undefined;
  keys ??= 4;
  if (!KEYS_LIST.includes(keys)) keys = 4;
  try {
    await env.DB.prepare('UPDATE users SET last_active = ? WHERE id = ?').bind(Date.now(), id).run();
    const user = await env.DB.prepare('SELECT name, role, joined, last_active, profile_hue, profile_hue2, country FROM users WHERE id = ?').bind(id).first() as any;
    const stats = await getUserStats(env, id);
    if (!user) return null;
    return {
      name: user.name,
      role: user.role,
      joined: user.joined,
      lastActive: user.last_active,
      profileHue: user.profile_hue ?? 250,
      profileHue2: user.profile_hue2,
      country: user.country,
      stats,
    };
  } catch (exc) {
    console.error(exc);
    return null;
  }
}

export async function genAccessToken(env: Env, id: string): Promise<string> {
  const player = await getPlayerByID(env, id);
  return generateToken(id, player!.secret);
}

export async function createUser(env: Env, name: string, email: string) {
  if (filterUsername(name) !== name) throw { error_message: 'Your username contains invalid characters!' };
  if (name.length < 3) throw { error_message: 'Your username is too short! (min 3 characters)' };
  if (name.length > 14) throw { error_message: 'Your username is too long! (max 14 characters)' };

  const count = await playerNameCount(env, name);
  if (count && count > 0) throw { error_message: 'Player with that username already exists!' };

  const existing = await getPlayerByEmail(env, email);
  if (existing) throw { error_message: "Can't set the same email for two accounts!" };

  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const idBytes = new Uint8Array(16);
  crypto.getRandomValues(idBytes);
  const id = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  await env.DB.prepare(
    'INSERT INTO users (id, name, email, secret) VALUES (?, ?, ?, ?)'
  ).bind(id, name, email, secret).run();

  await createUserStats(env, id);

  cachePlayerUniques(id, name);
  return { id, name, email, secret };
}

export async function playerNameCount(env: Env, name: string): Promise<number | null> {
  if (!name) return null;
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) as cnt FROM users WHERE LOWER(name) = LOWER(?)').bind(name).first() as any;
    return row?.cnt ?? 0;
  } catch {
    return null;
  }
}

export async function getUserStats(env: Env, id: string, type?: string): Promise<any> {
  if (type !== undefined && type !== 'week') return null;
  let stats = await _getUserStats(env, id, type);
  if (!stats) stats = await createUserStats(env, id, type);
  return stats;
}

async function _getUserStats(env: Env, id: string, type?: string): Promise<any> {
  try {
    if (type === undefined) {
      return await env.DB.prepare('SELECT * FROM user_stats WHERE user_id = ? AND type IS NULL').bind(id).first();
    }
    return await env.DB.prepare('SELECT * FROM user_stats WHERE user_id = ? AND type = ?').bind(id, type).first();
  } catch {
    return null;
  }
}

export async function createUserStats(env: Env, id: string, type?: string): Promise<any> {
  try {
    let existing: any;
    if (type === undefined) {
      existing = await env.DB.prepare('SELECT COUNT(*) as cnt FROM user_stats WHERE user_id = ? AND type IS NULL').bind(id).first();
    } else {
      existing = await env.DB.prepare('SELECT COUNT(*) as cnt FROM user_stats WHERE user_id = ? AND type = ?').bind(id, type).first();
    }
    if (existing && existing.cnt === 0) {
      const statIdBytes = new Uint8Array(16);
      crypto.getRandomValues(statIdBytes);
      const statId = Array.from(statIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      await env.DB.prepare('INSERT INTO user_stats (id, user_id, type) VALUES (?, ?, ?)').bind(statId, id, type ?? null).run();
    }
    return await _getUserStats(env, id, type);
  } catch {
    return null;
  }
}

export async function updatePlayerStats(env: Env, id: string, keys?: number[] | number) {
  if (!keys) keys = KEYS_LIST;
  let keysList: number[] = [];
  if (typeof keys === 'number') keysList.push(keys);
  if (Array.isArray(keys)) keysList = keys;

  for (const category of [undefined, 'week'] as const) {
    const statsData: Record<string, any> = {};
    for (let k of keysList) {
      if (!k) k = 4;
      if (!KEYS_LIST.includes(k)) continue;
      const points = await countPlayerFP(env, id, category, k);
      const avgAcc = await aggregatePlayerAccuracy(env, id, category, k);
      statsData[`points_${k}k`] = points;
      statsData[`avg_acc_${k}k`] = (avgAcc._avg_accuracy ?? 0) / 100;
    }

    const setClauses = Object.entries(statsData).map(([k, _]) => `${k} = ?`).join(', ');
    const values = Object.values(statsData);
    if (setClauses) {
      if (category === undefined) {
        await env.DB.prepare(`UPDATE user_stats SET ${setClauses} WHERE user_id = ? AND type IS NULL`).bind(...values, id).run();
      } else {
        await env.DB.prepare(`UPDATE user_stats SET ${setClauses} WHERE user_id = ? AND type = ?`).bind(...values, id, category).run();
      }
    }
  }

  const clubTag = await getPlayerClubTag(env, id);
  if (clubTag) await updateClubPoints(env, clubTag);
}

async function countPlayerFP(env: Env, id: string, category?: string, keys?: number): Promise<number> {
  try {
    const kvCol = `points_${keys ?? 4}k`;
    let row: any;
    if (category === undefined) {
      row = await env.DB.prepare(`SELECT COALESCE(SUM(${kvCol}), 0) as total FROM scores WHERE player_id = ? AND category IS NULL AND (keys IS NULL OR keys = ?)`).bind(id, keys ?? 4).first();
    } else {
      row = await env.DB.prepare(`SELECT COALESCE(SUM(${kvCol}), 0) as total FROM scores WHERE player_id = ? AND category = ? AND (keys IS NULL OR keys = ?)`).bind(id, category, keys ?? 4).first();
    }
    // scores table doesn't have points per key column, it has a single points column
    let row2: any;
    if (category === undefined) {
      row2 = await env.DB.prepare(`SELECT COALESCE(SUM(points), 0) as total FROM scores WHERE player_id = ? AND category IS NULL AND (keys IS NULL OR keys = ?)`).bind(id, keys ?? 4).first();
    } else {
      row2 = await env.DB.prepare(`SELECT COALESCE(SUM(points), 0) as total FROM scores WHERE player_id = ? AND category = ? AND (keys IS NULL OR keys = ?)`).bind(id, category, keys ?? 4).first();
    }
    return row2?.total ?? 0;
  } catch {
    return 0;
  }
}

async function aggregatePlayerAccuracy(env: Env, id: string, category?: string, keys?: number): Promise<{ _avg_accuracy: number }> {
  try {
    let row: any;
    if (category === undefined) {
      row = await env.DB.prepare(`SELECT COALESCE(SUM(accuracy), 0) as total, COUNT(*) as cnt FROM scores WHERE player_id = ? AND category IS NULL AND (keys IS NULL OR keys = ?)`).bind(id, keys ?? 4).first();
    } else {
      row = await env.DB.prepare(`SELECT COALESCE(SUM(accuracy), 0) as total, COUNT(*) as cnt FROM scores WHERE player_id = ? AND category = ? AND (keys IS NULL OR keys = ?)`).bind(id, category, keys ?? 4).first();
    }
    return { _avg_accuracy: (row?.total ?? 0) };
  } catch {
    return { _avg_accuracy: 0 };
  }
}

export async function getLoginPlayerByID(env: Env, id: string): Promise<{ secret: string; role: string | null; ips: string } | null> {
  if (!id) return null;
  try {
    return await env.DB.prepare('SELECT secret, role, ips FROM users WHERE id = ?').bind(id).first() as any;
  } catch {
    return null;
  }
}

export async function userIDsToNames(env: Env, ids: string[] | string): Promise<string[]> {
  if (!ids) return [];
  const idArr: string[] = typeof ids === 'string' ? JSON.parse(ids) : ids;
  if (!Array.isArray(idArr)) return [];
  const result: string[] = [];
  for (const id of idArr) {
    const name = await getPlayerNameByID(env, id);
    if (name) result.push(name);
  }
  return result;
}

export async function getSentFriendRequests(env: Env, userId: string): Promise<string[]> {
  try {
    const rows = await env.DB.prepare('SELECT name FROM users WHERE friend_requests LIKE ?').bind(`%"${userId}"%`).all();
    return rows.results.map((r: any) => r.name);
  } catch {
    return [];
  }
}

export async function removeFriendFromUser(env: Env, myName: string, requesterId: string): Promise<void> {
  const me = await getPlayerByName(env, myName);
  const remove = await getPlayerByID(env, requesterId);
  if (!me || !remove) throw { error_message: 'Player not found' };

  const myFriends: string[] = JSON.parse(me.friends || '[]');
  const removeFriends: string[] = JSON.parse(remove.friends || '[]');

  if (!myFriends.includes(remove.id)) throw { error_message: 'Not on friend list' };

  await env.DB.prepare('UPDATE users SET friends = ? WHERE id = ?').bind(JSON.stringify(removeFromArray(myFriends, remove.id)), me.id).run();
  await env.DB.prepare('UPDATE users SET friends = ? WHERE id = ?').bind(JSON.stringify(removeFromArray(removeFriends, me.id)), remove.id).run();
}

export async function requestFriendRequest(env: Env, userId: string, targetId: string): Promise<void> {
  const user = await getPlayerByID(env, userId);
  const myFriends: string[] = JSON.parse(user?.friends || '[]');
  if (myFriends.includes(targetId)) throw { error_message: 'Already frens :)' };

  const target = await getPlayerByID(env, targetId);
  if (!target) throw { error_message: 'Target not found!' };

  const targetRequests: string[] = JSON.parse(target.friend_requests || '[]');
  if (targetRequests.includes(userId)) {
    const newMyFriends = [...myFriends, targetId];
    const newTargetFriends = [...JSON.parse(target.friends || '[]'), userId];
    const newTargetRequests = removeFromArray(targetRequests, userId);
    await env.DB.prepare('UPDATE users SET friends = ?, friend_requests = ? WHERE id = ?').bind(JSON.stringify(newMyFriends), JSON.stringify(newTargetRequests), userId).run();
    await env.DB.prepare('UPDATE users SET friends = ? WHERE id = ?').bind(JSON.stringify(newTargetFriends), targetId).run();
    return;
  }

  if (targetRequests.includes(userId)) throw { error_message: 'Already pending!' };
  targetRequests.push(userId);
  await env.DB.prepare('UPDATE users SET friend_requests = ? WHERE id = ?').bind(JSON.stringify(targetRequests), targetId).run();
}

export async function getUserWarnings(env: Env, id: string, isMod: boolean): Promise<any[]> {
  try {
    const rows = await env.DB.prepare('SELECT id, reason, date, by FROM user_warnings WHERE on_user = ?').bind(id).all();
    const warns = [];
    for (const r of rows.results as any[]) {
      const warn: any = { date: r.date, reason: r.reason };
      if (isMod) {
        warn.id = r.id;
        warn.by = await getPlayerNameByID(env, r.by);
      }
      warns.push(warn);
    }
    return warns;
  } catch {
    return [];
  }
}

export async function getLookForWarned(env: Env): Promise<Record<string, any[]>> {
  try {
    const warnedObj: Record<string, any[]> = {};
    const rows = await env.DB.prepare('SELECT on_user, reason, date FROM user_warnings').all();
    for (const r of rows.results as any[]) {
      const role = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(r.on_user).first() as any;
      if (role?.role === 'Banned') continue;
      const name = await getPlayerNameByID(env, r.on_user);
      if (!name) continue;
      if (!warnedObj[name]) warnedObj[name] = [];
      warnedObj[name].push({ reason: r.reason, date: r.date });
    }
    return warnedObj;
  } catch {
    return {};
  }
}

export async function getPlayerRank(env: Env, name: string, category?: string, keys?: number): Promise<number> {
  if (Number.isNaN(keys)) keys = undefined;
  keys ??= 4;
  const userId = await getPlayerIDByName(env, name);
  try {
    let rows: any;
    if (category === undefined) {
      rows = await env.DB.prepare(`SELECT user_id FROM user_stats WHERE type IS NULL ORDER BY points_${keys}k DESC`).all();
    } else {
      rows = await env.DB.prepare(`SELECT user_id FROM user_stats WHERE type = ? ORDER BY points_${keys}k DESC`).bind(category).all();
    }
    const idx = rows.results.findIndex((r: any) => r.user_id === userId);
    return idx + 1;
  } catch {
    return 0;
  }
}

export async function getPlayerProfileHue(env: Env, name: string): Promise<[number, number | null] | null> {
  if (!name) return null;
  if (cachedProfileNameHue.has(name)) return cachedProfileNameHue.get(name)!;
  try {
    const row = await env.DB.prepare('SELECT profile_hue, profile_hue2 FROM users WHERE name = ?').bind(name).first() as any;
    if (row) {
      const result: [number, number | null] = [row.profile_hue ?? 250, row.profile_hue2];
      cachedProfileNameHue.set(name, result);
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setPlayerBio(env: Env, id: string, bio: string, hue: number, country: string, hue2: number): Promise<void> {
  await env.DB.prepare('UPDATE users SET bio = ?, profile_hue = ?, country = ?, profile_hue2 = ? WHERE id = ?')
    .bind(bio, hue, country, hue2, id).run();
}

export async function renamePlayer(env: Env, id: string, name: string): Promise<{ new: string }> {
  if (filterUsername(name) !== name) throw { error_message: 'Your username contains invalid characters!' };
  if (name.length < 3) throw { error_message: 'Your username is too short! (min 3 characters)' };
  if (name.length > 14) throw { error_message: 'Your username is too long! (max 15 characters)' };

  const count = await playerNameCount(env, name);
  if (count && count !== 0) throw { error_message: 'Player with that username exists!' };

  const oldPlayer = await getPlayerByID(env, id);
  if (oldPlayer) {
    cachedNameToID.delete(oldPlayer.name);
    cachedIDtoName.delete(id);
  }

  await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, id).run();
  cachePlayerUniques(id, name);

  return { new: name };
}

export async function setEmail(env: Env, id: string, email: string): Promise<void> {
  const existing = await getPlayerByEmail(env, email);
  if (existing) throw { error_message: "Can't set the same email for two accounts!" };
  await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, id).run();
}

export async function resetSecret(env: Env, id: string): Promise<void> {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('UPDATE users SET secret = ? WHERE id = ?').bind(secret, id).run();
}

export async function linkNewgrounds(env: Env, id: string, ngId: string | null, ngUrl: string | null): Promise<void> {
  if (ngId) {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE ng_id = ?').bind(ngId).first() as any;
    if (existing && existing.id !== id) {
      await env.DB.prepare('UPDATE users SET ng_id = NULL, ng_url = NULL WHERE id = ?').bind(existing.id).run();
    }
  }
  await env.DB.prepare('UPDATE users SET ng_id = ?, ng_url = ? WHERE id = ?').bind(ngId, ngUrl, id).run();
}

export async function deleteUser(env: Env, id: string): Promise<void> {
  await env.DB.prepare('UPDATE users SET role = \'Banned\', bio = \'This account was banned by a moderator!\' WHERE id = ?').bind(id).run();
  const statsData: Record<string, number> = {};
  for (const key of KEYS_LIST) {
    statsData[`points_${key}k`] = 0;
    statsData[`avg_acc_${key}k`] = 0;
  }
  const setClauses = Object.entries(statsData).map(([k]) => `${k} = 0`).join(', ');
  await env.DB.prepare(`UPDATE user_stats SET ${setClauses} WHERE user_id = ?`).bind(id).run();
  await env.DB.prepare('DELETE FROM scores WHERE player_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM song_comments WHERE "by" = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM reports WHERE "by" = ?').bind(id).run();

  // Remove R2 files
  try {
    const avatar = await env.DB.prepare('SELECT id FROM file_avatars WHERE owner = ?').bind(id).first() as any;
    if (avatar) await env.R2.delete(avatar.id);
    await env.DB.prepare('DELETE FROM file_avatars WHERE owner = ?').bind(id).run();
  } catch {}
  try {
    const bg = await env.DB.prepare('SELECT id FROM file_backgrounds WHERE owner = ?').bind(id).first() as any;
    if (bg) await env.R2.delete(bg.id);
    await env.DB.prepare('DELETE FROM file_backgrounds WHERE owner = ?').bind(id).run();
  } catch {}

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  cachedIDtoName.delete(id);
}

export async function setUserBanStatus(env: Env, id: string, to: boolean, reason?: string): Promise<void> {
  await env.DB.prepare('UPDATE users SET role = ?, bio = ? WHERE id = ?')
    .bind(to ? 'Banned' : 'User', 'This account was banned by a moderator!\nReason: ' + (reason ?? ''), id).run();

  if (to) {
    const statsData: Record<string, number> = {};
    for (const key of KEYS_LIST) {
      statsData[`points_${key}k`] = 0;
      statsData[`avg_acc_${key}k`] = 0;
    }
    const setClauses = Object.entries(statsData).map(([k]) => `${k} = 0`).join(', ');
    await env.DB.prepare(`UPDATE user_stats SET ${setClauses} WHERE user_id = ?`).bind(id).run();
    await env.DB.prepare('DELETE FROM scores WHERE player_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM song_comments WHERE "by" = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM reports WHERE "by" = ?').bind(id).run();
  }
}

export async function warnUser(env: Env, userId: string, byId: string, reason: string): Promise<void> {
  const submitter = await getPlayerByID(env, userId);
  if (!submitter) throw { error_message: 'Not registered!' };
  if (reason.trim().length < 5) throw { error_message: 'Reason too short!' };

  const idBytes = new Uint8Array(16);
  crypto.getRandomValues(idBytes);
  const warnId = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  await env.DB.prepare('INSERT INTO user_warnings (id, reason, "by", on_user) VALUES (?, ?, ?, ?)')
    .bind(warnId, reason, byId, userId).run();
}

export async function removeUserWarn(env: Env, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM user_warnings WHERE id = ?').bind(id).run();
}

export async function grantPlayerRole(env: Env, name: string, role: string): Promise<boolean> {
  try {
    await env.DB.prepare('UPDATE users SET role = ? WHERE name = ?').bind(role, name).run();
    return true;
  } catch {
    return false;
  }
}

export async function getPriority(env: Env, user: UserProfile | null): Promise<number> {
  if (!user) return 0;
  return 0;
}

export async function sendNotification(env: Env, toID: string, content: { title: string; content?: string; image?: string; href?: string }): Promise<void> {
  const idBytes = new Uint8Array(16);
  crypto.getRandomValues(idBytes);
  const notifId = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  await env.DB.prepare('INSERT INTO notifications (id, to_user, title, content, image, href) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(notifId, toID, content.title, content.content ?? null, content.image ?? null, content.href ?? null).run();
}

export async function getNotifications(env: Env, id: string): Promise<any[]> {
  try {
    const rows = await env.DB.prepare('SELECT id, date, title, content, image, href FROM notifications WHERE to_user = ? ORDER BY date DESC').bind(id).all();
    return rows.results.map((r: any) => ({
      id: r.id, date: r.date, title: r.title, content: r.content, image: r.image, href: r.href,
    }));
  } catch {
    return [];
  }
}

export async function getNotificationsCount(env: Env, id: string): Promise<number> {
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE to_user = ?').bind(id).first() as any;
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

export async function deleteNotification(env: Env, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM notifications WHERE id = ?').bind(id).run();
}

export async function getScore(env: Env, id: string): Promise<ScoreRow | null> {
  try {
    return await env.DB.prepare('SELECT * FROM scores WHERE id = ?').bind(id).first() as ScoreRow | null;
  } catch {
    return null;
  }
}

export async function getReplayFile(env: Env, id: string | null): Promise<{ id: string; r2_key: string; data?: ArrayBuffer } | null> {
  if (!id) return null;
  try {
    const row = await env.DB.prepare('SELECT id, r2_key FROM file_replays WHERE id = ?').bind(id).first() as any;
    if (!row) return null;
    const obj = await env.R2.get(row.r2_key);
    if (!obj) return null;
    const data = await obj.arrayBuffer();
    return { id: row.id, r2_key: row.r2_key, data };
  } catch {
    return null;
  }
}

export async function submitScore(env: Env, submitterID: string, replay: any): Promise<any> {
  if (replay.version !== 4) throw { error_message: 'Replay version mismatch error, can\'t submit!\nPlease update!' };
  if (!replay) throw { error_message: 'Empty Replay Data!' };

  const noteEvents = replay.shits + replay.bads + replay.goods + replay.sicks;
  if (noteEvents <= 0 || replay.inputs.length <= 0) throw { error_message: 'Empty Replay' };
  if (replay.points < 0 || replay.points > 10000 || replay.score > 100000000) throw { error_message: 'Illegal Score Value in the Replay Data' };

  const submitter = await getPlayerByID(env, submitterID);
  if (!submitter) throw { error_message: 'Unknown Submitter!' };

  const daKeyValue = replay.keys ?? 4;
  if (!KEYS_LIST.includes(daKeyValue)) throw { error_message: 'Submit - Invalid Key: ' + daKeyValue };
  const daStrum = replay.opponent_mode ? 1 : 2;

  const prevRank = await getPlayerRank(env, submitter.name, undefined, daKeyValue);
  const prevStats = await getUserStats(env, submitter.id);

  const songId = filterSongName(replay.song) + '-' + filterSongName(replay.difficulty) + '-' + filterSongName(replay.chart_hash);

  let song = await env.DB.prepare('SELECT id FROM songs WHERE id = ?').bind(songId).first() as any;
  if (!song) {
    await env.DB.prepare('INSERT OR IGNORE INTO songs (id) VALUES (?)').bind(songId).run();
    song = { id: songId };
  }

  let gainedPoints = 0;

  for (const category of [undefined, 'week']) {
    let existingScore: any;
    if (category === undefined) {
      existingScore = await env.DB.prepare(
        'SELECT score, points, accuracy, id FROM scores WHERE song_id = ? AND player_id = ? AND strum = ? AND category IS NULL AND (keys IS NULL OR keys = ?)'
      ).bind(songId, submitter.id, daStrum, daKeyValue).first();
    } else {
      existingScore = await env.DB.prepare(
        'SELECT score, points, accuracy, id FROM scores WHERE song_id = ? AND player_id = ? AND strum = ? AND category = ? AND (keys IS NULL OR keys = ?)'
      ).bind(songId, submitter.id, daStrum, category, daKeyValue).first();
    }

    if (existingScore) {
      if (!(replay.score > existingScore.score || replay.points > existingScore.points || replay.accuracy > existingScore.accuracy)) continue;
      await removeScore(env, existingScore.id);
    }

    let playbackRate = 1;
    try { playbackRate = replay.gameplay_modifiers.songspeed; } catch {}

    const replayString = JSON.stringify(replay);
    const replayIdBytes = new Uint8Array(16);
    crypto.getRandomValues(replayIdBytes);
    const replayId = Array.from(replayIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const r2Key = `replays/${replayId}`;

    await env.R2.put(r2Key, replayString);
    await env.DB.prepare('INSERT INTO file_replays (id, r2_key, size) VALUES (?, ?, ?)').bind(replayId, r2Key, replayString.length).run();

    const scoreIdBytes = new Uint8Array(16);
    crypto.getRandomValues(scoreIdBytes);
    const scoreId = Array.from(scoreIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    await env.DB.prepare(
      'INSERT INTO scores (id, score, accuracy, points, sicks, goods, bads, shits, misses, playback_rate, strum, mod_url, category, keys, song_id, player_id, replay_file_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(scoreId, replay.score, replay.accuracy, replay.points, replay.sicks, replay.goods, replay.bads, replay.shits, replay.misses, playbackRate, daStrum, replay.mod_url, category ?? null, daKeyValue === 4 ? null : daKeyValue, songId, submitter.id, replayId).run();

    gainedPoints += replay.points;
  }

  await updatePlayerStats(env, submitter.id, daKeyValue);
  const newStats = await getUserStats(env, submitter.id);
  const newRank = await getPlayerRank(env, submitter.name, undefined, daKeyValue);

  return {
    song: songId,
    message: 'Submitted!',
    gained_points: gainedPoints,
    climbed_ranks: prevRank - newRank,
  };
}

export async function submitReport(env: Env, id: string, content: any): Promise<any> {
  const idBytes = new Uint8Array(16);
  crypto.getRandomValues(idBytes);
  const reportId = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('INSERT INTO reports (id, content, "by") VALUES (?, ?, ?)').bind(reportId, typeof content === 'string' ? content : JSON.stringify(content), id).run();
  return { id: reportId };
}

export async function removeScore(env: Env, scoreId: string, _admin = false, _checkPlayerID?: string): Promise<void> {
  try {
    const score = await env.DB.prepare('SELECT replay_file_id, song_id, player_id FROM scores WHERE id = ?').bind(scoreId).first() as any;
    if (!score) return;
    if (score.replay_file_id) {
      const replay = await env.DB.prepare('SELECT r2_key FROM file_replays WHERE id = ?').bind(score.replay_file_id).first() as any;
      if (replay) {
        try { await env.R2.delete(replay.r2_key); } catch {}
        await env.DB.prepare('DELETE FROM file_replays WHERE id = ?').bind(score.replay_file_id).run();
      }
    }
    await env.DB.prepare('DELETE FROM scores WHERE id = ?').bind(scoreId).run();
    if (score.player_id) await updatePlayerStats(env, score.player_id);
  } catch (exc) {
    console.error(exc);
  }
}

export async function setScoreModURL(env: Env, scoreId: string, newModURL: string): Promise<void> {
  await env.DB.prepare('UPDATE scores SET mod_url = ? WHERE id = ?').bind(newModURL, scoreId).run();
}

export async function getSongComments(env: Env, id: string): Promise<any[]> {
  try {
    const rows = await env.DB.prepare('SELECT content, "at", "by", submitted FROM song_comments WHERE song_id = ? ORDER BY "at" ASC').bind(id).all();
    return rows.results;
  } catch {
    return [];
  }
}

export async function submitSongComment(env: Env, userId: string, body: any): Promise<any> {
  const submitter = await getPlayerByID(env, userId);
  if (!submitter) throw { error_message: 'Not registered!' };

  await env.DB.prepare('DELETE FROM song_comments WHERE "by" = ? AND song_id = ?').bind(userId, body.id).run();

  if ((body.content as string).length < 2) throw { error_message: 'Too short!' };
  if ((body.content as string).length > 100) throw { error_message: 'Too long!' };

  const idBytes = new Uint8Array(16);
  crypto.getRandomValues(idBytes);
  const commentId = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  await env.DB.prepare('INSERT INTO song_comments (id, content, "at", "by", song_id) VALUES (?, ?, ?, ?, ?)')
    .bind(commentId, body.content, Number.parseFloat(body.at), userId, body.id).run();
  return { id: commentId };
}

export async function topScores(env: Env, songId: string, strum: number, page: number, keys?: number, category?: string, sort?: string): Promise<any[]> {
  const [_sortBy, _sortDirection] = (sort ?? '').split(':');
  let sortBy = 'score';
  let sortDirection = 'desc';
  if (['points', 'accuracy', 'score', 'submitted', 'misses'].includes(_sortBy)) sortBy = _sortBy;
  if (['desc', 'asc'].includes(_sortDirection)) sortDirection = _sortDirection;

  try {
    let query: string;
    let params: any[];

    const categoryFilter = category === undefined ? 'AND category IS NULL' : 'AND category = ?';
    const keysFilter = (!keys || keys === 4) ? 'AND (keys IS NULL OR keys = 4)' : 'AND keys = ?';

    if (category === undefined && (!keys || keys === 4)) {
      query = `SELECT * FROM scores WHERE song_id = ? AND strum = ? ${categoryFilter} ${keysFilter} ORDER BY ${sortBy} ${sortDirection} LIMIT 15 OFFSET ?`;
      params = [songId, strum, 15 * page];
    } else if (category === undefined) {
      query = `SELECT * FROM scores WHERE song_id = ? AND strum = ? ${keysFilter} ORDER BY ${sortBy} ${sortDirection} LIMIT 15 OFFSET ?`;
      params = [songId, strum, keys, 15 * page];
    } else if (!keys || keys === 4) {
      query = `SELECT * FROM scores WHERE song_id = ? AND strum = ? AND category = ? ORDER BY ${sortBy} ${sortDirection} LIMIT 15 OFFSET ?`;
      params = [songId, strum, category, 15 * page];
    } else {
      query = `SELECT * FROM scores WHERE song_id = ? AND strum = ? AND category = ? AND keys = ? ORDER BY ${sortBy} ${sortDirection} LIMIT 15 OFFSET ?`;
      params = [songId, strum, category, keys, 15 * page];
    }

    const rows = await env.DB.prepare(query).bind(...params).all();
    return rows.results;
  } catch (exc) {
    console.error(exc);
    return [];
  }
}

export async function topPlayers(env: Env, page: number, country?: string, category?: string, sortProp?: string): Promise<any[]> {
  sortProp ??= 'points_4k';
  if (!sortProp.startsWith('points_') && !sortProp.startsWith('avg_acc_')) return [];

  try {
    let query: string;
    let params: any[];

    const typeFilter = category === undefined ? 'AND us.type IS NULL' : 'AND us.type = ?';
    const countryFilter = country ? 'AND u.country = ?' : '';

    if (category === undefined && !country) {
      query = `SELECT us.*, u.name, u.profile_hue, u.profile_hue2, u.country FROM user_stats us JOIN users u ON u.id = us.user_id WHERE us.type IS NULL ${countryFilter} ORDER BY us.${sortProp} DESC LIMIT 15 OFFSET ?`;
      params = [15 * page];
    } else if (category === undefined) {
      query = `SELECT us.*, u.name, u.profile_hue, u.profile_hue2, u.country FROM user_stats us JOIN users u ON u.id = us.user_id WHERE us.type IS NULL AND u.country = ? ORDER BY us.${sortProp} DESC LIMIT 15 OFFSET ?`;
      params = [country, 15 * page];
    } else if (!country) {
      query = `SELECT us.*, u.name, u.profile_hue, u.profile_hue2, u.country FROM user_stats us JOIN users u ON u.id = us.user_id WHERE us.type = ? ORDER BY us.${sortProp} DESC LIMIT 15 OFFSET ?`;
      params = [category, 15 * page];
    } else {
      query = `SELECT us.*, u.name, u.profile_hue, u.profile_hue2, u.country FROM user_stats us JOIN users u ON u.id = us.user_id WHERE us.type = ? AND u.country = ? ORDER BY us.${sortProp} DESC LIMIT 15 OFFSET ?`;
      params = [category, country, 15 * page];
    }

    const rows = await env.DB.prepare(query).bind(...params).all();
    return rows.results.map((r: any) => ({
      userRe: {
        id: r.user_id,
        name: r.name,
        profileHue: r.profile_hue ?? 250,
        profileHue2: r.profile_hue2,
        country: r.country,
      },
      [sortProp!]: r[sortProp!],
    }));
  } catch (exc) {
    console.error(exc);
    return [];
  }
}

export async function topClubs(env: Env, page: number): Promise<any[]> {
  try {
    const rows = await env.DB.prepare('SELECT name, points, tag, hue FROM clubs ORDER BY points DESC, created DESC LIMIT 15 OFFSET ?').bind(15 * page).all();
    return rows.results;
  } catch {
    return [];
  }
}

export async function getClub(env: Env, tag: string): Promise<ClubRow | null> {
  try {
    return await env.DB.prepare('SELECT * FROM clubs WHERE tag = ?').bind(tag).first() as ClubRow | null;
  } catch {
    return null;
  }
}

export async function getPlayerClub(env: Env, id: string): Promise<ClubRow | null> {
  try {
    const clubs = await env.DB.prepare('SELECT * FROM clubs').all();
    for (const club of clubs.results as unknown as ClubRow[]) {
      const members: string[] = JSON.parse(club.members || '[]');
      if (members.includes(id)) {
        cachedUserIDClubTag.set(id, club.tag);
        return club;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getClubRank(env: Env, tag: string): Promise<number> {
  try {
    const rows = await env.DB.prepare('SELECT tag FROM clubs ORDER BY points DESC').all();
    return rows.results.findIndex((r: any) => r.tag === tag) + 1;
  } catch {
    return 0;
  }
}

export async function updateClubPoints(env: Env, tag: string): Promise<void> {
  const club = await getClub(env, tag);
  if (!club) return;
  const members: string[] = JSON.parse(club.members || '[]');
  let points = 0;
  for (const pid of members) {
    const stats = await getUserStats(env, pid);
    points += stats?.points_4k ?? 0;
  }
  await env.DB.prepare('UPDATE clubs SET points = ? WHERE tag = ?').bind(points, tag).run();
}

export async function createClub(env: Env, ownerID: string, body: any): Promise<any> {
  const submitter = await getPlayerByID(env, ownerID);
  const submitterStats = await getUserStats(env, ownerID);
  if (!submitter) throw { error_message: 'Not registered!' };

  const existingClub = await getPlayerClub(env, ownerID);
  if (existingClub) throw { error_message: "You're already in a club!" };
  if ((submitterStats?.points_4k ?? 0) < 250) throw { error_message: 'You need at least 4k 250FP!' };
  if (!body.name || !body.tag) throw { error_message: 'Missing fields!' };

  body.name = body.name.trim();
  if (body.name.length > 20) throw { error_message: 'Name too long!' };

  body.tag = await formatNewClubTag(env, body.tag);

  const idBytes = new Uint8Array(16);
  crypto.getRandomValues(idBytes);
  const clubId = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  await env.DB.prepare('INSERT INTO clubs (id, name, tag, leaders, members, points) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(clubId, body.name, body.tag, JSON.stringify([ownerID]), JSON.stringify([ownerID]), submitterStats?.points_4k ?? 0).run();

  return { tag: body.tag };
}

async function formatNewClubTag(env: Env, tag: string, ignoreTag?: string): Promise<string> {
  tag = tag.trim();
  if (tag.length < 2 || tag.length > 5) throw { error_message: 'Too short/long tag!' };
  if (!hasOnlyLettersAndNumbers(tag)) throw { error_message: "Tag can't contain non latin letters!" };
  tag = tag.toUpperCase();
  if (tag !== (ignoreTag ?? '').toUpperCase()) {
    const existing = await getClub(env, tag);
    if (existing) throw { error_message: 'Tag taken!' };
  }
  return tag;
}

export async function requestJoinClub(env: Env, clubTag: string, userID: string): Promise<void> {
  const existingClub = await getPlayerClub(env, userID);
  if (existingClub) throw { error_message: "You're already in a club!" };

  const club = await getClub(env, clubTag);
  if (!club) throw { error_message: 'Club not found!' };

  const pending: string[] = JSON.parse(club.pending || '[]');
  if (pending.includes(userID)) throw { error_message: 'Already pending!' };

  const requesterName = await getPlayerNameByID(env, userID);
  const leaders: string[] = JSON.parse(club.leaders || '[]');
  for (const pid of leaders) {
    await sendNotification(env, pid, {
      title: 'Club Join Request',
      content: requesterName + ' wants to join your club!',
      image: '/api/user/avatar/' + encodeURIComponent(requesterName ?? ''),
      href: '/club/' + clubTag,
    });
  }

  pending.push(userID);
  await env.DB.prepare('UPDATE clubs SET pending = ? WHERE tag = ?').bind(JSON.stringify(pending), clubTag).run();
}

export async function acceptJoinClub(env: Env, clubTag: string, userID: string): Promise<void> {
  const userClub = await getPlayerClub(env, userID);
  if (userClub) {
    const pending: string[] = JSON.parse(userClub.pending || '[]');
    const newPending = removeFromArray(pending, userID);
    await env.DB.prepare('UPDATE clubs SET pending = ? WHERE id = ?').bind(JSON.stringify(newPending), userClub.id).run();
    throw { error_message: 'The user is already in a club!' };
  }

  const club = await getClub(env, clubTag);
  if (!club) throw { error_message: 'Club not found!' };

  const pending: string[] = JSON.parse(club.pending || '[]');
  if (!pending.includes(userID)) throw { error_message: "The user hasn't sent a request!" };

  const members: string[] = JSON.parse(club.members || '[]');
  members.push(userID);
  const newPending = removeFromArray(pending, userID);
  await env.DB.prepare('UPDATE clubs SET pending = ?, members = ? WHERE tag = ?').bind(JSON.stringify(newPending), JSON.stringify(members), clubTag).run();

  cachedUserIDClubTag.set(userID, clubTag);
  await updateClubPoints(env, clubTag);

  const clubName = await getPlayerNameByID(env, userID);
  await sendNotification(env, userID, {
    title: 'Club Join',
    content: "You've been accepted to the " + clubTag + ' club!',
    image: '/api/user/avatar/' + encodeURIComponent(clubName ?? ''),
    href: '/club/' + clubTag,
  });
}

export async function rejectJoinClub(env: Env, clubTag: string, userID: string): Promise<void> {
  const club = await getClub(env, clubTag);
  if (!club) throw { error_message: 'Club not found!' };

  const pending: string[] = JSON.parse(club.pending || '[]');
  if (!pending.includes(userID)) throw { error_message: "The user hasn't sent a request!" };

  const newPending = removeFromArray(pending, userID);
  await env.DB.prepare('UPDATE clubs SET pending = ? WHERE tag = ?').bind(JSON.stringify(newPending), clubTag).run();
}

export async function removePlayerFromClub(env: Env, playerID: string): Promise<void> {
  const club = await getPlayerClub(env, playerID);
  if (!club) throw { error_message: 'Not in a club!' };

  const clubMembers = removeFromArray(JSON.parse(club.members || '[]'), playerID);
  const clubLeaders = removeFromArray(JSON.parse(club.leaders || '[]'), playerID);

  await env.DB.prepare('UPDATE clubs SET members = ?, leaders = ? WHERE id = ?')
    .bind(JSON.stringify(clubMembers), JSON.stringify(clubLeaders), club.id).run();

  cachedUserIDClubTag.delete(playerID);
  await updateClubPoints(env, club.tag);

  if (clubMembers.length === 0) {
    await deleteClub(env, club.tag);
    return;
  }

  if (clubLeaders.length === 0) {
    let newOwner = clubMembers[0];
    clubLeaders.push(newOwner);
    await env.DB.prepare('UPDATE clubs SET leaders = ? WHERE id = ?').bind(JSON.stringify(clubLeaders), club.id).run();
  }
}

export async function deleteClub(env: Env, tag: string): Promise<void> {
  try {
    const banner = await env.DB.prepare('SELECT id FROM file_banners WHERE club_tag = ?').bind(tag).first() as any;
    if (banner) await env.R2.delete(banner.r2_key);
    await env.DB.prepare('DELETE FROM file_banners WHERE club_tag = ?').bind(tag).run();
  } catch {}

  const club = await env.DB.prepare('SELECT members FROM clubs WHERE tag = ?').bind(tag).first() as any;
  if (club) {
    const members: string[] = JSON.parse(club.members || '[]');
    for (const m of members) cachedUserIDClubTag.delete(m);
  }
  await env.DB.prepare('DELETE FROM clubs WHERE tag = ?').bind(tag).run();
}

export async function promoteClubMember(env: Env, userID: string): Promise<void> {
  const club = await getPlayerClub(env, userID);
  if (!club) throw { error_message: 'The user is not in a club!' };
  const leaders: string[] = JSON.parse(club.leaders || '[]');
  if (leaders.includes(userID)) throw { error_message: 'The user is already a mod!' };
  leaders.push(userID);
  await env.DB.prepare('UPDATE clubs SET leaders = ? WHERE tag = ?').bind(JSON.stringify(leaders), club.tag).run();
}

export async function demoteClubMember(env: Env, userID: string): Promise<void> {
  const club = await getPlayerClub(env, userID);
  if (!club) throw { error_message: 'The user is not in a club!' };
  const leaders: string[] = JSON.parse(club.leaders || '[]');
  if (!leaders.includes(userID)) throw { error_message: 'The user is not a mod!' };
  if (leaders.length === 1) throw { error_message: "A club can't have no leaders!" };
  const newLeaders = removeFromArray(leaders, userID);
  await env.DB.prepare('UPDATE clubs SET leaders = ? WHERE tag = ?').bind(JSON.stringify(newLeaders), club.tag).run();
}

export async function postClubEdit(env: Env, tag: string, body: any): Promise<void> {
  const club = await getClub(env, tag);
  if (!club) throw { error_message: 'No club!' };

  body.name = body.name.trim();
  if (body.name.length > 20) throw { error_message: 'Name too long!' };
  if (body.hue > 360) body.hue = 360;
  if (body.hue < 0) body.hue = 0;

  const newTag = await formatNewClubTag(env, body.tag, tag);

  await env.DB.prepare('UPDATE clubs SET content = ?, name = ?, hue = ?, tag = ? WHERE tag = ?')
    .bind(body.content ?? null, body.name, body.hue ?? null, newTag, tag).run();

  if (newTag !== tag) {
    const members: string[] = JSON.parse(club.members || '[]');
    for (const pid of members) {
      cachedUserIDClubTag.set(pid, newTag);
    }
  }
}

export async function getMod(env: Env, id: string): Promise<any | null> {
  try {
    const mod = await env.DB.prepare('SELECT * FROM mods WHERE id = ?').bind(id).first() as any;
    if (!mod) return null;

    const downloads = await env.DB.prepare('SELECT * FROM mod_downloads WHERE mod_id = ?').bind(id).all();
    const hitsRow = await env.DB.prepare('SELECT COALESCE(SUM(hits), 0) as total FROM mod_downloads WHERE mod_id = ?').bind(id).first() as any;

    const favorited: string[] = JSON.parse(mod.favorited || '[]');
    mod.downloads = downloads.results;
    mod.downloadsHits = hitsRow?.total ?? 0;
    mod.favorited = favorited;
    return mod;
  } catch {
    return null;
  }
}

export async function submitMod(env: Env, data: any): Promise<any> {
  if (data.id.trim().length < 3) throw { error_message: 'ID needs 3 letters at least' };
  if (/[^a-z0-9_\-]/gmi.test(data.id)) throw { error_message: 'ID Contains invalid characters' };
  if (data.title.trim().length < 3) throw { error_message: 'Title needs 3 letters at least' };

  const existing = await env.DB.prepare('SELECT COUNT(*) as cnt FROM mods WHERE LOWER(id) = LOWER(?)').bind(data.id).first() as any;
  if (existing?.cnt > 0) throw { error_message: 'The ID for this mod is already taken!' };

  await env.DB.prepare('INSERT INTO mods (id, description, keywords, images, title) VALUES (?, ?, ?, ?, ?)')
    .bind(data.id, data.description ?? '', data.keywords ?? '[]', data.images ?? '[]', data.title).run();

  return { id: data.id };
}

export async function editMod(env: Env, data: any): Promise<any> {
  if (data.title.trim().length < 3) throw { error_message: 'Title needs 3 letters at least' };
  await env.DB.prepare('UPDATE mods SET title = ?, description = ?, keywords = ?, images = ? WHERE id = ?')
    .bind(data.title, data.description ?? '', data.keywords ?? '[]', data.images ?? '[]', data.id).run();
  return { id: data.id };
}

export async function deleteMod(env: Env, data: any): Promise<void> {
  await env.DB.prepare('DELETE FROM mod_downloads WHERE mod_id = ?').bind(data.id).run();
  await env.DB.prepare('DELETE FROM mods WHERE id = ?').bind(data.id).run();
}

export async function toggleFavMod(env: Env, userID: string, modID: string): Promise<void> {
  const mod = await env.DB.prepare('SELECT favorited FROM mods WHERE id = ?').bind(modID).first() as any;
  if (!mod) throw { error_message: 'Mod not found!' };

  const favorited: string[] = JSON.parse(mod.favorited || '[]');
  if (favorited.includes(userID)) {
    favorited.splice(favorited.indexOf(userID), 1);
  } else {
    favorited.unshift(userID);
  }

  await env.DB.prepare('UPDATE mods SET favorited = ?, favorited_count = ? WHERE id = ?')
    .bind(JSON.stringify(favorited), favorited.length, modID).run();
}

export async function giveDownloadURL(env: Env, id: string): Promise<string | null> {
  try {
    const download = await env.DB.prepare('SELECT urls, hits, mod_id FROM mod_downloads WHERE id = ?').bind(id).first() as any;
    if (!download) return null;

    const urls: string[] = JSON.parse(download.urls || '[]');
    const pickedUrl = urls[0] ?? null;
    if (pickedUrl) {
      await env.DB.prepare('UPDATE mod_downloads SET hits = hits + 1 WHERE id = ?').bind(id).run();
      const totalHits = await env.DB.prepare('SELECT COALESCE(SUM(hits), 0) as total FROM mod_downloads WHERE mod_id = ?').bind(download.mod_id).first() as any;
      await env.DB.prepare('UPDATE mods SET download_hits = ? WHERE id = ?').bind(totalHits?.total ?? 0, download.mod_id).run();
    }
    return pickedUrl;
  } catch {
    return null;
  }
}

export async function submitDownloadForMod(env: Env, id: string, urls: string[], modId: string): Promise<void> {
  if (id.trim().length < 1) throw { error_message: 'ID needs a letter at least' };
  if (/[^a-z0-9_\-\.]/gmi.test(id)) throw { error_message: 'ID Contains invalid characters' };

  const existing = await env.DB.prepare('SELECT COUNT(*) as cnt FROM mod_downloads WHERE LOWER(id) = LOWER(?)').bind(modId + ':' + id).first() as any;
  if (existing?.cnt > 0) throw { error_message: 'The ID for this download is already taken!' };

  await env.DB.prepare('INSERT INTO mod_downloads (id, urls, hits, size, mod_id) VALUES (?, ?, 0, 0, ?)')
    .bind(modId + ':' + id, JSON.stringify(urls), modId).run();
}

export async function removeDownloadForMod(env: Env, id: string): Promise<void> {
  if (!id.includes(':')) throw { error_message: 'ID incomplete!' };
  await env.DB.prepare('DELETE FROM mod_downloads WHERE id = ?').bind(id).run();
}

export async function editDownloadForMod(env: Env, data: any): Promise<void> {
  await env.DB.prepare('UPDATE mod_downloads SET urls = ?, size = 0 WHERE id = ?').bind(JSON.stringify(data.urls), data.id).run();
}

export async function listReports(env: Env): Promise<any[]> {
  try {
    return (await env.DB.prepare('SELECT * FROM reports').all()).results;
  } catch {
    return [];
  }
}

export async function getReport(env: Env, id: string): Promise<any | null> {
  try {
    return await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first();
  } catch {
    return null;
  }
}

export async function removeReport(env: Env, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(id).run();
}

export async function searchSongs(env: Env, query: string, page: number = 0): Promise<any[]> {
  if (query.trim().length < 3) throw { error_message: 'Search query needs to be longer than 3!' };
  try {
    const rows = await env.DB.prepare('SELECT id, max_points FROM songs WHERE id LIKE ? LIMIT 50 OFFSET ?').bind(`%${query}%`, 50 * page).all();
    return rows.results.map((r: any) => ({ id: r.id, fp: r.max_points ?? 0 }));
  } catch {
    return [];
  }
}

export async function searchUsers(env: Env, query: string, page: number = 0): Promise<any[]> {
  if (query.trim().length < 3) throw { error_message: 'Search query needs to be longer than 3!' };
  try {
    const rows = await env.DB.prepare('SELECT name, role FROM users WHERE name LIKE ? LIMIT 50 OFFSET ?').bind(`%${query}%`, 50 * page).all();
    return rows.results;
  } catch {
    return [];
  }
}

export async function searchMods(env: Env, query: string, page: number = 0, sort?: string): Promise<any[]> {
  const [_sortBy, _sortDirection] = (sort ?? '').split(':');
  let sortBy = 'submitted';
  let sortDirection = 'desc';
  if (['title', 'submitted', 'favorited_count', 'download_hits'].includes(_sortBy)) sortBy = _sortBy;
  if (['desc', 'asc'].includes(_sortDirection)) sortDirection = _sortDirection;

  try {
    const rows = await env.DB.prepare(`SELECT id, images, title, keywords, download_hits, favorited_count, submitted FROM mods WHERE title LIKE ? OR id LIKE ? OR keywords LIKE ? ORDER BY ${sortBy} ${sortDirection} LIMIT 15 OFFSET ?`)
      .bind(`%${query}%`, `%${query}%`, `%${query}%`, 15 * page).all();
    return rows.results.map((r: any) => ({
      id: r.id,
      images: r.images,
      title: r.title,
      keywords: r.keywords,
      downloadHits: r.download_hits,
      favoritedCount: r.favorited_count,
      submitted: r.submitted,
    }));
  } catch {
    return [];
  }
}

export async function searchSameIPUsersByUserID(env: Env, userID: string): Promise<string[]> {
  const user = await getPlayerByID(env, userID);
  if (!user) throw { error_message: 'No user found with this ID!' };

  const ips: string[] = JSON.parse(user.ips || '[]');
  if (ips.length === 0) return [];

  const allUsers = await env.DB.prepare('SELECT id, ips FROM users').all();
  const matchingIds: string[] = [];
  for (const row of allUsers.results as any[]) {
    if (row.id === userID) continue;
    const userIps: string[] = JSON.parse(row.ips || '[]');
    if (ips.some(ip => userIps.includes(ip))) {
      matchingIds.push(row.id);
    }
  }
  return matchingIds;
}

export async function getScoresPlayer(env: Env, id: string, page: number, keys?: number, category?: string, sort?: string): Promise<any[]> {
  const [_sortBy, _sortDirection] = (sort ?? '').split(':');
  let sortBy = 'points';
  let sortDirection = 'desc';
  if (['points', 'accuracy', 'score', 'submitted', 'misses'].includes(_sortBy)) sortBy = _sortBy;
  if (['desc', 'asc'].includes(_sortDirection)) sortDirection = _sortDirection;

  try {
    let query: string;
    let params: any[];

    const catFilter = category === undefined ? 'AND category IS NULL' : 'AND category = ?';
    const keysFilter = (!keys || keys === 4) ? 'AND (keys IS NULL OR keys = 4)' : 'AND keys = ?';

    if (category === undefined && (!keys || keys === 4)) {
      query = `SELECT submitted, song_id, score, accuracy, points, strum, id, mod_url, misses FROM scores WHERE player_id = ? ${catFilter} ${keysFilter} ORDER BY ${sortBy} ${sortDirection} LIMIT 15 OFFSET ?`;
      params = [id, 15 * page];
    } else if (category === undefined) {
      query = `SELECT submitted, song_id, score, accuracy, points, strum, id, mod_url, misses FROM scores WHERE player_id = ? ${keysFilter} ORDER BY ${sortBy} ${sortDirection} LIMIT 15 OFFSET ?`;
      params = [id, keys, 15 * page];
    } else if (!keys || keys === 4) {
      query = `SELECT submitted, song_id, score, accuracy, points, strum, id, mod_url, misses FROM scores WHERE player_id = ? AND category = ? ORDER BY ${sortBy} ${sortDirection} LIMIT 15 OFFSET ?`;
      params = [id, category, 15 * page];
    } else {
      query = `SELECT submitted, song_id, score, accuracy, points, strum, id, mod_url, misses FROM scores WHERE player_id = ? AND category = ? AND keys = ? ORDER BY ${sortBy} ${sortDirection} LIMIT 15 OFFSET ?`;
      params = [id, category, keys, 15 * page];
    }

    const rows = await env.DB.prepare(query).bind(...params).all();
    return rows.results;
  } catch {
    return [];
  }
}

export async function endWeekly(env: Env): Promise<void> {
  const rows = await env.DB.prepare('SELECT id FROM scores WHERE category = \'week\'').all();
  const scoreIds = rows.results.map((r: any) => r.id);
  for (const id of scoreIds) {
    await removeScore(env, id);
  }
}

export async function getPersistentData(env: Env, key: string): Promise<any> {
  try {
    const row = await env.DB.prepare('SELECT value FROM persistent_data WHERE key = ?').bind(key).first() as any;
    return row ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

export async function setPersistentData(env: Env, key: string, value: any): Promise<void> {
  await env.DB.prepare('INSERT OR REPLACE INTO persistent_data (key, value) VALUES (?, ?)').bind(key, JSON.stringify(value)).run();
}
