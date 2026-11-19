import { useEffect, useRef, useState } from "react";
import { importSession, sessionExport } from "../experiment.js";
import {
  readWorkspace,
  writeWorkspace,
  removeWorkspace,
  newWorkspace,
} from "../storage.js";
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    signal: AbortSignal.timeout(15000),
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw Object.assign(Error("Cloud saving is unavailable on this host."), {
      status: 503,
    });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(Error(data.error || "Request failed."), {
      status: response.status,
    });
  return data;
}
export default function useSavedResults(trials, setTrials, resetTask) {
  const [ready, setReady] = useState(false),
    [cloud, setCloud] = useState(false),
    [user, setUser] = useState(null),
    [status, setStatus] = useState(""),
    [sessions, setSessions] = useState([]),
    [guestAvailable, setGuestAvailable] = useState(false),
    [research, setResearch] = useState(false),
    [conflict, setConflict] = useState(false),
    [refresh, setRefresh] = useState(0);
  const current = useRef(null),
    key = useRef("guest"),
    csrf = useRef(""),
    busy = useRef(false),
    latest = useRef(trials),
    mounted = useRef(true),
    serial = useRef(Promise.resolve()),
    dirty = useRef(false);
  latest.current = trials;
  const mutate = (path, method, body) =>
    api(path, {
      method,
      headers: { "X-CSRF-Token": csrf.current },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  function persist(record) {
    const partition = key.current,
      copy = structuredClone(record);
    serial.current = serial.current
      .catch(() => {})
      .then(() => writeWorkspace(partition, copy));
    return serial.current;
  }
  useEffect(() => {
    mounted.current = true;
    (async () => {
      let identity = null,
        enabled = false;
      try {
        const config = await api("/config");
        enabled = config.cloud;
        if (enabled) {
          try {
            identity = await api("/auth/me");
          } catch (e) {
            if (e.status !== 401) throw e;
          }
        }
      } catch {
        /* Static demo and offline guests remain usable. */
      }
      if (!mounted.current) return;
      setCloud(enabled);
      setUser(identity?.user || null);
      csrf.current = identity?.csrf || "";
      key.current = identity ? `user:${identity.user.id}` : "guest";
      try {
        const stored = await readWorkspace(key.current);
        current.current = stored || newWorkspace();
        if (stored?.data) setTrials(importSession(stored.data));
        setResearch(Boolean(stored?.researchPermission));
        if (identity)
          setGuestAvailable(
            Boolean((await readWorkspace("guest"))?.data?.trials?.length),
          );
        setStatus(
          identity
            ? "Checking cloud history…"
            : "Saved automatically on this device.",
        );
      } catch {
        current.current = newWorkspace();
        setStatus(
          "Device saving is unavailable. Use Save results before leaving.",
        );
      }
      if (mounted.current) setReady(true);
    })();
    return () => {
      mounted.current = false;
    };
  }, []);
  async function listSessions() {
    try {
      const result = await api("/sessions");
      if (mounted.current) setSessions(result.sessions);
    } catch (e) {
      if (mounted.current) setStatus(e.message);
    }
  }
  async function sync() {
    if (busy.current || !current.current || conflict || !user) return;
    busy.current = true;
    const record = current.current;
    try {
      if (!record.attached && !latest.current.length) {
        setStatus("Signed in. Completed rounds will save automatically.");
        return;
      }
      setStatus("Saving…");
      if (!record.attached) {
        const result = await mutate("/sessions", "POST", { id: record.id });
        record.revision = result.session.revision;
        record.attached = true;
      }
      while (
        record === current.current &&
        record.syncedCount < latest.current.length
      ) {
        const index = record.syncedCount,
          trial = latest.current[index];
        if (!record.roundIds[index])
          record.roundIds[index] = crypto.randomUUID();
        await persist({ ...record, data: sessionExport(latest.current) });
        const saved = await mutate(
          `/sessions/${record.id}/rounds/${record.roundIds[index]}`,
          "PUT",
          { revision: record.revision, trial },
        );
        record.revision = saved.revision;
        record.syncedCount++;
        record.data = sessionExport(latest.current);
        await persist(record);
      }
      setStatus("Saved to your account.");
      await listSessions();
    } catch (e) {
      if (e.status === 409) {
        setConflict(true);
        setStatus(
          "This session changed elsewhere. Open its cloud copy, or keep this device copy as a new session.",
        );
      } else
        setStatus(
          `${e.message} Your device copy is kept; retry when connected.`,
        );
    } finally {
      busy.current = false;
      if (dirty.current) {
        dirty.current = false;
        setRefresh((n) => n + 1);
      }
    }
  }
  useEffect(() => {
    if (!ready || !current.current) return;
    const record = current.current;
    while (record.roundIds.length < trials.length)
      record.roundIds.push(crypto.randomUUID());
    record.data = sessionExport(trials);
    persist(record)
      .then(() => {
        if (!user) {
          setStatus("Saved automatically on this device.");
          return;
        }
        if (busy.current) dirty.current = true;
        else sync();
      })
      .catch(() =>
        setStatus(
          "Device saving failed. Download your results before leaving.",
        ),
      );
  }, [trials, ready, user?.id, refresh]);
  useEffect(() => {
    if (!ready || !user) return;
    listSessions();
    const online = () => setRefresh((n) => n + 1);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [ready, user?.id]);
  function replace(nextTrials = []) {
    if (busy.current) throw Error("Wait for the current save to finish.");
    current.current = { ...newWorkspace(), data: sessionExport(nextTrials) };
    latest.current = nextTrials;
    setConflict(false);
    setResearch(false);
    resetTask();
    setTrials(nextTrials);
    setRefresh((n) => n + 1);
  }
  async function openSession(id) {
    if (busy.current) throw Error("Wait for saving to finish, then retry.");
    const response = await api(`/sessions/${id}`);
    const restored = importSession(response.data);
    current.current = {
      id,
      revision: response.session.revision,
      syncedCount: restored.length,
      roundIds: response.roundIds,
      attached: true,
      researchPermission: response.researchPermission,
      data: sessionExport(restored),
    };
    setResearch(response.researchPermission);
    setConflict(false);
    resetTask();
    setTrials(restored);
    setRefresh((n) => n + 1);
  }
  async function adoptGuest() {
    const guest = await readWorkspace("guest");
    if (!guest?.data) return;
    if (
      latest.current.length &&
      !window.confirm(
        "Start a new account session from this device’s guest results? Your saved cloud sessions will remain.",
      )
    )
      return;
    replace(importSession(guest.data));
    await persist(current.current);
    await removeWorkspace("guest");
    setGuestAvailable(false);
  }
  async function setPermission(granted) {
    const record = current.current;
    if (
      !record?.attached ||
      record.syncedCount !== latest.current.length ||
      busy.current
    )
      throw Error(
        "Finish saving these rounds before changing research permission.",
      );
    await mutate(
      `/sessions/${record.id}/research-permission`,
      granted ? "PUT" : "DELETE",
      granted
        ? { granted: true, version: "task-training-permission-v1" }
        : undefined,
    );
    record.researchPermission = granted;
    setResearch(granted);
    await persist(record);
    await listSessions();
  }
  async function deleteSession(id) {
    if (busy.current) throw Error("Wait for saving to finish.");
    await mutate(`/sessions/${id}`, "DELETE");
    if (current.current.id === id) replace([]);
    await listSessions();
  }
  async function logout(deleteAccount = false) {
    if (busy.current)
      throw Error("Wait for saving to finish before signing out.");
    await mutate(
      deleteAccount ? "/account" : "/auth/logout",
      deleteAccount ? "DELETE" : "POST",
    );
    await serial.current.catch(() => {});
    await removeWorkspace(key.current);
    const guest = await readWorkspace("guest");
    // Read first, then switch identity and workspace together. Never allow an
    // intermediate render to write the previous account into the guest store.
    const nextTrials = guest?.data ? importSession(guest.data) : [];
    key.current = "guest";
    csrf.current = "";
    current.current = guest || newWorkspace();
    latest.current = nextTrials;
    setUser(null);
    setSessions([]);
    setGuestAvailable(false);
    setResearch(false);
    setConflict(false);
    resetTask();
    setTrials(nextTrials);
    setRefresh((n) => n + 1);
  }
  return {
    ready,
    cloud,
    user,
    status,
    sessions,
    guestAvailable,
    research,
    conflict,
    currentId: current.current?.id,
    replace,
    openSession,
    adoptGuest,
    setPermission,
    deleteSession,
    logout,
    retry: () => setRefresh((n) => n + 1),
    fork: () => replace(importSession(sessionExport(latest.current))),
    listSessions,
  };
}
