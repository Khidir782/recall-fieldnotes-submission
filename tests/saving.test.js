import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { create } from "react-test-renderer";
import "fake-indexeddb/auto";
import useSavedResults from "../src/hooks/useSavedResults.js";
import {
  newWorkspace,
  readWorkspace,
  writeWorkspace,
  removeWorkspace,
} from "../src/storage.js";
import { makeTrial, sessionExport } from "../src/experiment.js";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = new EventTarget();
window.confirm = () => true;
function round(seed) {
  const t = makeTrial(seed, "quiet");
  return {
    ...t,
    completedAt: new Date(Date.now() + seed).toISOString(),
    valid: true,
    source: "live",
    answers: t.placements.map((p) => ({ room: p.room, elapsedMs: 1000 })),
    correct: 3,
  };
}
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 15));
  });
}
async function until(check) {
  for (let n = 0; n < 80; n++) {
    await settle();
    if (await check()) return;
  }
  assert.fail("Saving did not reach the expected state.");
}
async function mount({ signedIn = false, offline = false, reset = true } = {}) {
  if (reset) {
    await removeWorkspace("guest");
    await removeWorkspace("user:alice");
  }
  let failWrites = offline;
  const calls = [],
    roundIds = new Set();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === "/api/config") return Response.json({ cloud: true });
    if (path === "/api/auth/me")
      return signedIn
        ? Response.json({
            user: { id: "alice", email: "alice@example.test" },
            csrf: "csrf",
          })
        : Response.json({ error: "Sign in" }, { status: 401 });
    if (path === "/api/sessions" && options.method === "POST")
      return Response.json({ session: { revision: 0 } });
    if (path === "/api/sessions") return Response.json({ sessions: [] });
    if (path.includes("/rounds/")) {
      if (failWrites)
        return Response.json({ error: "Offline" }, { status: 503 });
      const id = path.split("/").at(-1);
      roundIds.add(id);
      const body = JSON.parse(options.body);
      return Response.json({ revision: body.revision + 1 });
    }
    if (path === "/api/auth/logout") return Response.json({ ok: true });
    return Response.json({ error: "Not implemented" }, { status: 404 });
  };
  let state;
  function Probe() {
    const [trials, setTrials] = useState([]);
    const saved = useSavedResults(trials, setTrials, () => {});
    state = { trials, setTrials, saved };
    return React.createElement("p", null, saved.status);
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Probe));
  });
  await until(() => state.saved.ready);
  return {
    get state() {
      return state;
    },
    calls,
    roundIds,
    setOffline: (v) => {
      failWrites = v;
    },
    async close() {
      await act(async () => renderer.unmount());
      globalThis.fetch = originalFetch;
    },
  };
}
test("completed guest rounds persist without upload and restore honestly after refresh", async () => {
  const mounted = await mount();
  try {
    await act(async () => mounted.state.setTrials([round(1)]));
    await until(async () =>
      Boolean((await readWorkspace("guest"))?.data?.trials.length),
    );
    assert.equal(
      mounted.calls.some(
        (c) => c.options.method === "POST" || c.path.includes("/rounds/"),
      ),
      false,
    );
    const stored = await readWorkspace("guest");
    assert.equal(stored.data.trials[0].correct, 3);
    assert.equal(stored.researchPermission, false);
  } finally {
    await mounted.close();
  }
  const restored = await mount({ reset: false });
  try {
    assert.equal(restored.state.trials[0].seed, 1);
    assert.equal(restored.state.trials[0].source, "imported");
  } finally {
    await restored.close();
  }
});
test("offline retries keep the same round identity and sign-out cannot copy account data into guest storage", async () => {
  const mounted = await mount({ signedIn: true, offline: true });
  try {
    const guest = { ...newWorkspace(), data: sessionExport([round(2)]) };
    await writeWorkspace("guest", guest);
    await act(async () => mounted.state.setTrials([round(3)]));
    await until(() => mounted.calls.some((c) => c.path.includes("/rounds/")));
    await until(() => mounted.state.saved.status.includes("retry"));
    const firstId = mounted.calls.find((c) => c.path.includes("/rounds/")).path;
    mounted.setOffline(false);
    await act(async () => mounted.state.saved.retry());
    await until(
      () =>
        mounted.roundIds.size === 1 &&
        mounted.state.saved.status === "Saved to your account.",
    );
    assert.equal(
      mounted.calls.filter((c) => c.path.includes("/rounds/")).at(-1).path,
      firstId,
    );
    await act(async () => mounted.state.saved.logout());
    await until(() => !mounted.state.saved.user);
    assert.equal(await readWorkspace("user:alice"), undefined);
    assert.equal((await readWorkspace("guest")).data.trials[0].seed, 2);
    assert.equal(mounted.state.trials[0].seed, 2);
    assert.equal(mounted.state.trials[0].source, "imported");
  } finally {
    await mounted.close();
  }
});
test("replacing history forks a new session and resets research permission", async () => {
  const mounted = await mount({ signedIn: true });
  try {
    await act(async () => mounted.state.setTrials([round(4)]));
    await until(() => mounted.state.saved.status === "Saved to your account.");
    const previous = mounted.state.saved.currentId;
    await act(async () => mounted.state.saved.replace([round(5)]));
    await until(() => mounted.state.saved.status === "Saved to your account.");
    assert.notEqual(mounted.state.saved.currentId, previous);
    assert.equal(mounted.state.saved.research, false);
    assert.equal(
      mounted.calls.filter(
        (c) => c.path === "/api/sessions" && c.options.method === "POST",
      ).length,
      2,
    );
  } finally {
    await mounted.close();
  }
});
