import { verifyAdmin, json } from "../../server/security.js";
export async function onRequest({ request, env, next }) {
  try {
    await verifyAdmin(request, env);
    return next();
  } catch (error) {
    return json(
      { error: error.status ? error.message : "Admin access denied." },
      error.status || 403,
    );
  }
}
