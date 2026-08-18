import { Env } from '../env';

const JWT_HEADER = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function base64url(data: ArrayBuffer | Uint8Array | string): string {
    let bytes: Uint8Array;
    if (typeof data === 'string') {
        bytes = new TextEncoder().encode(data);
    } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
    } else {
        bytes = data;
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(str: string): Uint8Array {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
        b64 += '=';
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function hmacSign(data: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return base64url(signature);
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );
    const sigBytes = base64urlDecode(signature);
    return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
}

export async function generateToken(userId: string, secret: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: userId,
        iat: now,
        exp: now + 30 * 24 * 60 * 60,
    };

    const encodedPayload = base64url(JSON.stringify(payload));
    const signingInput = `${JWT_HEADER}.${encodedPayload}`;
    const signature = await hmacSign(signingInput, secret);

    return `${signingInput}.${signature}`;
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [header, payload, signature] = parts;

    if (header !== JWT_HEADER) return false;

    const signingInput = `${header}.${payload}`;
    const valid = await hmacVerify(signingInput, signature, secret);
    if (!valid) return false;

    try {
        const payloadData = JSON.parse(new TextDecoder().decode(base64urlDecode(payload)));
        if (payloadData.exp && Math.floor(Date.now() / 1000) > payloadData.exp) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

export function getIDToken(request: Request): [string | null, string | null] {
    const headers = request.headers;

    const networkId = headers.get('x-network-id');
    const networkToken = headers.get('x-network-token');
    if (networkId && networkToken) {
        return [networkId, networkToken];
    }

    const cookieHeader = headers.get('cookie') || '';
    const cookies: Record<string, string> = {};
    for (const part of cookieHeader.split(';')) {
        const [key, ...rest] = part.split('=');
        if (key) {
            cookies[key.trim()] = rest.join('=').trim();
        }
    }
    if (cookies['authid'] && cookies['authtoken']) {
        return [cookies['authid'], cookies['authtoken']];
    }

    const authHeader = headers.get('authorization');
    if (!authHeader) {
        return [null, null];
    }

    const b64auth = authHeader.split(' ')[1] || '';
    const decoded = atob(b64auth);
    let [id, token] = decoded.split(':');
    if (id) id = id.trim();
    if (token) token = token.trim();
    return [id || null, token || null];
}

export async function hashSecret(): Promise<string> {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
}
