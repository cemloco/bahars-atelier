
import {
  json,
  authorized,
  sameOrigin,
  secureEqual,
  sessionCookie
} from '../../server/auth.js';

export async function onRequestGet({request, env}) {
  return json({
    authenticated: await authorized(request, env)
  });
}

export async function onRequestPost({request, env}) {
  if (!sameOrigin(request)) {
    return json({error: 'Origin rejected'}, 403);
  }

  if (!env.ATELIER_LOGIN_PASSWORD ||
      !env.ATELIER_SESSION_SECRET) {
    return json({
      error: 'Cloud login is not configured'
    }, 503);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({error: 'Bad JSON'}, 400);
  }

  const ip =
    request.headers.get('CF-Connecting-IP') || 'unknown';

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(ip)
  );

  const key = 'login-attempts/' +
    Array.from(new Uint8Array(digest))
      .map(v => v.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 40);

  const attempts = Number(
    await env.ATELIER_IMAGES?.get(key) || 0
  );

  if (attempts >= 8) {
    return json({
      error: 'Too many attempts; try again later'
    }, 429);
  }

  if (!await secureEqual(
    data.password || '',
    env.ATELIER_LOGIN_PASSWORD
  )) {
    await env.ATELIER_IMAGES?.put(
      key,
      String(attempts + 1),
      {expirationTtl: 300}
    );

    return json({error: 'Wrong password'}, 401);
  }

  await env.ATELIER_IMAGES?.delete(key);

  const response = json({authenticated: true});

  response.headers.set(
    'Set-Cookie',
    await sessionCookie(env.ATELIER_SESSION_SECRET)
  );

  return response;
}

export async function onRequestDelete({request}) {
  if (!sameOrigin(request)) {
    return json({error: 'Origin rejected'}, 403);
  }

  const response = json({authenticated: false});

  response.headers.set(
    'Set-Cookie',
    'ba_session=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
  );

  return response;
}
