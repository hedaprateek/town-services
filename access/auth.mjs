import { createRemoteJWKSet, jwtVerify } from 'jose';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export const SESSION_COOKIE = '__Host-directory-session';

export function credential(request) {
  const authorization = request.headers.get('authorization');
  if (authorization) return authorization.match(/^Bearer (\S+)$/i)?.[1] || '';
  return (request.headers.get('cookie') || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1) || '';
}

// Used unchanged in production and tests; tests supply a local public key set.
export async function verifyIdentity(token, projectId, keySet = keys) {
  if (!token || token.length > 8192 || !/^[a-z][a-z0-9-]{4,60}$/.test(projectId || '')) throw Error('Sign in with Google to continue.');
  const { payload } = await jwtVerify(token, keySet, {
    algorithms: ['RS256'], audience: projectId,
    issuer: 'https://securetoken.google.com/' + projectId, clockTolerance: 5,
    requiredClaims: ['sub', 'iat', 'exp', 'auth_time', 'email', 'email_verified', 'firebase']
  });
  if (!payload.sub || payload.sub.length > 128 || payload.email_verified !== true ||
      payload.firebase?.sign_in_provider !== 'google.com' ||
      typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
      payload.iat > Date.now() / 1000 + 5 || payload.auth_time > Date.now() / 1000 + 5) {
    throw Error('Use a verified Google account.');
  }
  return { uid: payload.sub, email: payload.email.toLowerCase(), name: String(payload.name || '').slice(0, 160), expires: payload.exp };
}

export function sessionCookie(token, seconds = 3600) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.min(3600, seconds))}`;
}
