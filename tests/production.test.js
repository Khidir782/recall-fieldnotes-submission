import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { createApi } from "../server/app.js";
import {
  hash,
  randomToken,
  verifyAdmin,
  verifyGoogle,
  rateLimit,
  SESSION_COOKIE,
  OAUTH_COOKIE,
  DAY,
} from "../server/security.js";
import { cleanup } from "../server/cleanup.js";
import { makeTrial } from "../src/experiment.js";
import { prepareTrainingDataset } from "../src/taskPerformance.js";

const origin = "https://recall.example.test";
async function setup(t) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('test')}}",
      d1Databases: { DB: crypto.randomUUID() },
      compatibilityDate: "2026-11-16",
      telemetry: { enabled: false },
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  const migration = await fs.readFile(
    new URL("../migrations/0001_production.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(statement).run();
  const env = {
    DB: db,
    APP_ORIGIN: origin,
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "test-only",
    SECURITY_SECRET: randomToken(),
    ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
    ACCESS_AUD: "admin-app",
    ADMIN_EMAILS: "owner@example.test",
  };
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test";
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (
    claims,
    issuer = origin,
    audience = "admin-app",
    expiry = "5m",
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime(expiry)
      .sign(privateKey);
  let googleNonce = "",
    googleSub = "google-person";
  const handle = createApi({
    verifyAdmin: (request, environment) =>
      verifyAdmin(request, environment, keys),
    verifyGoogle: (token, environment, nonce) =>
      verifyGoogle(token, environment, nonce, keys),
    fetch: async (_url, options) => {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("redirect_uri"), `${origin}/api/auth/callback`);
      assert.equal(body.get("code_verifier")?.length, 64);
      return Response.json({
        id_token: await sign(
          {
            sub: googleSub,
            email: "person@example.test",
            email_verified: true,
            nonce: googleNonce,
          },
          "https://accounts.google.com",
          "google-client",
        ),
      });
    },
  });
  const call = async (
    path,
    {
      method = "GET",
      user,
      body,
      csrf = true,
      admin,
      requestOrigin = origin,
      host = origin,
      extra = {},
    } = {},
  ) =>
    handle(
      new Request(`${host}/api${path}`, {
        method,
        headers: {
          ...(user ? { Cookie: `${SESSION_COOKIE}=${user.token}` } : {}),
          ...(admin ? { "Cf-Access-Jwt-Assertion": admin } : {}),
          ...(method !== "GET"
            ? {
                Origin: requestOrigin,
                "Content-Type": "application/json",
                ...(csrf && user ? { "X-CSRF-Token": user.csrf } : {}),
              }
            : {}),
          ...extra,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  const user = async () => {
    const id = crypto.randomUUID(),
      token = randomToken(),
      csrf = randomToken();
    await db
      .prepare(
        "INSERT INTO users(id,google_sub,email,participant_key,created_at) VALUES(?,?,?,?,?)",
      )
      .bind(id, id, `${id}@example.test`, crypto.randomUUID(), Date.now())
      .run();
    await db
      .prepare(
        "INSERT INTO auth_sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)",
      )
      .bind(await hash(token), id, csrf, Date.now() + DAY)
      .run();
    return { id, token, csrf };
  };
  const admin = await sign(
    { email: "owner@example.test" },
    "https://example.cloudflareaccess.com",
  );
  return {
    db,
    env,
    handle,
    call,
    user,
    admin,
    sign,
    keys,
    setGoogleNonce: (v) => (googleNonce = v),
    setGoogleSub: (v) => (googleSub = v),
  };
}
function trial(seed = 5) {
  const t = makeTrial(seed, "quiet");
  return {
    ...t,
    source: "live",
    completedAt: new Date().toISOString(),
    valid: true,
    correct: 99,
    answers: t.placements.map((p) => ({ room: p.room, elapsedMs: 1000 })),
  };
}
async function session(ctx, user) {
  const id = crypto.randomUUID();
  const response = await ctx.call("/sessions", {
    method: "POST",
    user,
    body: { id },
  });
  assert.equal(response.status, 201);
  return id;
}
async function save(
  ctx,
  user,
  id,
  roundId = crypto.randomUUID(),
  revision = 0,
  data = trial(),
) {
  const response = await ctx.call(`/sessions/${id}/rounds/${roundId}`, {
    method: "PUT",
    user,
    body: { revision, trial: data },
  });
  return { response, roundId, data };
}

test("OAuth uses bound, one-time state/nonce/PKCE and secure revocable sessions", async (t) => {
  const ctx = await setup(t),
    start = await ctx.call("/auth/start");
  assert.equal(start.status, 302);
  const target = new URL(start.headers.get("Location"));
  assert.equal(target.searchParams.get("scope"), "openid email");
  assert.equal(target.searchParams.get("code_challenge_method"), "S256");
  assert.ok(target.searchParams.get("code_challenge"));
  ctx.setGoogleNonce(target.searchParams.get("nonce"));
  const browserCookie = start.headers.get("Set-Cookie").split(";")[0];
  const callback = `/auth/callback?code=test-code&state=${target.searchParams.get("state")}`;
  const wrong = await ctx.call(callback);
  assert.equal(wrong.status, 401);
  const valid = await ctx.call(callback, { extra: { Cookie: browserCookie } });
  assert.equal(valid.status, 302);
  const cookies = valid.headers.getSetCookie();
  assert.ok(
    cookies.some(
      (c) =>
        c.startsWith(`${SESSION_COOKIE}=`) &&
        c.includes("HttpOnly; Secure; SameSite=Lax"),
    ),
  );
  assert.ok(
    cookies.some(
      (c) => c.startsWith(`${OAUTH_COOKIE}=`) && c.includes("Max-Age=0"),
    ),
  );
  const token = cookies
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    .split(";")[0]
    .split("=")[1];
  const replay = await ctx.call(callback, { extra: { Cookie: browserCookie } });
  assert.equal(replay.status, 401);
  const me = await ctx.call("/auth/me", { user: { token } });
  assert.equal(me.status, 200);
  const identity = await me.json();
  assert.ok(identity.csrf);
  assert.equal(identity.user.email, "person@example.test");
  assert.equal(
    (
      await ctx.call("/auth/logout", {
        method: "POST",
        user: { token, csrf: identity.csrf },
      })
    ).status,
    200,
  );
  assert.equal((await ctx.call("/auth/me", { user: { token } })).status, 401);
  const validToken = await ctx.sign(
    {
      sub: "subject",
      email: "person@example.test",
      email_verified: true,
      nonce: "actual-nonce",
    },
    "https://accounts.google.com",
    "google-client",
  );
  await assert.rejects(
    () => verifyGoogle(validToken, ctx.env, "different-nonce", ctx.keys),
    (e) => e.status === 401,
  );
});
test("participant ownership, CSRF, host isolation and canonical scoring are enforced", async (t) => {
  const ctx = await setup(t),
    a = await ctx.user(),
    b = await ctx.user(),
    id = await session(ctx, a);
  for (const method of ["GET", "DELETE"]) {
    assert.equal(
      (await ctx.call(`/sessions/${id}`, { method, user: b })).status,
      404,
    );
  }
  assert.equal(
    (
      await ctx.call(`/sessions/${id}/research-permission`, {
        method: "PUT",
        user: b,
        body: { granted: true, version: "task-training-permission-v1" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await ctx.call("/sessions", {
        method: "POST",
        user: a,
        body: { id: crypto.randomUUID() },
        csrf: false,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await ctx.call("/sessions", {
        method: "POST",
        user: a,
        body: { id: crypto.randomUUID() },
        requestOrigin: "https://attacker.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await ctx.call("/sessions", {
        user: a,
        host: "https://alternate.pages.dev",
      })
    ).status,
    403,
  );
  const one = await save(ctx, a, id);
  assert.equal(one.response.status, 201);
  const duplicate = await save(ctx, a, id, one.roundId, 0, one.data);
  assert.equal(duplicate.response.status, 200);
  assert.equal((await duplicate.response.json()).duplicate, true);
  assert.equal(
    (await save(ctx, a, id, crypto.randomUUID(), 0)).response.status,
    409,
  );
  const report = await (await ctx.call(`/sessions/${id}`, { user: a })).json();
  assert.equal(report.session.revision, 1);
  assert.equal(report.data.trials.length, 1);
  assert.equal(report.data.trials[0].correct, 3);
  assert.equal(report.data.trials[0].source, "imported");
  assert.deepEqual(report.roundIds, [one.roundId]);
  assert.equal(report.researchPermission, false);
  const changed = structuredClone(one.data);
  changed.answers[0].room = (changed.answers[0].room + 1) % 6;
  assert.equal(
    (await save(ctx, a, id, one.roundId, 0, changed)).response.status,
    409,
  );
  const invalid = trial();
  invalid.answers[0].elapsedMs = -1;
  assert.equal(
    (await save(ctx, a, id, crypto.randomUUID(), 1, invalid)).response.status,
    400,
  );
  assert.equal(
    (
      await ctx.call("/admin/sessions", {
        user: a,
        extra: { "X-Role": "admin" },
      })
    ).status,
    403,
  );
  const large = await ctx.call(
    `/sessions/${id}/rounds/${crypto.randomUUID()}`,
    { method: "PUT", user: a, body: { padding: "x".repeat(70000) } },
  );
  assert.equal(large.status, 413);
});
test("research exports require current opt-in and real signed admin identity", async (t) => {
  const ctx = await setup(t),
    a = await ctx.user(),
    id = await session(ctx, a);
  await save(ctx, a, id);
  const listed = () => ctx.call("/admin/sessions", { admin: ctx.admin });
  assert.equal((await (await listed()).json()).sessions.length, 0);
  const forged = await ctx.sign(
    { email: "stranger@example.test" },
    "https://example.cloudflareaccess.com",
  );
  assert.equal(
    (await ctx.call("/admin/sessions", { admin: forged })).status,
    403,
  );
  const badAudience = await ctx.sign(
    { email: "owner@example.test" },
    "https://example.cloudflareaccess.com",
    "other-app",
  );
  assert.equal(
    (await ctx.call("/admin/sessions", { admin: badAudience })).status,
    403,
  );
  const expired = await ctx.sign(
    { email: "owner@example.test" },
    "https://example.cloudflareaccess.com",
    "admin-app",
    "-1s",
  );
  assert.equal(
    (await ctx.call("/admin/sessions", { admin: expired })).status,
    403,
  );
  assert.equal(
    (
      await ctx.call(`/sessions/${id}/research-permission`, {
        method: "PUT",
        user: a,
        body: { granted: true, version: "task-training-permission-v1" },
      })
    ).status,
    200,
  );
  const list = await (await listed()).json();
  assert.equal(list.sessions.length, 1);
  assert.ok(!JSON.stringify(list).includes(a.token));
  assert.ok(!JSON.stringify(list).includes("@example.test"));
  const exported = await ctx.call("/admin/training-export", {
    method: "POST",
    admin: ctx.admin,
    body: { sessionIds: [id] },
  });
  assert.equal(exported.status, 200);
  const bundle = await exported.json();
  assert.equal(bundle.schema, "recall-training-bundle-v1");
  const prepared = prepareTrainingDataset(bundle.exports);
  assert.equal(prepared.records.length, 1);
  assert.equal(prepared.records[0].target, 1);
  assert.equal(
    (await ctx.db.prepare("SELECT COUNT(*) AS n FROM admin_audit").first()).n,
    1,
  );
  assert.equal(
    (
      await ctx.call(`/sessions/${id}/research-permission`, {
        method: "DELETE",
        user: a,
      })
    ).status,
    200,
  );
  assert.equal((await (await listed()).json()).sessions.length, 0);
  assert.equal(
    (
      await ctx.call("/admin/training-export", {
        method: "POST",
        admin: ctx.admin,
        body: { sessionIds: [id] },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await ctx.call("/admin/training-export", {
        method: "POST",
        admin: ctx.admin,
        requestOrigin: "https://attacker.test",
        body: { sessionIds: [id] },
      })
    ).status,
    403,
  );
});
test("expiry filters reads before cleanup and deletions cascade", async (t) => {
  const ctx = await setup(t),
    a = await ctx.user(),
    id = await session(ctx, a);
  await save(ctx, a, id);
  await ctx.call(`/sessions/${id}/research-permission`, {
    method: "PUT",
    user: a,
    body: { granted: true, version: "task-training-permission-v1" },
  });
  await ctx.db
    .prepare("UPDATE rounds SET expires_at=? WHERE session_id=?")
    .bind(Date.now() - 1, id)
    .run();
  const read = await (await ctx.call(`/sessions/${id}`, { user: a })).json();
  assert.equal(read.data.trials.length, 0);
  assert.equal(
    (await (await ctx.call("/admin/sessions", { admin: ctx.admin })).json())
      .sessions.length,
    0,
  );
  await cleanup(ctx.db);
  assert.equal(
    (await ctx.db.prepare("SELECT COUNT(*) AS n FROM rounds").first()).n,
    0,
  );
  const second = await session(ctx, a);
  await save(ctx, a, second);
  assert.equal(
    (await ctx.call(`/sessions/${second}`, { method: "DELETE", user: a }))
      .status,
    200,
  );
  assert.equal(
    (await ctx.call(`/sessions/${second}`, { user: a })).status,
    404,
  );
  const third = await session(ctx, a);
  await save(ctx, a, third);
  assert.equal(
    (await ctx.call("/account", { method: "DELETE", user: a })).status,
    200,
  );
  for (const table of [
    "users",
    "auth_sessions",
    "task_sessions",
    "rounds",
    "research_permissions",
  ])
    assert.equal(
      (await ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,
      0,
    );
});
test("progressive rounds survive canonical cloud saving and permissioned training export", async (t) => {
  const ctx = await setup(t),
    a = await ctx.user(),
    id = await session(ctx, a);
  const base = makeTrial(42, "delay", { difficultyLevel: 4 });
  const data = {
    ...base,
    valid: true,
    correct: 99,
    source: "live",
    completedAt: new Date().toISOString(),
    settings: { retentionSeconds: 0 },
    answers: base.placements.map((p) => ({ room: p.room, elapsedMs: 1000 })),
    distractionAnswers: [
      { index: 0, answer: "even", elapsedMs: 500, correct: "forged" },
    ],
  };
  const written = await save(ctx, a, id, crypto.randomUUID(), 0, data);
  assert.equal(written.response.status, 201);
  const restored = (
    await (await ctx.call(`/sessions/${id}`, { user: a })).json()
  ).data.trials[0];
  assert.equal(restored.correct, 5);
  assert.equal(restored.settings.retentionSeconds, 18);
  assert.equal(typeof restored.distractionAnswers[0].correct, "boolean");
  await ctx.call(`/sessions/${id}/research-permission`, {
    method: "PUT",
    user: a,
    body: { granted: true, version: "task-training-permission-v1" },
  });
  const response = await ctx.call("/admin/training-export", {
    method: "POST",
    admin: ctx.admin,
    body: { sessionIds: [id] },
  });
  assert.equal(response.status, 200);
  const bundle = await response.json();
  const dataset = prepareTrainingDataset(bundle.exports);
  assert.equal(dataset.records[0].difficultyLevel, 4);
  assert.equal(dataset.records[0].objectCount, 5);
  assert.equal(dataset.records[0].target, 1);
});
test("rate limiting rejects excess writes and unconfigured service fails closed", async (t) => {
  const ctx = await setup(t);
  await rateLimit(ctx.db, "isolated", 1);
  await assert.rejects(
    () => rateLimit(ctx.db, "isolated", 1),
    (e) => e.status === 429,
  );
  const response = await ctx.handle(new Request(`${origin}/api/sessions`), {});
  assert.equal(response.status, 503);
  assert.equal(
    (await (await ctx.handle(new Request(`${origin}/api/config`), {})).json())
      .cloud,
    false,
  );
});

test("concurrent appends cannot overwrite or silently merge another device's round", async (t) => {
  const ctx = await setup(t),
    a = await ctx.user(),
    id = await session(ctx, a);
  const attempts = await Promise.all([save(ctx, a, id), save(ctx, a, id)]);
  assert.deepEqual(attempts.map((a) => a.response.status).sort(), [201, 409]);
  const report = await (await ctx.call(`/sessions/${id}`, { user: a })).json();
  assert.equal(report.session.revision, 1);
  assert.equal(report.data.trials.length, 1);
});
