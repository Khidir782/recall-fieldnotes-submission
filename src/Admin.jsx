import React, { useEffect, useState } from "react";
import { api } from "./hooks/useSavedResults.js";
import SupervisedTaskModel from "./components/SupervisedTaskModel.jsx";
export default function Admin() {
  const [identity, setIdentity] = useState(null),
    [sessions, setSessions] = useState([]),
    [cursor, setCursor] = useState(null),
    [selected, setSelected] = useState([]),
    [message, setMessage] = useState("Checking admin access…"),
    [model, setModel] = useState(null);
  async function list(next = null) {
    const query = next ? `?before=${next.updatedAt}&beforeId=${next.id}` : "";
    const data = await api(`/admin/sessions${query}`);
    setSessions(data.sessions);
    setCursor(data.nextCursor);
    setSelected([]);
  }
  useEffect(() => {
    (async () => {
      try {
        const me = await api("/admin/me");
        setIdentity(me.email);
        await list();
        setMessage("");
      } catch (e) {
        setMessage(e.message);
      }
    })();
  }, []);
  async function download() {
    try {
      const data = await api("/admin/training-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds: selected }),
      });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `recall-research-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "Private training export downloaded. Keep it out of source control.",
      );
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <div className="lab-app">
      <header className="site-header">
        <a className="lab-brand" href="/">
          Recall Fieldnotes
        </a>
        <span>Research administration</span>
      </header>
      <main className="lab-content">
        <div className="lab-title-row">
          <div>
            <h1>Research data.</h1>
            <p>Only sessions with current research permission appear here.</p>
          </div>
        </div>
        <p role="status">{message}</p>
        {identity && (
          <>
            <section className="lab-card">
              <div className="lab-card-head">
                <h2>Permissioned sessions</h2>
                <button
                  className="lab-secondary"
                  disabled={!selected.length}
                  onClick={download}
                >
                  Export selected ({selected.length}/10)
                </button>
              </div>
              <div className="saved-results-body">
                <p>
                  Signed in as {identity}. Exports contain pseudonymous task
                  responses, never Google identity fields. Client-reported
                  observations are not independently verified.
                </p>
                {sessions.length === 0 && <p>No eligible sessions.</p>}
                {sessions.map((s) => (
                  <label className="admin-session" key={s.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      disabled={
                        !selected.includes(s.id) && selected.length >= 10
                      }
                      onChange={(e) =>
                        setSelected((xs) =>
                          e.target.checked
                            ? [...xs, s.id]
                            : xs.filter((id) => id !== s.id),
                        )
                      }
                    />
                    <span>
                      <strong>{s.participant_key}</strong>
                      <small>
                        {s.rounds} rounds · session {s.id} · permission{" "}
                        {new Date(s.granted_at).toLocaleDateString()}
                      </small>
                    </span>
                  </label>
                ))}
                <div className="model-load-actions">
                  <button
                    className="lab-text"
                    onClick={() => list().catch((e) => setMessage(e.message))}
                  >
                    Refresh first page
                  </button>
                  {cursor && (
                    <button
                      className="lab-text"
                      onClick={() =>
                        list(cursor).catch((e) => setMessage(e.message))
                      }
                    >
                      Next page
                    </button>
                  )}
                </div>
              </div>
            </section>
            <SupervisedTaskModel
              model={model}
              onLoad={setModel}
              onRemove={() => setModel(null)}
              active={false}
            />
            <p className="privacy-detail">
              Loading a model here is an inspection step only. Publish validated
              weights through the reviewed model-release deployment command.
              There is no automatic retraining or promotion.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
