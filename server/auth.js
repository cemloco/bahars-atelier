
const enc = new TextEncoder();

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function b64(bytes) {
  let out = '';
  for (const x of bytes) out += String.fromCharCode(x);
  return btoa(out)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function mac(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  return b64(new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  ));
}

export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function sessionCookie(secret) {
  const exp = Date.now() + 7 * 86400000;
  const payload = `v1.${exp}`;
  const sig = await mac(secret, payload);

  return `ba_session=${payload}.${sig}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`;
}

export async function authorized(request, env) {
  if (!env.ATELIER_SESSION_SECRET) return false;

  const cookie = (request.headers.get('Cookie') || '')
    .split(';')
    .map(x => x.trim())
    .find(x => x.startsWith('ba_session='));

  if (!cookie) return false;

  const parts = cookie.slice(11).split('.');

  if (
    parts.length !== 3 ||
    parts[0] !== 'v1' ||
    !/^\d+$/.test(parts[1]) ||
    Number(parts[1]) < Date.now()
  ) return false;

  const expected = await mac(
    env.ATELIER_SESSION_SECRET,
    `${parts[0]}.${parts[1]}`
  );

  return expected === parts[2];
}

export async function secureEqual(a, b) {
  const ka = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(String(a))
  );

  const kb = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(String(b))
  );

  return new Uint8Array(ka).every(
    (v, i) => v === new Uint8Array(kb)[i]
  );
}
