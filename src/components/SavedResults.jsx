import React, { useState } from "react";
export function AccountMenu({ saved, active }) {
  const [message, setMessage] = useState("");
  if (!saved.cloud) return null;
  if (!saved.user)
    return (
      <a
        className={`account-signin ${active ? "disabled-link" : ""}`}
        href={active ? undefined : "/api/auth/start"}
        aria-disabled={active}
      >
        Sign in with Google
      </a>
    );
  async function leave(remove = false) {
    try {
      await saved.logout(remove);
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <details className="account-menu">
      <summary>My account</summary>
      <div>
        <p>{saved.user.email}</p>
        <button disabled={active} onClick={() => leave()}>
          Sign out
        </button>
        <button
          disabled={active}
          onClick={() => {
            if (
              window.confirm(
                "Delete your account, all cloud results, and this account’s device cache? This cannot be undone. Download any results you want to keep first.",
              )
            )
              leave(true);
          }}
        >
          Delete account and data
        </button>
        <p role="status">{message}</p>
      </div>
    </details>
  );
}
export default function SavedResults({ saved, active }) {
  const [message, setMessage] = useState("");
  async function run(action) {
    try {
      setMessage("");
      await action();
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <section className="saved-results lab-card">
      <div className="lab-card-head">
        <h2>{saved.user ? "Saved sessions" : "Keep your results"}</h2>
        <span className="save-status" role="status">
          {saved.status}
        </span>
      </div>
      <div className="saved-results-body">
        {!saved.user ? (
          <p>
            Completed rounds save automatically in this browser. You can also
            download a copy.{" "}
            {saved.cloud && (
              <>
                Sign in with Google to save across devices. Your guest history
                is not uploaded automatically.
              </>
            )}
          </p>
        ) : (
          <>
            <p>
              Cloud results expire 365 days after each round is received.
              Download or delete them whenever you choose.
            </p>
            {saved.guestAvailable && (
              <button
                className="lab-secondary"
                disabled={active}
                onClick={() => run(saved.adoptGuest)}
              >
                Save this device’s guest results to my account
              </button>
            )}
            <div className="saved-session-list">
              {saved.sessions.map((s) => (
                <div key={s.id}>
                  <div>
                    <strong>
                      {new Date(s.created_at).toLocaleDateString()} · {s.rounds}{" "}
                      rounds
                    </strong>
                    <small>
                      {s.id === saved.currentId ? "Current session · " : ""}
                      {s.research_granted
                        ? "Research permission granted"
                        : "Private history only"}
                    </small>
                  </div>
                  <button
                    className="lab-text"
                    disabled={active}
                    onClick={() => run(() => saved.openSession(s.id))}
                  >
                    Open
                  </button>
                  <button
                    className="lab-text"
                    disabled={active}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Permanently delete this cloud session? This cannot be undone.",
                        )
                      )
                        run(() => saved.deleteSession(s.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
            <label className="research-choice">
              <input
                type="checkbox"
                checked={saved.research}
                disabled={active}
                onChange={(e) =>
                  run(() => saved.setPermission(e.target.checked))
                }
              />
              <span>
                Allow the current session’s task responses and timings to be
                used for model research. This is optional and does not affect
                saving or practice.
              </span>
            </label>
            <p className="privacy-detail">
              This permission covers this session only, including later rounds
              added to it. Withdrawal excludes it from future exports. Copies
              already downloaded and previously released models cannot
              automatically be recalled. Imported task data needs its own
              explicit permission. <a href="/privacy">Privacy details</a>
            </p>
          </>
        )}
        {saved.user && (
          <button
            className="lab-text"
            disabled={active}
            onClick={() => run(saved.retry)}
          >
            Retry cloud saving
          </button>
        )}
        {saved.conflict && (
          <button
            className="lab-secondary"
            disabled={active}
            onClick={() => run(saved.fork)}
          >
            Keep device results as a new session
          </button>
        )}
        <p role="status">{message}</p>
      </div>
    </section>
  );
}
