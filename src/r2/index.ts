import { Env } from '../env';

export async function uploadToR2(env: Env, key: string, data: ArrayBuffer, contentType: string): Promise<boolean> {
  try {
    await env.R2.put(key, data, {
      httpMetadata: { contentType },
    });
    return true;
  } catch (err) {
    console.error('R2 upload error:', err);
    return false;
  }
}

export async function getFromR2(env: Env, key: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  try {
    const obj = await env.R2.get(key);
    if (!obj) return null;
    return {
      data: await obj.arrayBuffer(),
      contentType: obj.httpMetadata?.contentType || 'application/octet-stream',
    };
  } catch (err) {
    console.error('R2 get error:', err);
    return null;
  }
}

export async function deleteFromR2(env: Env, key: string): Promise<boolean> {
  try {
    await env.R2.delete(key);
    return true;
  } catch (err) {
    console.error('R2 delete error:', err);
    return false;
  }
}

export async function uploadAvatar(env: Env, userId: string, data: ArrayBuffer, contentType: string): Promise<boolean> {
  // Delete existing
  const existing = await env.DB.prepare("SELECT id, r2_key FROM file_avatars WHERE owner = ?").bind(userId).first();
  if (existing) {
    await deleteFromR2(env, existing.r2_key as string);
    await env.DB.prepare("DELETE FROM file_avatars WHERE owner = ?").bind(userId).run();
  }

  const id = crypto.randomUUID();
  const r2Key = `avatars/${userId}/${id}`;

  if (await uploadToR2(env, r2Key, data, contentType)) {
    await env.DB.prepare(
      "INSERT INTO file_avatars (id, r2_key, size, owner) VALUES (?, ?, ?, ?)"
    ).bind(id, r2Key, data.byteLength, userId).run();
    return true;
  }
  return false;
}

export async function getAvatar(env: Env, userId: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const row = await env.DB.prepare("SELECT r2_key FROM file_avatars WHERE owner = ?").bind(userId).first();
  if (!row) return null;
  return getFromR2(env, row.r2_key as string);
}

export async function hasAvatar(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM file_avatars WHERE owner = ?").bind(userId).first();
  return !!row;
}

export async function uploadBackground(env: Env, userId: string, data: ArrayBuffer, contentType: string): Promise<boolean> {
  const existing = await env.DB.prepare("SELECT id, r2_key FROM file_backgrounds WHERE owner = ?").bind(userId).first();
  if (existing) {
    await deleteFromR2(env, existing.r2_key as string);
    await env.DB.prepare("DELETE FROM file_backgrounds WHERE owner = ?").bind(userId).run();
  }

  const id = crypto.randomUUID();
  const r2Key = `backgrounds/${userId}/${id}`;

  if (await uploadToR2(env, r2Key, data, contentType)) {
    await env.DB.prepare(
      "INSERT INTO file_backgrounds (id, r2_key, size, owner) VALUES (?, ?, ?, ?)"
    ).bind(id, r2Key, data.byteLength, userId).run();
    return true;
  }
  return false;
}

export async function getBackground(env: Env, userId: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const row = await env.DB.prepare("SELECT r2_key FROM file_backgrounds WHERE owner = ?").bind(userId).first();
  if (!row) return null;
  return getFromR2(env, row.r2_key as string);
}

export async function hasBackground(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM file_backgrounds WHERE owner = ?").bind(userId).first();
  return !!row;
}

export async function uploadClubBanner(env: Env, clubTag: string, data: ArrayBuffer, contentType: string): Promise<boolean> {
  const existing = await env.DB.prepare("SELECT id, r2_key FROM file_banners WHERE club_tag = ?").bind(clubTag).first();
  if (existing) {
    await deleteFromR2(env, existing.r2_key as string);
    await env.DB.prepare("DELETE FROM file_banners WHERE club_tag = ?").bind(clubTag).run();
  }

  const id = crypto.randomUUID();
  const r2Key = `banners/${clubTag}/${id}`;

  if (await uploadToR2(env, r2Key, data, contentType)) {
    await env.DB.prepare(
      "INSERT INTO file_banners (id, r2_key, size, club_tag) VALUES (?, ?, ?, ?)"
    ).bind(id, r2Key, data.byteLength, clubTag).run();
    return true;
  }
  return false;
}

export async function getClubBanner(env: Env, clubTag: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const row = await env.DB.prepare("SELECT r2_key FROM file_banners WHERE club_tag = ?").bind(clubTag).first();
  if (!row) return null;
  return getFromR2(env, row.r2_key as string);
}

export async function uploadReplay(env: Env, scoreId: string, data: ArrayBuffer): Promise<string | null> {
  const id = crypto.randomUUID();
  const r2Key = `replays/${scoreId}/${id}`;

  if (await uploadToR2(env, r2Key, data, 'application/json')) {
    await env.DB.prepare(
      "INSERT INTO file_replays (id, r2_key, size) VALUES (?, ?, ?)"
    ).bind(id, r2Key, data.byteLength).run();
    return id;
  }
  return null;
}

export async function getReplay(env: Env, replayId: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const row = await env.DB.prepare("SELECT r2_key FROM file_replays WHERE id = ?").bind(replayId).first();
  if (!row) return null;
  return getFromR2(env, row.r2_key as string);
}

export async function removeImages(env: Env, userId: string): Promise<boolean> {
  try {
    const avatar = await env.DB.prepare("SELECT r2_key FROM file_avatars WHERE owner = ?").bind(userId).first();
    if (avatar) await deleteFromR2(env, avatar.r2_key as string);
    await env.DB.prepare("DELETE FROM file_avatars WHERE owner = ?").bind(userId).run();

    const bg = await env.DB.prepare("SELECT r2_key FROM file_backgrounds WHERE owner = ?").bind(userId).first();
    if (bg) await deleteFromR2(env, bg.r2_key as string);
    await env.DB.prepare("DELETE FROM file_backgrounds WHERE owner = ?").bind(userId).run();

    return true;
  } catch (err) {
    console.error('removeImages error:', err);
    return false;
  }
}
