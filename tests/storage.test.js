import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  newWorkspace,
  readWorkspace,
  writeWorkspace,
  removeWorkspace,
} from "../src/storage.js";
test("guest and account device workspaces are isolated and sign-out cleanup preserves guests", async () => {
  const guest = { ...newWorkspace(), data: { trials: [{ correct: 1 }] } };
  const a = { ...newWorkspace(), data: { trials: [{ correct: 3 }] } };
  await writeWorkspace("guest", guest);
  await writeWorkspace("user:a", a);
  assert.deepEqual(await readWorkspace("guest"), guest);
  assert.deepEqual(await readWorkspace("user:a"), a);
  assert.equal(await readWorkspace("user:b"), undefined);
  await removeWorkspace("user:a");
  assert.equal(await readWorkspace("user:a"), undefined);
  assert.deepEqual(await readWorkspace("guest"), guest);
  const fresh = newWorkspace();
  assert.notEqual(fresh.id, guest.id);
  assert.equal(fresh.researchPermission, false);
  assert.equal(fresh.revision, 0);
  assert.deepEqual(fresh.roundIds, []);
});
