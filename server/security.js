import { createRemoteJWKSet, jwtVerify } from "jose";

export const DAY = 86400000;
export const RETENTION = 365 * DAY;
export const CONSENT_VERSION = "task-training-permission-v1";
export const SESSION_COOKIE = "__Host-rf-session";
export const OAUTH_COOKIE = "__Host-rf-oauth";
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function fail(status, message) {
  throw new HttpError(status, message);
}
export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
export async function hash(value) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
export function cookie(request, name) {
  return (
    request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}
export function setCookie(name, value, age) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}
export function json(value, status = 200, headers = {}) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export function sameOrigin(request, env) {
  if (!env.APP_ORIGIN || request.headers.get("Origin") !== env.APP_ORIGIN)
    fail(403, "Request origin not allowed.");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
    fail(403, "Cross-site request denied.");
}
export function configured(env) {
  return Boolean(
    env.DB &&
    env.APP_ORIGIN &&
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.SECURITY_SECRET,
  );
}
export async function bodyJson(request, limit = 65536) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    fail(415, "Use application/json.");
  const reader = request.body?.getReader();
  let size = 0;
  const chunks = [];
  if (!reader) fail(400, "Missing request body.");
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      fail(413, "Request too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail(400, "Use a JSON object.");
    return value;
  } catch {
    fail(400, "Invalid JSON.");
  }
}
export function uuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export async function rateLimit(db, key, max = 120, windowMs = 60000) {
  const now = Date.now(),
    bucket = Math.floor(now / windowMs),
    bucketKey = `${key}:${bucket}`;
  const row = await db
    .prepare(
      "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(bucketKey, now + windowMs * 2)
    .first();
  if (row.count > max) fail(429, "Too many requests. Retry in one minute.");
}
const keySets = new Map();
function keys(url) {
  if (!keySets.has(url)) keySets.set(url, createRemoteJWKSet(new URL(url)));
  return keySets.get(url);
}
export async function verifyGoogle(token, env, nonce, keyResolver) {
  const { payload } = await jwtVerify(
    token,
    keyResolver || keys("https://www.googleapis.com/oauth2/v3/certs"),
    {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "iss", "aud"],
    },
  );
  if (
    payload.nonce !== nonce ||
    !payload.sub ||
    !payload.email ||
    payload.email_verified !== true ||
    (payload.azp && payload.azp !== env.GOOGLE_CLIENT_ID)
  )
    fail(401, "Google identity could not be verified.");
  return payload;
}
export async function verifyAdmin(request, env, keyResolver) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAILS)
    fail(503, "Admin access has not been configured.");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))
    fail(503, "Invalid Access configuration.");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) fail(403, "Admin sign-in required.");
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  const { payload } = await jwtVerify(
    token,
    keyResolver || keys(`${issuer}/cdn-cgi/access/certs`),
    {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "iss", "aud"],
    },
  );
  const allowed = env.ADMIN_EMAILS.split(",").map((v) =>
    v.trim().toLowerCase(),
  );
  if (!payload.email || !allowed.includes(payload.email.toLowerCase()))
    fail(403, "Admin access denied.");
  return payload.email.toLowerCase();
}
export async function requireUser(request, env, mutation = false) {
  const token = cookie(request, SESSION_COOKIE);
  if (!/^[a-f0-9]{64}$/.test(token))
    fail(401, "Sign in to access saved results.");
  const row = await env.DB.prepare(
    "SELECT a.*,u.email,u.participant_key FROM auth_sessions a JOIN users u ON a.user_id=u.id WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(token), Date.now())
    .first();
  if (!row) fail(401, "Your sign-in has expired.");
  if (mutation) {
    sameOrigin(request, env);
    if (request.headers.get("X-CSRF-Token") !== row.csrf)
      fail(403, "Security token missing or expired.");
  }
  return row;
}
