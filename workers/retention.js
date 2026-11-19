import { cleanup } from "../server/cleanup.js";
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanup(env.DB));
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
};
