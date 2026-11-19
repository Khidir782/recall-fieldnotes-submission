import React from "react";
export default function Privacy() {
  return (
    <div className="lab-app">
      <header className="site-header">
        <a className="lab-brand" href="/">
          Recall Fieldnotes
        </a>
      </header>
      <main className="lab-content privacy-page">
        <h1>Privacy & research permission</h1>
        <p>
          Recall Fieldnotes measures performance on its own recall tasks. It is
          not a clinical assessment. This initial pilot is intended for adults.
        </p>
        <h2>Practice without an account</h2>
        <p>
          Completed rounds are saved in this browser using IndexedDB. Unfinished
          timed rounds are not restored. Clearing browser data removes this
          history. You can download a JSON copy. Guest task results are not
          uploaded automatically.
        </p>
        <h2>Optional cloud history</h2>
        <p>
          Where cloud saving is enabled, Google sign-in lets you save results
          across devices. We store your Google account subject and email for
          authentication, a separate internal user ID, and task sessions
          containing answers, timings, conditions, random route seeds, validity
          flags, and model metadata. Passwords and Google access tokens are not
          retained. You choose whether to copy existing guest results into your
          account.
        </p>
        <h2>Who can access data</h2>
        <p>
          Participants can access only their own cloud history. The private
          research interface exposes only sessions with current research
          permission. Project infrastructure administrators and service
          providers have technical administrative capabilities. Participant
          identifiers are pseudonymous, not anonymous. Google processes sign-in,
          Cloudflare hosts the site and database, and Google Fonts may process
          ordinary font-request metadata.
        </p>
        <h2>Separate research permission</h2>
        <p>
          Cloud saving does not require research permission. Permission is off
          by default and applies to the selected session, including later rounds
          added to that session. Research exports use a stable pseudonymous
          participant key, not your email or Google subject. Permission can be
          withdrawn in History before future exports. Already downloaded copies
          and previously released models cannot automatically be recalled. The
          project owner must manage private export copies and honor applicable
          deletion requests.
        </p>
        <h2>Retention and deletion</h2>
        <p>
          Cloud task rounds expire 365 days after server receipt, are excluded
          from reads and research exports on expiry, and are removed by
          scheduled cleanup. You can delete a saved session or your account
          earlier. Signing out removes that account’s cached workspace from this
          browser. Guest copies and files you downloaded remain under your
          control. Cloudflare recovery backups may retain deleted data until
          their provider retention period expires; restoring a backup must
          reapply deletion records before reopening the service.
        </p>
        <h2>Your controls and contact</h2>
        <p>
          Use History to save, export, or delete sessions and change research
          permission. Use My account to sign out or delete account data. Export
          files contain task data: keep them private. For privacy questions or
          research-copy deletion requests, contact the project owner through{" "}
          <a href="https://laphynya.my">laphynya.my</a>.
        </p>
        <p>
          Research permission version: task-training-permission-v1. No model
          improvement, diagnostic accuracy, or treatment benefit is promised.
        </p>
        <a className="lab-secondary" href="/">
          Back to practice
        </a>
      </main>
    </div>
  );
}
