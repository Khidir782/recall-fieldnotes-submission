import { importSession, sessionExport } from "../src/experiment.js";
import { TRAINING_SCHEMA } from "../src/taskPerformance.js";
import * as security from "./security.js";
const {
  fail,
  json,
  hash,
  randomToken,
  cookie,
  setCookie,
  uuid,
  sameOrigin,
  requireUser,
  rateLimit,
  bodyJson,
  configured,
  DAY,
  RETENTION,
  CONSENT_VERSION,
  SESSION_COOKIE,
  OAUTH_COOKIE,
} = security;
const sql = (env, text, ...args) => env.DB.prepare(text).bind(...args);
async function owned(env, user, id) {
  if (!uuid(id)) fail(404, "Session not found.");
  const row = await sql(
    env,
    "SELECT * FROM task_sessions WHERE id=? AND user_id=?",
    id,
    user.user_id,
  ).first();
  if (!row) fail(404, "Session not found.");
  return row;
}
async function rounds(env, id) {
  return (
    await sql(
      env,
      "SELECT * FROM rounds WHERE session_id=? AND expires_at>? ORDER BY ordinal",
      id,
      Date.now(),
    ).all()
  ).results;
}
async function permission(env, id) {
  return Boolean(
    await sql(
      env,
      "SELECT session_id FROM research_permissions WHERE session_id=? AND withdrawn_at IS NULL",
      id,
    ).first(),
  );
}
function redirect(url, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store", ...headers },
  });
}
function canonical(raw) {
  try {
    const trial = importSession(sessionExport([raw]))[0];
    if (Date.parse(trial.completedAt) > Date.now() + 60000)
      fail(400, "Round timestamp is in the future.");
    // Cloud observations are client-reported, not independently authenticated trials.
    const { prediction, ...rest } = trial;
    return rest;
  } catch (error) {
    fail(400, error.status ? error.message : "Invalid completed round.");
  }
}
export function createApi(deps = {}) {
  const verifyGoogle = deps.verifyGoogle || security.verifyGoogle;
  const verifyAdmin = deps.verifyAdmin || security.verifyAdmin;
  const providerFetch = deps.fetch || fetch;
  return async function handle(request, env) {
    try {
      const url = new URL(request.url),
        path = url.pathname.replace(/\/$/, ""),
        method = request.method;
      if (path === "/api/config" && method === "GET")
        return json({ cloud: configured(env), origin: env.APP_ORIGIN || null });
      if (!configured(env))
        fail(
          503,
          "Cloud saving is not configured. You can still practise on this device.",
        );
      // No authentication, API or data access through alternate origins.
      if (url.origin !== env.APP_ORIGIN)
        fail(403, "Use the configured application address.");
      if (path === "/api/auth/start" && method === "GET") {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        await rateLimit(
          env.DB,
          `login:${await hash(`${env.SECURITY_SECRET}:${ip}`)}`,
          10,
          600000,
        );
        const state = randomToken(),
          browserToken = randomToken(),
          nonce = randomToken(),
          verifier = randomToken();
        await sql(
          env,
          "INSERT INTO oauth_transactions(state_hash,cookie_hash,nonce,verifier,expires_at) VALUES(?,?,?,?,?)",
          await hash(state),
          await hash(browserToken),
          nonce,
          verifier,
          Date.now() + 600000,
        ).run();
        const challengeBytes = new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        );
        const challenge = btoa(String.fromCharCode(...challengeBytes))
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replaceAll("=", "");
        const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        target.search = new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          redirect_uri: `${env.APP_ORIGIN}/api/auth/callback`,
          response_type: "code",
          scope: "openid email",
          state,
          nonce,
          code_challenge: challenge,
          code_challenge_method: "S256",
          prompt: "select_account",
        }).toString();
        return redirect(target.toString(), {
          "Set-Cookie": setCookie(OAUTH_COOKIE, browserToken, 600),
        });
      }
      if (path === "/api/auth/callback" && method === "GET") {
        const state = url.searchParams.get("state") || "",
          code = url.searchParams.get("code");
        if (!code || !/^[a-f0-9]{64}$/.test(state))
          fail(400, "Sign-in was cancelled or invalid. Please try again.");
        const tx = await sql(
          env,
          "DELETE FROM oauth_transactions WHERE state_hash=? AND cookie_hash=? AND expires_at>? RETURNING *",
          await hash(state),
          await hash(cookie(request, OAUTH_COOKIE)),
          Date.now(),
        ).first();
        if (!tx)
          fail(401, "Sign-in expired or was already used. Please try again.");
        const response = await providerFetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: env.GOOGLE_CLIENT_ID,
              client_secret: env.GOOGLE_CLIENT_SECRET,
              code,
              code_verifier: tx.verifier,
              grant_type: "authorization_code",
              redirect_uri: `${env.APP_ORIGIN}/api/auth/callback`,
            }),
          },
        );
        if (!response.ok) fail(401, "Google sign-in failed. Please try again.");
        const tokens = await response.json();
        let identity;
        try {
          identity = await verifyGoogle(tokens.id_token, env, tx.nonce);
        } catch {
          fail(401, "Google identity could not be verified.");
        }
        const now = Date.now();
        await sql(
          env,
          "INSERT INTO users(id,google_sub,email,participant_key,created_at) VALUES(?,?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email",
          crypto.randomUUID(),
          identity.sub,
          identity.email,
          crypto.randomUUID(),
          now,
        ).run();
        const user = await sql(
          env,
          "SELECT id FROM users WHERE google_sub=?",
          identity.sub,
        ).first();
        const token = randomToken();
        await sql(
          env,
          "INSERT INTO auth_sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)",
          await hash(token),
          user.id,
          randomToken(),
          now + 7 * DAY,
        ).run();
        const headers = new Headers({
          Location: `${env.APP_ORIGIN}/`,
          "Cache-Control": "no-store",
        });
        headers.append(
          "Set-Cookie",
          setCookie(SESSION_COOKIE, token, 7 * 86400),
        );
        headers.append("Set-Cookie", setCookie(OAUTH_COOKIE, "", 0));
        return new Response(null, { status: 302, headers });
      }
      if (path.startsWith("/api/admin/")) {
        let actor;
        try {
          actor = await verifyAdmin(request, env);
        } catch (error) {
          fail(
            error.status || 403,
            error.status ? error.message : "Admin access denied.",
          );
        }
        await rateLimit(env.DB, `admin:${await hash(actor)}`, 60);
        if (path === "/api/admin/me" && method === "GET")
          return json({ email: actor });
        if (path === "/api/admin/sessions" && method === "GET") {
          const before = Number(
              url.searchParams.get("before") || Date.now() + 1,
            ),
            beforeId = url.searchParams.get("beforeId") || "~";
          if (
            !Number.isSafeInteger(before) ||
            before < 0 ||
            (beforeId !== "~" && !uuid(beforeId))
          )
            fail(400, "Invalid page cursor.");
          const rows = await sql(
            env,
            `SELECT s.id,s.updated_at,u.participant_key,p.granted_at,COUNT(r.id) AS rounds
            FROM task_sessions s JOIN users u ON u.id=s.user_id
            JOIN research_permissions p ON p.session_id=s.id AND p.withdrawn_at IS NULL
            JOIN rounds r ON r.session_id=s.id AND r.expires_at>?
            WHERE (s.updated_at<? OR (s.updated_at=? AND s.id<?)) GROUP BY s.id ORDER BY s.updated_at DESC,s.id DESC LIMIT 51`,
            Date.now(),
            before,
            before,
            beforeId,
          ).all();
          const page = rows.results.slice(0, 50);
          return json({
            sessions: page,
            nextCursor:
              rows.results.length > 50
                ? { updatedAt: page.at(-1).updated_at, id: page.at(-1).id }
                : null,
          });
        }
        if (path === "/api/admin/training-export" && method === "POST") {
          sameOrigin(request, env);
          await rateLimit(env.DB, `export:${await hash(actor)}`, 5);
          const { sessionIds } = await bodyJson(request);
          if (
            !Array.isArray(sessionIds) ||
            !sessionIds.length ||
            sessionIds.length > 10 ||
            !sessionIds.every(uuid) ||
            new Set(sessionIds).size !== sessionIds.length
          )
            fail(400, "Select between 1 and 10 distinct sessions.");
          const exports = [],
            statements = [];
          let count = 0;
          for (const id of sessionIds) {
            const s = await sql(
              env,
              `SELECT s.*,u.participant_key,p.granted_at FROM task_sessions s JOIN users u ON u.id=s.user_id JOIN research_permissions p ON p.session_id=s.id AND p.withdrawn_at IS NULL WHERE s.id=?`,
              id,
            ).first();
            if (!s)
              fail(
                409,
                "A selected session is no longer available for research.",
              );
            const rs = await rounds(env, id);
            count += rs.length;
            if (count > 5000)
              fail(413, "Export fewer sessions at a time (5,000 round limit).");
            if (
              !rs.some((r) => {
                const t = JSON.parse(r.payload);
                return t.valid && !t.transfer;
              })
            )
              fail(409, "A selected session has no eligible rounds.");
            exports.push({
              schema: TRAINING_SCHEMA,
              dataKind: "observed",
              participantKey: s.participant_key,
              sessionKey: id,
              consent: {
                granted: true,
                version: CONSENT_VERSION,
                recordedAt: new Date(s.granted_at).toISOString(),
              },
              session: sessionExport(rs.map((r) => JSON.parse(r.payload))),
            });
            statements.push(
              sql(
                env,
                "INSERT INTO admin_audit(id,actor,action,session_id,created_at) VALUES(?,?,?,?,?)",
                crypto.randomUUID(),
                await hash(actor),
                "training_export",
                id,
                Date.now(),
              ),
            );
          }
          // Recheck permission immediately before export; never serve a cached dataset.
          for (const id of sessionIds)
            if (!(await permission(env, id)))
              fail(409, "Research permission was withdrawn.");
          await env.DB.batch(statements);
          const bundle = {
            schema: "recall-training-bundle-v1",
            exports,
            notice:
              "Client-reported task observations. Keep private; withdrawal cannot recall a downloaded copy.",
          };
          if (
            new TextEncoder().encode(JSON.stringify(bundle, null, 2))
              .byteLength > 4900000
          )
            fail(
              413,
              "Select fewer sessions to keep the training file under 5 MB.",
            );
          return json(bundle);
        }
        fail(404, "Endpoint not found.");
      }
      const mutation = !["GET", "HEAD"].includes(method);
      const user = await requireUser(request, env, mutation);
      await rateLimit(
        env.DB,
        `user:${user.user_id}:${mutation ? "write" : "read"}`,
        mutation ? 120 : 600,
      );
      if (path === "/api/auth/me" && method === "GET")
        return json({
          user: { id: user.user_id, email: user.email },
          csrf: user.csrf,
        });
      if (path === "/api/auth/logout" && method === "POST") {
        await sql(
          env,
          "DELETE FROM auth_sessions WHERE token_hash=?",
          user.token_hash,
        ).run();
        return json({ ok: true }, 200, {
          "Set-Cookie": setCookie(SESSION_COOKIE, "", 0),
        });
      }
      if (path === "/api/account" && method === "DELETE") {
        await env.DB.batch([
          sql(
            env,
            "INSERT INTO deletion_log(id,kind,target_id,deleted_at) VALUES(?,'user',?,?)",
            crypto.randomUUID(),
            user.user_id,
            Date.now(),
          ),
          sql(env, "DELETE FROM users WHERE id=?", user.user_id),
        ]);
        return json({ ok: true }, 200, {
          "Set-Cookie": setCookie(SESSION_COOKIE, "", 0),
        });
      }
      if (path === "/api/sessions") {
        if (method === "GET") {
          const rows = await sql(
            env,
            `SELECT s.*,COUNT(r.id) AS rounds,MAX(CASE WHEN p.withdrawn_at IS NULL THEN p.granted_at END) AS research_granted
            FROM task_sessions s LEFT JOIN rounds r ON r.session_id=s.id AND r.expires_at>?
            LEFT JOIN research_permissions p ON p.session_id=s.id WHERE s.user_id=? GROUP BY s.id ORDER BY s.updated_at DESC LIMIT 100`,
            Date.now(),
            user.user_id,
          ).all();
          return json({ sessions: rows.results });
        }
        if (method === "POST") {
          const { id } = await bodyJson(request);
          if (!uuid(id)) fail(400, "Invalid session ID.");
          const now = Date.now();
          const existing = await sql(
            env,
            "SELECT user_id FROM task_sessions WHERE id=?",
            id,
          ).first();
          if (existing && existing.user_id !== user.user_id)
            fail(404, "Session not found.");
          if (!existing) {
            const count = await sql(
              env,
              "SELECT COUNT(*) AS n FROM task_sessions WHERE user_id=?",
              user.user_id,
            ).first();
            if (count.n >= 100)
              fail(
                429,
                "This pilot allows 100 saved sessions per account. Delete an old session before starting another.",
              );
          }
          await sql(
            env,
            "INSERT INTO task_sessions(id,user_id,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING",
            id,
            user.user_id,
            now,
            now,
          ).run();
          return json({ session: await owned(env, user, id) }, 201);
        }
      }
      const match = path.match(
        /^\/api\/sessions\/([^/]+)(?:\/(rounds|research-permission)(?:\/([^/]+))?)?$/,
      );
      if (match) {
        const [, id, kind, roundId] = match,
          session = await owned(env, user, id);
        if (!kind && method === "GET") {
          const savedRounds = await rounds(env, id);
          return json({
            session,
            roundIds: savedRounds.map((r) => r.id),
            researchPermission: await permission(env, id),
            data: sessionExport(savedRounds.map((r) => JSON.parse(r.payload))),
          });
        }
        if (!kind && method === "DELETE") {
          await env.DB.batch([
            sql(
              env,
              "INSERT INTO deletion_log(id,kind,target_id,deleted_at) VALUES(?,'session',?,?)",
              crypto.randomUUID(),
              id,
              Date.now(),
            ),
            sql(
              env,
              "DELETE FROM task_sessions WHERE id=? AND user_id=?",
              id,
              user.user_id,
            ),
          ]);
          return json({ ok: true });
        }
        if (kind === "research-permission" && !roundId) {
          if (method === "PUT") {
            const data = await bodyJson(request);
            if (data.version !== CONSENT_VERSION || data.granted !== true)
              fail(400, "Explicit research permission is required.");
            await sql(
              env,
              "INSERT INTO research_permissions(session_id,granted_at,version,withdrawn_at) VALUES(?,?,?,NULL) ON CONFLICT(session_id) DO UPDATE SET granted_at=excluded.granted_at,version=excluded.version,withdrawn_at=NULL",
              id,
              Date.now(),
              CONSENT_VERSION,
            ).run();
            return json({ granted: true });
          }
          if (method === "DELETE") {
            await sql(
              env,
              "UPDATE research_permissions SET withdrawn_at=? WHERE session_id=?",
              Date.now(),
              id,
            ).run();
            return json({ granted: false });
          }
        }
        if (kind === "rounds" && uuid(roundId) && method === "PUT") {
          const data = await bodyJson(request);
          if (
            !Number.isInteger(data.revision) ||
            data.revision < 0 ||
            data.revision >= 500
          )
            fail(400, "Invalid session revision or round limit reached.");
          const trial = canonical(data.trial),
            payload = JSON.stringify(trial),
            fingerprint = await hash(payload);
          const existing = await sql(
            env,
            "SELECT fingerprint,ordinal FROM rounds WHERE id=? AND session_id=?",
            roundId,
            id,
          ).first();
          if (existing) {
            if (existing.fingerprint !== fingerprint)
              fail(409, "A saved round cannot be overwritten.");
            return json({ revision: existing.ordinal + 1, duplicate: true });
          }
          if (session.revision !== data.revision)
            fail(
              409,
              "Results changed on another device. Open the saved session again before continuing.",
            );
          const last = await sql(
            env,
            "SELECT payload FROM rounds WHERE session_id=? ORDER BY ordinal DESC LIMIT 1",
            id,
          ).first();
          if (
            last &&
            Date.parse(JSON.parse(last.payload).completedAt) >
              Date.parse(trial.completedAt)
          )
            fail(400, "Rounds must be saved in chronological order.");
          const now = Date.now();
          let results;
          try {
            results = await env.DB.batch([
              sql(
                env,
                "UPDATE task_sessions SET revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?",
                now,
                id,
                user.user_id,
                data.revision,
              ),
              sql(
                env,
                "INSERT INTO rounds(id,session_id,ordinal,payload,fingerprint,received_at,expires_at) SELECT ?,?,?,?,?,?,? FROM task_sessions WHERE id=? AND user_id=? AND revision=?",
                roundId,
                id,
                data.revision,
                payload,
                fingerprint,
                now,
                now + RETENTION,
                id,
                user.user_id,
                data.revision + 1,
              ),
            ]);
          } catch {
            fail(
              409,
              "A concurrent save conflicted. Open the saved session again.",
            );
          }
          if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1)
            fail(409, "The session changed. Open it again before continuing.");
          return json({ revision: data.revision + 1 }, 201);
        }
      }
      fail(404, "Endpoint not found.");
    } catch (error) {
      const status = error instanceof security.HttpError ? error.status : 500;
      if (status === 500) console.error("api_failure", { status }); // Never log request data, tokens or provider responses.
      return json(
        {
          error:
            status === 500
              ? "The service could not complete this request. Your device copy is unchanged."
              : error.message,
        },
        status,
        status === 429 ? { "Retry-After": "60" } : {},
      );
    }
  };
}
export const handleApi = createApi();
