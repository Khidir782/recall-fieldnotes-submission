import { RETENTION } from "./security.js";
export async function cleanup(db, now = Date.now()) {
  await db.batch([
    db.prepare("DELETE FROM rounds WHERE expires_at<=?").bind(now),
    db
      .prepare(
        "DELETE FROM task_sessions WHERE NOT EXISTS(SELECT 1 FROM rounds WHERE rounds.session_id=task_sessions.id) AND created_at<?",
      )
      .bind(now - 86400000),
    db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").bind(now),
    db.prepare("DELETE FROM oauth_transactions WHERE expires_at<=?").bind(now),
    db.prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(now),
    db
      .prepare("DELETE FROM admin_audit WHERE created_at<?")
      .bind(now - RETENTION),
    db
      .prepare("DELETE FROM deletion_log WHERE deleted_at<?")
      .bind(now - RETENTION),
  ]);
}
