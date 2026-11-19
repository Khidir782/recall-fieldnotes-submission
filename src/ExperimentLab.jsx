import {
  DIFFICULTIES,
  difficultyLevel,
  difficultySettings,
  itemCount,
  progression,
  distractionNumber,
  validateDistraction,
} from "./difficulty.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Download,
  Upload,
  RotateCcw,
  Play,
  Check,
  Info,
  X,
  BookOpen,
  Clock,
  Target,
  Bell,
  ShieldCheck,
  Eye,
  GitBranch,
  MapPin,
  CheckCircle2,
  Search,
} from "lucide-react";
import {
  ROOMS,
  CONDITIONS,
  HYPOTHESES,
  makeTrial,
  makePair,
  posterior,
  summarize,
  scoreAnswers,
  sessionExport,
  importSession,
} from "./experiment";
import { Floorplan, ObjectIcon, courtyard } from "./components/Floorplan";
import EvidenceGraph from "./components/EvidenceGraph";
import { SupervisedForecast } from "./components/SupervisedTaskModel";
import { inferTaskModel, validateTaskModel } from "./taskPerformance.js";
import useSavedResults from "./hooks/useSavedResults.js";
import SavedResults, { AccountMenu } from "./components/SavedResults.jsx";
import PersonalLearner, { ForecastCard } from "./components/PersonalLearner";
import {
  fitLearner,
  predictTrial,
  evaluateLearner,
  recommendPersonal,
} from "./personalModel.js";
import Methods from "./components/Methods";
import { useDialog } from "./hooks/useDialog";
import "./lab.css";

function freshSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
function saveJSON(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExperimentLab() {
  const [taskModel, setTaskModel] = useState(null);
  const [difficultyChoice, setDifficultyChoice] = useState("auto");
  const [resultLevel, setResultLevel] = useState(1);
  const [distractionAnswers, setDistractionAnswers] = useState([]);
  const distractionRef = useRef([]);
  const [pairPlan, setPairPlan] = useState(null),
    [page, setPage] = useState("experiment"),
    [trials, setTrials] = useState([]),
    [queue, setQueue] = useState([]),
    [trial, setTrial] = useState(null),
    [phase, setPhase] = useState("ready"),
    [remaining, setRemaining] = useState(8),
    [prompt, setPrompt] = useState(0),
    [answers, setAnswers] = useState([]),
    [invalid, setInvalid] = useState(false),
    [last, setLast] = useState(null),
    [methods, setMethods] = useState(false),
    [notice, setNotice] = useState(""),
    [inspected, setInspected] = useState(null),
    [undo, setUndo] = useState(null);
  const stageRef = useRef(null);
  const routeRef = useDialog(Boolean(inspected), () => setInspected(null));
  const startTime = useRef(0),
    itemStart = useRef(0),
    invalidRef = useRef(false),
    fileRef = useRef(null);
  const progress = useMemo(() => progression(trials), [trials]);
  const upcomingLevel =
    difficultyChoice === "auto" ? progress.nextLevel : Number(difficultyChoice);
  const shownLevel =
    trial && phase !== "ready" ? difficultyLevel(trial) : upcomingLevel;
  const shownSettings = difficultySettings(
    shownLevel,
    trial && phase !== "ready" ? trial.condition : "quiet",
  );
  const post = useMemo(() => posterior(trials), [trials]);
  const personalState = useMemo(
    () => fitLearner(trials, resultLevel),
    [trials, resultLevel],
  );
  const evaluation = useMemo(
    () => evaluateLearner(trials, resultLevel),
    [trials, resultLevel],
  );
  const next = useMemo(
    () => recommendPersonal(trials, upcomingLevel),
    [trials, upcomingLevel],
  );
  const stats = useMemo(
    () => summarize(trials, resultLevel),
    [trials, resultLevel],
  );
  const valid = trials.filter((t) => t.valid && !t.transfer),
    probe = trials.filter((t) => t.valid && t.transfer),
    totalCorrect = valid.reduce((s, t) => s + t.correct, 0);
  const active = phase === "encode" || phase === "delay" || phase === "recall";
  function resetTask() {
    setUndo(null);
    setPairPlan(null);
    setQueue([]);
    setTrial(null);
    setLast(null);
    setPhase("ready");
  }
  const saved = useSavedResults(trials, setTrials, resetTask);
  useEffect(() => {
    fetch("/models/current.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setTaskModel(validateTaskModel(data));
      })
      .catch(() => {});
  }, []);
  const leader = post.mass.indexOf(Math.max(...post.mass));
  const adequate =
    valid.filter((t) => difficultyLevel(t) === 1).length >= 6 &&
    summarize(trials, 1).filter((s) => s.trials >= 2).length >= 2 &&
    post.mass[leader] > 0.6;
  useEffect(() => {
    if (active && (methods || page !== "experiment")) {
      invalidRef.current = true;
      setInvalid(true);
    }
  }, [active, methods, page]);
  function flash(text) {
    setNotice(text);
  }
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (phase !== "encode" && phase !== "delay") return;
    const settings = difficultySettings(
      difficultyLevel(trial),
      trial.condition,
    );
    const seconds =
      phase === "encode" ? settings.studySeconds : settings.retentionSeconds;
    startTime.current = performance.now();
    setRemaining(seconds);
    const tick = setInterval(() => {
      const left = Math.max(
        0,
        seconds - (performance.now() - startTime.current) / 1000,
      );
      setRemaining(left);
      if (left === 0) {
        clearInterval(tick);
        if (phase === "encode") setPhase("delay");
        else {
          itemStart.current = performance.now();
          setPhase("recall");
        }
      }
    }, 100);
    return () => clearInterval(tick);
  }, [phase, trial]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && active) {
        invalidRef.current = true;
        setInvalid(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active]);
  function begin(t) {
    const prediction = t.transfer
      ? null
      : Object.freeze({
          ...predictTrial(fitLearner(trials, difficultyLevel(t)), t.condition),
          issuedAt: new Date().toISOString(),
          provenance: "live",
        });
    const supervisedPrediction =
      taskModel && !t.transfer
        ? inferTaskModel(taskModel, trials, t.condition, difficultyLevel(t))
        : null;
    setTrial({
      ...t,
      prediction,
      supervisedPrediction: supervisedPrediction
        ? { ...supervisedPrediction, issuedAt: new Date().toISOString() }
        : null,
    });
    setDistractionAnswers([]);
    distractionRef.current = [];
    setPrompt(0);
    setAnswers([]);
    setInvalid(false);
    invalidRef.current = false;
    setRemaining(8);
    setPhase("encode");
    setLast(null);
    setPage("experiment");
    requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const bounds = stage.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight)
        stage.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }
  function startPair() {
    if (trials.length > 498) {
      flash(
        "Export and clear this session before starting another comparison.",
      );
      return;
    }
    const pairId = Math.max(0, ...trials.map((t) => t.pairId)) + 1;
    const pair = makePair(freshSeed(), next.condition, pairId, {
      difficultyLevel: upcomingLevel,
      selection: difficultyChoice === "auto" ? "adaptive" : "manual",
      reference: difficultyChoice === "auto" && progress.reference,
    });
    setPairPlan({
      condition: next.condition,
      uncertaintyReduction: next.uncertaintyReduction,
      pairId,
    });
    setQueue([pair[1]]);
    begin(pair[0]);
  }
  function startProbe() {
    if (trials.length >= 500) return;
    setPairPlan(null);
    setQueue([]);
    begin(makeTrial(freshSeed(), "quiet", { transfer: true, pairId: 0 }));
  }
  function choose(room) {
    if (phase !== "recall") return;
    const nextAnswers = [
      ...answers,
      { room, elapsedMs: Math.round(performance.now() - itemStart.current) },
    ];
    setAnswers(nextAnswers);
    if (prompt < trial.placements.length - 1) {
      setPrompt((p) => p + 1);
      itemStart.current = performance.now();
    } else {
      const record = {
        ...trial,
        answers: nextAnswers,
        distractionAnswers: validateDistraction(trial, distractionRef.current),
        correct: scoreAnswers(trial, nextAnswers),
        valid: !invalidRef.current,
        invalidReason: invalidRef.current
          ? "Task visibility interrupted during trial"
          : null,
        completedAt: new Date().toISOString(),
        source: "live",
      };
      setTrials((ts) => [...ts, record]);
      setResultLevel(difficultyLevel(record));
      setLast(record);
      setPhase("result");
    }
  }
  function abort() {
    setPairPlan(null);
    setQueue([]);
    setTrial(null);
    setPhase("ready");
    setLast(null);
    flash(
      "Current incomplete trial discarded. Earlier completed trials remain.",
    );
  }
  function continuePair() {
    const [t, ...rest] = queue;
    setQueue(rest);
    begin(t);
  }
  function clearSession() {
    setPairPlan(null);
    try {
      saved.replace([]);
      setUndo(trials);
    } catch (e) {
      flash(e.message);
      return;
    }
    setQueue([]);
    setTrial(null);
    setLast(null);
    setPhase("ready");
    flash(
      "New practice session started. Previous cloud sessions remain in History. Undo is available here.",
    );
  }
  async function loadFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 2000000) {
      flash("Choose a session JSON file smaller than 2 MB.");
      return;
    }
    try {
      const parsed = importSession(JSON.parse(await f.text()));
      setPairPlan(null);
      saved.replace(parsed);
      setUndo(trials);
      setTrial(null);
      setQueue([]);
      setLast(null);
      setPhase("ready");
      flash(`Imported ${parsed.length} trials; scores recomputed.`);
    } catch (err) {
      flash(err.message || "Could not read this session.");
    }
  }
  const forecast = useMemo(
    () =>
      phase !== "ready" && trial
        ? trial.prediction
        : predictTrial(
            fitLearner(trials, upcomingLevel),
            queue[0]?.condition || next.condition,
          ),
    [phase, trial, trials, upcomingLevel, queue, next.condition],
  );
  const distractionIndex =
    phase === "delay" && trial
      ? Math.min(
          Math.ceil(shownSettings.retentionSeconds / 3) - 1,
          Math.floor(
            Math.max(0, shownSettings.retentionSeconds - remaining) / 3,
          ),
        )
      : 0;
  function answerDistraction(answer) {
    if (
      phase !== "delay" ||
      !shownSettings.distraction ||
      distractionRef.current.some((a) => a.index === distractionIndex)
    )
      return;
    const elapsed = performance.now() - startTime.current;
    const index = Math.min(
      Math.ceil(shownSettings.retentionSeconds / 3) - 1,
      Math.floor(elapsed / 3000),
    );
    if (
      index !== distractionIndex ||
      elapsed >= shownSettings.retentionSeconds * 1000
    )
      return;
    const nextAnswers = [
      ...distractionRef.current,
      { index, answer, elapsedMs: Math.round(elapsed - index * 3000) },
    ];
    distractionRef.current = nextAnswers;
    setDistractionAnswers(nextAnswers);
  }
  const distracted =
    phase === "encode" &&
    trial?.condition === "interruptions" &&
    ((remaining < 6.6 && remaining > 5.3) ||
      (remaining < 3.9 && remaining > 2.6));
  if (!saved.ready)
    return (
      <div className="lab-app">
        <main className="lab-content">
          <p className="loading-results" role="status">
            Opening your results…
          </p>
        </main>
      </div>
    );
  return (
    <div className={`lab-app${active ? " is-playing" : ""}`}>
      <header className="site-header">
        <a
          className="lab-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (!active) setPage("experiment");
          }}
        >
          <BookOpen size={24} strokeWidth={1.6} />
          <span>Recall Fieldnotes</span>
        </a>
        <nav aria-label="Main navigation">
          {[
            ["experiment", "Practice"],
            ["evidence", "Results"],
            ["journal", "History"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={page === id ? "selected" : ""}
              aria-current={page === id ? "page" : undefined}
              disabled={active && page !== id}
              onClick={() => setPage(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="header-about" onClick={() => setMethods(true)}>
          About & methods <ArrowUpRight size={14} />
        </button>
        <AccountMenu saved={saved} active={active} />
      </header>
      <main className="lab-main">
        <div className="lab-content">
          <div className="lab-title-row">
            <div>
              <h1>
                {page === "experiment"
                  ? "Recall practice"
                  : page === "evidence"
                    ? "Your results."
                    : "Your history."}
              </h1>
              <p>
                {page === "experiment"
                  ? "Remember objects and their locations across short rounds."
                  : page === "evidence"
                    ? "See how your recall changes with time, interruptions, and cues."
                    : "Review your answers and pick up where you left off."}
              </p>
            </div>
            {trials.length > 0 && (
              <button
                className="lab-secondary"
                disabled={!trials.length}
                onClick={() => {
                  saveJSON(
                    "recall-fieldnotes-experiment-session.json",
                    sessionExport(trials),
                  );
                  flash(
                    "Results downloaded. Import the file from History to continue later.",
                  );
                }}
              >
                <Download size={15} /> Save results
              </button>
            )}
          </div>
          {valid.length > 0 && page !== "experiment" && (
            <div className="lab-metrics" aria-label="Your progress">
              <div>
                <span>Completed rounds</span>
                <strong>{valid.length}</strong>
              </div>
              <div>
                <span>Recall accuracy · mixed levels</span>
                <strong>
                  {Math.round(
                    (totalCorrect /
                      valid.reduce((s, t) => s + itemCount(t), 0)) *
                      100,
                  )}
                  %
                </strong>
              </div>
              <div>
                <span>Courtyard rounds</span>
                <strong>{probe.length}</strong>
              </div>
            </div>
          )}
          {page === "experiment" && (
            <>
              <div className="lab-studio-grid">
                <section className="lab-card experiment-stage" ref={stageRef}>
                  <div className="lab-card-head">
                    <div>
                      <h2>Object & place</h2>
                    </div>
                    {phase === "ready" ? (
                      <button className="lab-primary" onClick={startPair}>
                        Start practice <ArrowRight size={15} />
                      </button>
                    ) : (
                      <span className="lab-tag">
                        <span />
                        {trial
                          ? `Level ${shownLevel} · ${CONDITIONS[trial.condition].short}${trial.transfer ? " · courtyard" : ` · round ${trial.order + 1} of 2`}`
                          : "Ready"}
                      </span>
                    )}
                  </div>
                  <div className="difficulty-controls">
                    <div className="difficulty-picker">
                      <label htmlFor="practice-difficulty">Difficulty</label>
                      <select
                        id="practice-difficulty"
                        value={difficultyChoice}
                        disabled={active || queue.length > 0}
                        onChange={(e) => {
                          setDifficultyChoice(e.target.value);
                          setTrial(null);
                          setLast(null);
                          setPhase("ready");
                        }}
                      >
                        <option value="auto">
                          Automatic · Level {progress.nextLevel}
                        </option>
                        {DIFFICULTIES.map((d) => (
                          <option key={d.level} value={d.level}>
                            Level {d.level} · {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div
                      className="difficulty-facts"
                      aria-label="Round settings"
                    >
                      <span>
                        <Target size={14} />
                        {shownSettings.objectCount} objects
                      </span>
                      <span>
                        <Eye size={14} />
                        {shownSettings.studySeconds}s study
                      </span>
                      <span>
                        <Clock size={14} />
                        {shownSettings.retentionSeconds}s wait
                      </span>
                      {shownSettings.distraction && <span>Even/odd task</span>}
                      {(trial?.reference ||
                        (!trial &&
                          difficultyChoice === "auto" &&
                          progress.reference)) && <span>Reference round</span>}
                    </div>
                  </div>
                  <div
                    className="stage-instructions"
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className={`phase-symbol ${phase === "recall" ? "purple" : ""}`}
                    >
                      {phase === "encode" ? (
                        <Eye size={18} />
                      ) : phase === "delay" ? (
                        <Clock size={18} />
                      ) : phase === "result" ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <MapPin size={18} />
                      )}
                    </span>
                    <div>
                      <strong>
                        {phase === "ready"
                          ? "Study, wait, then recall"
                          : phase === "encode"
                            ? `Study the ${shownSettings.objectCount} object locations.`
                            : phase === "delay"
                              ? "Hold the locations in mind."
                              : phase === "recall"
                                ? `Where was the ${trial.placements[prompt].object.toLowerCase()}?`
                                : `${last.correct} of ${itemCount(last)} locations recalled${last.valid ? "" : " · excluded"}`}
                      </strong>
                      <p>
                        {phase === "ready"
                          ? "Select Start practice when you’re ready."
                          : phase === "encode"
                            ? `Eight seconds of study${trial.condition === "interruptions" ? " with irrelevant visual notifications" : ""}.`
                            : phase === "delay"
                              ? `Recall begins after ${shownSettings.retentionSeconds} seconds.${shownSettings.distraction ? " Answer even or odd while waiting." : ""}`
                              : phase === "recall"
                                ? `Select a room · object ${prompt + 1} of ${shownSettings.objectCount}${trial.condition === "cues" ? " · three candidate rooms" : ""}`
                                : last.valid
                                  ? "Your answers and response times are recorded in History."
                                  : "Task visibility was interrupted. This result will not update the model."}
                      </p>
                    </div>
                    {(phase === "encode" || phase === "delay") && (
                      <div className="trial-clock">
                        {Math.ceil(remaining)}
                        <small>SEC</small>
                      </div>
                    )}
                    {phase === "recall" && (
                      <div className="recall-object">
                        <ObjectIcon
                          name={trial.placements[prompt].object}
                          size={24}
                        />
                      </div>
                    )}
                  </div>
                  <div className="plan-shell">
                    <Floorplan
                      trial={trial}
                      phase={phase}
                      onChoose={choose}
                      prompt={prompt}
                      objectCount={shownSettings.objectCount}
                    />
                    {phase === "delay" && (
                      <div className="delay-cover" role="status">
                        {shownSettings.distraction ? (
                          <div className="retention-task">
                            <h3>Is this number even or odd?</h3>
                            <strong
                              className="distraction-number"
                              aria-live="polite"
                            >
                              {distractionNumber(trial.seed, distractionIndex)}
                            </strong>
                            <div>
                              {["even", "odd"].map((answer) => (
                                <button
                                  key={answer}
                                  className="lab-secondary"
                                  onClick={() => answerDistraction(answer)}
                                  disabled={distractionAnswers.some(
                                    (a) => a.index === distractionIndex,
                                  )}
                                >
                                  {answer === "even" ? "Even" : "Odd"}
                                </button>
                              ))}
                            </div>
                            <p role="status">
                              {distractionAnswers.some(
                                (a) => a.index === distractionIndex,
                              )
                                ? "Answer recorded. Wait for the next number."
                                : "A new number appears every three seconds."}
                            </p>
                            <small>
                              Your object-location recall begins automatically.
                            </small>
                          </div>
                        ) : (
                          <>
                            <span className="delay-rings">
                              <Clock size={25} />
                            </span>
                            <strong>Hold the locations in mind</strong>
                            <p>Recall will begin automatically.</p>
                          </>
                        )}
                      </div>
                    )}
                    {distracted && (
                      <div className="interruption" role="status">
                        <Bell size={20} />
                        <div>
                          <strong>A delivery is at the door.</strong>
                          <span>Irrelevant notification · keep studying</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {invalid && active && (
                    <p className="excluded-notice">
                      <Info size={14} /> Visibility interruption detected. This
                      trial will be excluded; finish for practice or discard it.
                    </p>
                  )}
                  {phase === "result" &&
                    difficultySettings(difficultyLevel(last)).distraction && (
                      <p className="distraction-summary">
                        Even/odd task:{" "}
                        {
                          last.distractionAnswers.filter((a) => a.correct)
                            .length
                        }{" "}
                        correct from {last.distractionAnswers.length} answers ·{" "}
                        {Math.ceil(last.settings.retentionSeconds / 3)} numbers
                        presented. Unanswered numbers are recorded as missed.
                      </p>
                    )}
                  {phase === "result" && (
                    <div className="trial-feedback">
                      {last.placements.map((p, i) => (
                        <span
                          key={p.object}
                          className={
                            last.answers[i].room === p.room
                              ? "correct"
                              : "incorrect"
                          }
                        >
                          <ObjectIcon name={p.object} size={14} />
                          {p.object}
                          <b>{(last.transfer ? courtyard : ROOMS)[p.room]}</b>
                          {last.answers[i].room === p.room ? (
                            <Check size={13} />
                          ) : (
                            <X size={13} />
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="stage-controls">
                    <span>
                      <i
                        className={`step-dot ${phase === "encode" ? "current" : ""}`}
                      />
                      Study <ChevronRight size={11} />
                      <i
                        className={`step-dot ${phase === "delay" ? "current" : ""}`}
                      />
                      Wait <ChevronRight size={11} />
                      <i
                        className={`step-dot ${phase === "recall" ? "current" : ""}`}
                      />
                      Recall <ChevronRight size={11} />
                      <i
                        className={`step-dot ${phase === "result" ? "current" : ""}`}
                      />
                      Review
                    </span>
                    {active ? (
                      <button className="lab-secondary" onClick={abort}>
                        <X size={14} /> Stop round
                      </button>
                    ) : queue.length ? (
                      <button className="lab-primary" onClick={continuePair}>
                        Next round <ArrowRight size={15} />
                      </button>
                    ) : phase !== "ready" ? (
                      <button className="lab-primary" onClick={startPair}>
                        <Play size={14} />
                        Practice again
                      </button>
                    ) : null}
                  </div>
                </section>
                <aside className="lab-card next-card">
                  <div className="lab-card-head">
                    <div>
                      <h2>
                        {active && trial?.transfer
                          ? "Courtyard recall"
                          : queue.length || active
                            ? "This comparison"
                            : "Next comparison"}
                      </h2>
                    </div>
                    <GitBranch size={18} />
                  </div>
                  <div className="next-contrast">
                    <div>
                      <h3>
                        {active && trial?.transfer ? (
                          <>
                            Apartment <small>→</small>
                            <br />
                            Courtyard
                          </>
                        ) : (
                          <>
                            Quiet recall <small>vs.</small>
                            <br />
                            {
                              CONDITIONS[
                                (active || queue.length) && pairPlan
                                  ? pairPlan.condition
                                  : next.condition
                              ].name
                            }
                          </>
                        )}
                      </h3>
                    </div>
                  </div>
                  <p className="next-description">
                    {active && trial?.transfer
                      ? "This alternate layout does not update the hypotheses. Compare it separately with apartment observations."
                      : active || queue.length
                        ? `Two rounds at level ${shownLevel}, with one changed condition.`
                        : "Two rounds at the same level, with one changed condition. The order is randomized."}
                  </p>
                  <details className="prediction-details">
                    <summary>
                      Recall estimates <ChevronRight size={15} />
                    </summary>
                    <ForecastCard
                      prediction={forecast}
                      result={phase === "result" ? last : null}
                      locked={phase !== "ready" && Boolean(trial)}
                    />
                    {taskModel && (
                      <SupervisedForecast
                        model={taskModel}
                        prediction={trial?.supervisedPrediction}
                        result={phase === "result" ? last : null}
                        active={active}
                        onManage={() => setMethods(true)}
                      />
                    )}
                  </details>
                  <details className="practice-settings-details">
                    <summary>
                      Difficulty & progression <ChevronRight size={15} />
                    </summary>
                    <p>
                      {difficultyChoice === "auto"
                        ? "Two completed comparisons at 80% or above raise the level. A comparison at 40% or below lowers it. Every fourth automatic comparison returns to level one as a reference."
                        : "This level is chosen manually. Valid rounds update recall estimates at this level and do not change automatic progression."}
                    </p>
                    <p>
                      The longer-delay comparison adds six seconds to the base
                      wait. Level four includes even/odd questions during
                      retention.
                    </p>
                  </details>
                  <details className="scheduler-details">
                    <summary>
                      How rounds are chosen <ChevronRight size={13} />
                    </summary>
                    {next.candidates.map((c) => (
                      <div key={c.condition}>
                        <span>{CONDITIONS[c.condition].short}</span>
                        <b>
                          Interval {Math.round(c.prediction.interval.low * 100)}
                          –{Math.round(c.prediction.interval.high * 100)}%
                        </b>
                        <small>{c.count} valid trials</small>
                      </div>
                    ))}
                    <p>
                      The scheduler selects the greatest expected reduction in
                      learned recall-rate variance, while preserving condition
                      coverage. It does not select tasks from the fixed
                      hypothesis weights.
                    </p>
                  </details>
                  <div className="probe-callout">
                    <Search size={20} />
                    <div>
                      <strong>Try a different setting</strong>
                      <p>Repeat the recall task in a courtyard layout.</p>
                      <button
                        disabled={
                          active || queue.length > 0 || valid.length < 2
                        }
                        onClick={startProbe}
                      >
                        Try the courtyard <ArrowUpRight size={13} />
                      </button>
                      {valid.length < 2 && (
                        <small>Available after two completed rounds</small>
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}
          {page === "evidence" && (
            <>
              <section className="lab-card observed-card">
                <div className="lab-card-head">
                  <div>
                    <h2>Recall by condition</h2>
                    <label className="results-level">
                      Difficulty level{" "}
                      <select
                        value={resultLevel}
                        onChange={(e) => setResultLevel(Number(e.target.value))}
                      >
                        {DIFFICULTIES.map((d) => (
                          <option key={d.level} value={d.level}>
                            Level {d.level} · {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="condition-bars">
                  {stats.map((s) => (
                    <div className="condition-row" key={s.id}>
                      <div>
                        <strong>{s.name}</strong>
                        <span>
                          {s.total
                            ? `${s.correct}/${s.total} items`
                            : "No rounds yet"}
                        </span>
                      </div>
                      <div className="accuracy-track">
                        {s.total > 0 && (
                          <>
                            <span
                              className="accuracy-fill"
                              style={{ width: `${s.accuracy * 100}%` }}
                            />
                            <span
                              className="accuracy-interval"
                              style={{
                                left: `${s.low * 100}%`,
                                width: `${(s.high - s.low) * 100}%`,
                              }}
                            />
                            <i style={{ left: `${s.accuracy * 100}%` }} />
                          </>
                        )}
                      </div>
                      <small>
                        {s.trials} {s.trials === 1 ? "round" : "rounds"}
                        {s.total > 0
                          ? ` · ${Math.round(s.accuracy * 100)}% · interval ${Math.round(s.low * 100)}–${Math.round(s.high * 100)}%`
                          : ""}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="lab-card-note">
                  Lines show approximate uncertainty. Repeated practice, task
                  order, and related answers can affect these results.{" "}
                  <button className="lab-text" onClick={() => setMethods(true)}>
                    Measurement notes
                  </button>
                </p>
                <div className="unresolved">
                  <div>
                    <strong>Build a fuller picture</strong>
                    <p>
                      Try several comparisons. A single round can be affected by
                      the route, practice, or a moment of distraction.
                    </p>
                  </div>
                </div>
              </section>
              <details className="advanced-panel">
                <summary>
                  Recall estimates & prediction checks{" "}
                  <ChevronRight size={17} />
                </summary>
                <PersonalLearner
                  state={personalState}
                  evaluation={evaluation}
                  onMethods={() => setMethods(true)}
                />
              </details>
              <details className="advanced-panel">
                <summary>
                  Research comparisons <ChevronRight size={17} />
                </summary>
                <section className="lab-card hypothesis-strip">
                  <div className="lab-card-head">
                    <div>
                      <h2>
                        {adequate
                          ? `Working hypothesis: ${HYPOTHESES[leader].name.toLowerCase()}`
                          : "Fixed hypothesis comparison"}
                      </h2>
                    </div>
                    <button
                      className="lab-text"
                      disabled={active}
                      onClick={() => setMethods(true)}
                    >
                      Model assumptions <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="hypothesis-mini-grid">
                    {HYPOTHESES.map((h, i) => (
                      <div key={h.id}>
                        <span>
                          H{i + 1}
                          <strong>{Math.round(post.mass[i] * 100)}%</strong>
                        </span>
                        <h3>{h.name}</h3>
                        <div className="posterior-track">
                          <i style={{ width: `${post.mass[i] * 100}%` }} />
                        </div>
                        <p>
                          {valid.length
                            ? "Relative model weight"
                            : "Equal prior · no observations"}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="lab-card-note">
                    <Info size={13} /> Relative weights compare the four
                    hypotheses using the assumptions in Methods.
                  </p>
                </section>
                <section className="lab-card graph-card">
                  <div className="lab-card-head">
                    <div>
                      <h2>Separate hypothesis comparison</h2>
                    </div>
                  </div>
                  <EvidenceGraph trials={trials} mass={post.mass} />
                  <p className="lab-card-note">
                    <Info size={13} /> Links show how recorded answers enter the
                    model comparison.
                  </p>
                </section>
                <div className="research-comparisons">
                  <section className="lab-card hypotheses-list">
                    <div className="lab-card-head">
                      <div>
                        <h2>Fixed comparison hypotheses · level one only</h2>
                      </div>
                    </div>
                    {HYPOTHESES.map((h, i) => (
                      <article key={h.id}>
                        <div className="hypothesis-title">
                          <span>H{i + 1}</span>
                          <h3>{h.name}</h3>
                          <strong>{(post.mass[i] * 100).toFixed(1)}%</strong>
                        </div>
                        <p>{h.description}</p>
                        <div className="posterior-track">
                          <i style={{ width: `${post.mass[i] * 100}%` }} />
                        </div>
                        <small>
                          Assumption: {h.effect}. Prior weight: 25%.
                        </small>
                      </article>
                    ))}
                    <p className="lab-card-note">
                      Baseline ability is marginalized over 45%, 65% and 85%
                      item success. These are fixed illustrative likelihoods.
                    </p>
                  </section>
                </div>
              </details>
              <section className="lab-card transfer-card">
                <div className="lab-card-head">
                  <div>
                    <h2>Courtyard recall</h2>
                  </div>
                  <span className="lab-tag lavender">
                    Separate from recall estimates
                  </span>
                </div>
                {probe.length ? (
                  <div className="probe-results">
                    {probe.map((p, i) => (
                      <div key={i}>
                        <span>Courtyard probe {i + 1}</span>
                        <strong>
                          {p.correct}/{itemCount(p)}
                        </strong>
                        <small>
                          {i === 0
                            ? "First alternate-layout exposure"
                            : "Repeated alternate-layout exposure"}{" "}
                          · {p.source}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">
                    No courtyard rounds yet. Complete a comparison in Practice
                    to unlock the courtyard.
                  </p>
                )}
                <p className="lab-card-note">
                  The first probe uses an unfamiliar arrangement. Later probes
                  repeat the courtyard layout.
                </p>
              </section>
            </>
          )}
          {page === "journal" && (
            <>
              <SavedResults saved={saved} active={active} />
              <section className="lab-card journal-card">
                <div className="lab-card-head">
                  <div>
                    <h2>
                      {trials.length
                        ? `${trials.length} recorded ${trials.length === 1 ? "round" : "rounds"}`
                        : "No rounds recorded"}
                    </h2>
                  </div>
                  <div className="journal-buttons">
                    <button
                      className="lab-secondary"
                      disabled={active}
                      onClick={() => fileRef.current.click()}
                    >
                      <Upload size={14} /> Open saved results
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={loadFile}
                      hidden
                    />
                    <button
                      className="lab-secondary"
                      disabled={active || !trials.length}
                      onClick={clearSession}
                      aria-label="Start a new session"
                    >
                      <RotateCcw size={17} /> New session
                    </button>
                    {undo && (
                      <button
                        className="lab-text"
                        disabled={active}
                        onClick={() => {
                          try {
                            saved.replace(undo);
                          } catch (e) {
                            flash(e.message);
                            return;
                          }
                          setUndo(null);
                          flash("Previous session restored.");
                        }}
                      >
                        Undo replace
                      </button>
                    )}
                  </div>
                </div>
                {trials.length ? (
                  <div className="journal-scroll">
                    <table className="journal-table">
                      <thead>
                        <tr>
                          <th>Round</th>
                          <th>Condition / comparison</th>
                          <th>Recall / pre-trial forecast</th>
                          <th>Median response</th>
                          <th>Evidence status</th>
                          <th>Route</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trials.map((t, i) => {
                          const times = t.answers
                            .map((a) => a.elapsedMs)
                            .sort((a, b) => a - b);
                          return (
                            <tr key={i}>
                              <td>
                                <strong>
                                  {String(i + 1).padStart(2, "0")}
                                </strong>
                                <small>
                                  {new Date(t.completedAt).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}{" "}
                                  · {t.source}
                                </small>
                              </td>
                              <td>
                                {CONDITIONS[t.condition].name} · Level{" "}
                                {difficultyLevel(t)}
                                <small>
                                  {itemCount(t)} objects ·{" "}
                                  {
                                    difficultySettings(
                                      difficultyLevel(t),
                                      t.condition,
                                    ).retentionSeconds
                                  }
                                  s wait{t.reference ? " · reference" : ""}
                                </small>
                                <small>
                                  {t.transfer
                                    ? "Courtyard recall"
                                    : `Pair ${t.pairId} · position ${t.order + 1}`}
                                </small>
                              </td>
                              <td>
                                <strong>
                                  {t.correct}/{itemCount(t)}
                                </strong>
                                <small>
                                  {t.prediction
                                    ? `${t.prediction.expectedCorrect.toFixed(1)}/${itemCount(t)} expected · ${t.prediction.provenance === "live" ? "recorded forecast" : "reconstructed"}`
                                    : "Separate probe"}
                                </small>
                              </td>
                              <td>
                                {(
                                  times[Math.floor(times.length / 2)] / 1000
                                ).toFixed(2)}
                                s
                              </td>
                              <td>
                                <span
                                  className={`journal-status ${!t.valid ? "excluded" : t.transfer ? "probe" : ""}`}
                                >
                                  {!t.valid
                                    ? "Excluded"
                                    : t.transfer
                                      ? "Separate probe"
                                      : "In model"}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="lab-text"
                                  onClick={() => setInspected(t)}
                                >
                                  Inspect <ArrowUpRight size={12} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="journal-empty">
                    <BookOpen size={35} />
                    <h3>Your history starts here</h3>
                    <p>
                      Finish a round to see your answers, timing, and object
                      locations here.
                    </p>
                    <button
                      className="lab-primary"
                      onClick={() => setPage("experiment")}
                    >
                      Go to practice <ArrowRight size={15} />
                    </button>
                  </div>
                )}
                <p className="lab-card-note">
                  <ShieldCheck size={14} /> Completed rounds save on this
                  device. Signed-in sessions also sync to your account. Imported
                  and restored records remain labeled; scores are recomputed.
                </p>
              </section>
            </>
          )}
          <footer className="lab-footer">
            <span>
              For practice and task research. Not a clinical assessment.
            </span>
            <button onClick={() => setMethods(true)}>
              How it works <ArrowUpRight size={13} />
            </button>
            <a href="/privacy">Privacy</a>
          </footer>
        </div>
      </main>
      {methods && <Methods close={() => setMethods(false)} />}{" "}
      {inspected && (
        <div className="lab-overlay">
          <section
            className="lab-modal route-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Recorded route inspection"
            ref={routeRef}
            tabIndex={-1}
          >
            <button
              className="lab-icon modal-x"
              onClick={() => setInspected(null)}
              aria-label="Close route inspection"
            >
              <X size={20} />
            </button>
            <h2>{CONDITIONS[inspected.condition].name}</h2>
            <p>
              Seed {inspected.seed} · {inspected.correct}/{itemCount(inspected)}{" "}
              correct · {inspected.source}
            </p>
            <Floorplan trial={inspected} phase="inspect" inspect prompt={0} />
            <div className="route-answers">
              {inspected.placements.map((p, i) => (
                <p key={p.object}>
                  <ObjectIcon name={p.object} size={15} />
                  <strong>{p.object}</strong>
                  <span>
                    Placed in {(inspected.transfer ? courtyard : ROOMS)[p.room]}
                    ; selected{" "}
                    {
                      (inspected.transfer ? courtyard : ROOMS)[
                        inspected.answers[i].room
                      ]
                    }
                    .
                  </span>
                </p>
              ))}
            </div>
            <button className="lab-primary" onClick={() => setInspected(null)}>
              Back to history
            </button>
          </section>
        </div>
      )}
      <div className={`lab-toast ${notice ? "show" : ""}`} role="status">
        {notice}
      </div>
    </div>
  );
}
