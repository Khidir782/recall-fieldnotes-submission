import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FlaskConical,
  Focus,
  Info,
  Layers,
  LayoutDashboard,
  Leaf,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { assess, simulate, networks, presets } from "./engine";
import "./style.css";
import { useDialog } from "./hooks/useDialog";
const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
function BrainMap() {
  const nodes = Array.from({ length: 78 }, (_, i) => {
    const angle = i * 2.39996,
      r = Math.sqrt((i + 0.5) / 78);
    return [180 + Math.cos(angle) * r * 132, 150 + Math.sin(angle) * r * 112];
  });
  return (
    <svg
      viewBox="0 0 360 300"
      className="brain-map"
      role="img"
      aria-label="Decorative brain network illustration, not a subject scan"
    >
      <defs>
        <clipPath id="brainclip">
          <path d="M174 43C139 16 108 30 94 54C52 51 35 87 43 118C13 144 27 178 46 191C39 228 77 254 105 246C122 275 157 267 175 248L185 248C203 267 238 275 255 246C283 254 321 228 314 191C333 178 347 144 317 118C325 87 308 51 266 54C252 30 221 16 186 43Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#brainclip)">
        <path
          d="M174 43C139 16 108 30 94 54C52 51 35 87 43 118C13 144 27 178 46 191C39 228 77 254 105 246C122 275 157 267 175 248L185 248C203 267 238 275 255 246C283 254 321 228 314 191C333 178 347 144 317 118C325 87 308 51 266 54C252 30 221 16 186 43Z"
          fill="#cfdac5"
          fillOpacity=".32"
          stroke="#8da184"
          strokeWidth="1.4"
        />
        {nodes.flatMap((a, i) =>
          nodes
            .slice(i + 1)
            .map((b, j) =>
              (i * 7 + j * 11) % 17 === 0 ? (
                <path
                  key={`${i}-${j}`}
                  d={`M${a} Q180 ${80 + (i % 7) * 20} ${b}`}
                  fill="none"
                  stroke={(i + j) % 4 === 0 ? "#8479b2" : "#92a78a"}
                  strokeOpacity=".28"
                  strokeWidth=".7"
                />
              ) : null,
            ),
        )}
        {nodes.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i % 7 === 0 ? 3.7 : 1.8}
            fill={i % 7 === 0 ? "#7e70a1" : "#6b8b65"}
            opacity={i % 7 === 0 ? 0.9 : 0.6}
          />
        ))}
        <path
          d="M180 35Q164 85 180 123Q195 172 180 255"
          fill="none"
          stroke="#a5b499"
          strokeDasharray="3 4"
        />
      </g>
      <circle
        cx="257"
        cy="109"
        r="8"
        stroke="#83769d"
        fill="none"
        opacity=".5"
      />
      <circle cx="257" cy="109" r="3.5" fill="#83769d" />
    </svg>
  );
}
function Gauge({ score }) {
  let angle = Math.PI * (1 - score / 100),
    x = 160 + 122 * Math.cos(angle),
    y = 150 - 122 * Math.sin(angle);
  return (
    <div className="gauge-wrap">
      <svg
        viewBox="0 0 320 190"
        role="img"
        aria-label={`Synthetic vulnerability spectrum ${score.toFixed(1)} of 100; lower is more resilient`}
      >
        <defs>
          <linearGradient id="spectrum">
            <stop stopColor="#8ea88b" />
            <stop offset=".48" stopColor="#dfd29e" />
            <stop offset="1" stopColor="#bd99a6" />
          </linearGradient>
        </defs>
        <path
          d="M38 150 A122 122 0 0 1 282 150"
          stroke="#eee"
          strokeWidth="16"
          fill="none"
        />
        <path
          d="M38 150 A122 122 0 0 1 282 150"
          stroke="url(#spectrum)"
          strokeWidth="16"
          strokeLinecap="round"
          fill="none"
        />
        {[0, 25, 50, 75, 100].map((v) => {
          const a = Math.PI * (1 - v / 100);
          return (
            <text
              key={v}
              x={160 + 145 * Math.cos(a)}
              y={151 - 145 * Math.sin(a)}
              textAnchor="middle"
              fontSize="12"
              fill="#526149"
            >
              {v}
            </text>
          );
        })}
        <circle
          cx={x}
          cy={y}
          r="8"
          fill="#344937"
          stroke="#fff"
          strokeWidth="3"
        />
        <text x="160" y="121" textAnchor="middle" className="gauge-number">
          {score.toFixed(1)}
        </text>
        <text x="160" y="145" textAnchor="middle" fill="#526149" fontSize="12">
          SYNTHETIC SPECTRUM SCORE
        </text>
        <text x="30" y="181" fontSize="12" fill="#526149">
          Resilience-like
        </text>
        <text x="290" y="181" textAnchor="end" fontSize="12" fill="#526149">
          Vulnerability-like
        </text>
      </svg>
    </div>
  );
}
function Modal({ close }) {
  const ref = useDialog(true, close);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="science-title"
        tabIndex={-1}
        ref={ref}
      >
        <button
          className="icon-button modal-close"
          aria-label="Close scientific attribution"
          onClick={close}
        >
          <X />
        </button>
        <h2 id="science-title">
          Scientific attribution
          <br />& responsible AI
        </h2>
        <p>
          This archived sandbox illustrates a fictional weighted-score model. It
          is separate from the recall-task model and is not a medical device.
        </p>
        <article>
          <h3>Data provenance</h3>
          <p>
            Every subject and network value in this sandbox is synthetic. No
            participant records, scans, or trained model weights are included.
            The recall-task model uses separately exported task responses and
            requires no external brain-imaging dataset.
          </p>
        </article>
        <article>
          <h3>Transparent assumptions & bias</h3>
          <p>
            The score is a weighted average of five fictional disruption
            indices. Bars are exact additive contributions against a 50-point
            reference, not a trained SHAP explanation. Bands are arbitrary demo
            thresholds. The simulation assumes +6 points/year drift and a
            dose-scaled offset of 12 points/year; these are invented, not
            treatment effects.
          </p>
          <p>
            No clinical accuracy, calibration, demographic fairness, or external
            validation has been established. Do not use the output for
            diagnosis, triage decisions, or prescriptions. The drill is a memory
            exercise, not a cognitive test or proven therapy.
          </p>
        </article>
        <article>
          <h3>Privacy architecture</h3>
          <p>
            By default, calculations and game state stay in this browser tab and
            reset on reload. No analytics, account records, or persistent
            subject storage are added. The host can process ordinary request
            metadata. If VITE_API_URL is configured, network slider values and
            simulator settings are sent to that API. The local API has no
            database, uploads, or application-level payload logging; production
            security and infrastructure log review remain required.
          </p>
        </article>
        <button className="primary" onClick={close}>
          Back to the workspace <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
function MemoryGame() {
  const [phase, setPhase] = useState("idle"),
    [level, setLevel] = useState(3),
    [seq, setSeq] = useState([]),
    [lit, setLit] = useState(-1),
    [index, setIndex] = useState(0),
    [rounds, setRounds] = useState(0),
    [wins, setWins] = useState(0);
  const timers = useRef([]);
  function clear() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  useEffect(() => () => clear(), []);
  function start() {
    clear();
    const a = Array.from({ length: level }, () =>
      Math.floor(Math.random() * 9),
    );
    setSeq(a);
    setIndex(0);
    setLit(-1);
    setPhase("watch");
    a.forEach((tile, i) => {
      timers.current.push(setTimeout(() => setLit(tile), 600 + i * 1000));
      timers.current.push(setTimeout(() => setLit(-1), 1250 + i * 1000));
    });
    timers.current.push(
      setTimeout(() => setPhase("recall"), 600 + a.length * 1000),
    );
  }
  function choose(i) {
    if (phase !== "recall") return;
    if (i !== seq[index]) {
      setPhase("miss");
      setRounds((r) => r + 1);
      setLevel((l) => Math.max(2, l - 1));
      return;
    }
    setLit(i);
    timers.current.push(setTimeout(() => setLit(-1), 180));
    if (index === seq.length - 1) {
      setWins((w) => w + 1);
      setRounds((r) => r + 1);
      setPhase("success");
      setLevel((l) => Math.min(7, l + 1));
    } else setIndex((n) => n + 1);
  }
  function reset() {
    clear();
    setPhase("idle");
    setLit(-1);
    setLevel(3);
    setRounds(0);
    setWins(0);
    setIndex(0);
  }
  const text = {
    idle: "Remember a route. Retrace your steps.",
    watch: "Watch the highlighted spaces in order.",
    recall: `Your turn · ${index} of ${seq.length} recalled`,
    success: "Route remembered. Ready for a longer one?",
    miss: "A different route this time. Try a shorter sequence.",
  };
  return (
    <div className="game-content">
      <div className="game-description">
        <span className="tag lavender">SPATIAL MEMORY</span>
        <h3>Spatial sequence recall</h3>
        <p>
          Watch a sequence of spaces light up, then select them in the same
          order. The route adapts after each round.
        </p>
        <div className="game-stats">
          <div>
            <strong>{level}</strong>
            <span>Next route length</span>
          </div>
          <div>
            <strong>
              {wins}/{rounds}
            </strong>
            <span>Routes recalled</span>
          </div>
        </div>
        <small>Sequence length adjusts after each round.</small>
      </div>
      <div className="game-board">
        <p role="status" aria-live="polite">
          {text[phase]}
        </p>
        <div className="tiles">
          {Array.from({ length: 9 }, (_, i) => (
            <button
              key={i}
              className={`tile ${lit === i ? "lit" : ""}`}
              disabled={phase !== "recall"}
              onClick={() => choose(i)}
              aria-label={`Space ${i + 1}${lit === i ? ", highlighted" : ""}`}
            >
              <span>{i + 1}</span>
              {lit === i && <div className="tile-dot" />}
            </button>
          ))}
        </div>
        <div className="game-actions">
          <button
            className="primary"
            onClick={start}
            disabled={phase === "watch" || phase === "recall"}
          >
            <Play size={14} />
            {phase === "idle" ? "Begin practice" : "Next round"}
          </button>
          <button
            className="icon-button"
            onClick={reset}
            aria-label="Reset memory practice"
          >
            <RotateCcw size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
function Chart({ data }) {
  const all = data.points.flatMap((p) => [p.baseline, p.practice]);
  const min = Math.max(0, Math.floor((Math.min(...all) - 5) / 5) * 5),
    max = Math.min(100, Math.ceil((Math.max(...all) + 5) / 5) * 5);
  const y = (v) => 180 - ((v - min) / (max - min)) * 140;
  const path = (key) =>
    data.points
      .map((p, i) => `${i ? "L" : "M"}${50 + i * 40} ${y(p[key])}`)
      .join(" ");
  return (
    <>
      <svg
        className="trend-chart"
        viewBox="0 0 560 225"
        role="img"
        aria-label="Hypothetical twelve month score trajectories, not a clinical prediction"
      >
        {Array.from({ length: 5 }, (_, i) => {
          const v = min + ((max - min) * i) / 4;
          return (
            <g key={i}>
              <line x1="50" x2="530" y1={y(v)} y2={y(v)} stroke="#e9ece4" />
              <text
                x="35"
                y={y(v) + 4}
                textAnchor="end"
                fill="#526149"
                fontSize="12"
              >
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        <path
          d={path("baseline")}
          fill="none"
          stroke="#b4a3b8"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        <path
          d={path("practice")}
          fill="none"
          stroke="#658564"
          strokeWidth="3"
        />
        {[0, 3, 6, 9, 12].map((m) => (
          <text
            key={m}
            x={50 + m * 40}
            y="209"
            textAnchor="middle"
            fill="#526149"
            fontSize="12"
          >
            {m === 0 ? "Today" : `Month ${m}`}
          </text>
        ))}
      </svg>
      <details className="data-details">
        <summary>View simulation values</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Assumed baseline</th>
                <th>Practice scenario</th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((p) => (
                <tr key={p.month}>
                  <td>{p.month}</td>
                  <td>{p.baseline}</td>
                  <td>{p.practice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
function App() {
  const [tab, setTab] = useState("clinical"),
    [subject, setSubject] = useState("SYN-002"),
    [values, setValues] = useState([...presets[1].values]),
    [modal, setModal] = useState(false),
    [adherence, setAdherence] = useState(80),
    [minutes, setMinutes] = useState(15),
    [result, setResult] = useState(assess(values)),
    [projection, setProjection] = useState(
      simulate(values, adherence, minutes),
    ),
    [service, setService] = useState(
      API ? "Connecting to API" : "Browser demo engine",
    ),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const localResult = assess(values),
      localProjection = simulate(values, adherence, minutes);
    setResult(localResult);
    setProjection(localProjection);
    if (!API) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const responses = await Promise.all([
          fetch(`${API}/assess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ values }),
            signal: ctrl.signal,
          }),
          fetch(`${API}/simulate-intervention`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ values, adherence, minutes }),
            signal: ctrl.signal,
          }),
        ]);
        if (responses.some((r) => !r.ok)) throw Error("API error");
        const [a, s] = await Promise.all(responses.map((r) => r.json()));
        if (ctrl.signal.aborted) return;
        if (
          !Number.isFinite(a.score) ||
          !Array.isArray(a.contributions) ||
          !Array.isArray(s.points)
        )
          throw Error("Invalid response");
        setResult(a);
        setProjection(s);
        setService("Connected · Python API");
      } catch (e) {
        if (e.name !== "AbortError")
          setService("API unavailable · browser fallback");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [values, adherence, minutes]);
  function chooseSubject(id) {
    setSubject(id);
    if (id !== "custom")
      setValues([...presets.find((p) => p.id === id).values]);
  }
  function update(i, v) {
    setSubject("custom");
    setValues((old) => old.map((n, j) => (i === j ? v : n)));
  }
  function exportReport() {
    const payload = {
      title: "Recall Fieldnotes synthetic demonstration",
      created_at: new Date().toISOString(),
      subject,
      source: "synthetic",
      engine: service,
      values,
      assessment: result,
      simulation: { adherence, minutes, ...projection },
      disclaimer:
        "Not a diagnosis, validated clinical score, treatment recommendation, or predicted benefit.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `recall-fieldnotes-${subject.toLowerCase()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Demo report downloaded");
    setTimeout(() => setNotice(""), 3000);
  }
  const band =
    result.score < 40
      ? "Lower vulnerability"
      : result.score < 65
        ? "Intermediate pattern"
        : "Elevated vulnerability";
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("clinical");
          }}
        >
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          <span className="brand-word">
            <span>Recall</span>
            <span>Fieldnotes</span>
          </span>
        </a>
        <div className="workspace-label">RESEARCH WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={tab === "clinical" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("clinical")}
          >
            <LayoutDashboard size={18} /> Clinician overview{" "}
            <ChevronRight size={14} />
          </button>
          <button
            className={tab === "copilot" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("copilot")}
          >
            <Sparkles size={18} /> Neuroplasticity copilot{" "}
            <ChevronRight size={14} />
          </button>
        </nav>
        <div className="sidebar-divider" />
        <button className="nav-item science-nav" onClick={() => setModal(true)}>
          <BookOpen size={18} /> Science & responsibility
        </button>
        <div className="sidebar-bottom">
          <div className="research-card">
            <FlaskConical size={20} />
            <strong>Network research sandbox</strong>
            <p>Explore synthetic network values and model assumptions.</p>
            <span>RESEARCH DEMO · v0.1</span>
          </div>
          <div className="workspace-user">
            <span className="avatar">R</span>
            <div>
              <strong>Task research</strong>
              <small>Private demo workspace</small>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={12} />
            <span>
              {tab === "clinical"
                ? "Clinician overview"
                : "Neuroplasticity copilot"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="demo-dot" /> Synthetic data only{" "}
            <span className="topbar-separator" />
            <button
              onClick={() => setModal(true)}
              className="icon-button"
              aria-label="About this research demo"
            >
              <Info size={18} />
            </button>
          </div>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <h1>
                {tab === "clinical"
                  ? "Synthetic network assessment"
                  : "Memory practice and simulation"}
              </h1>
              <p>
                {tab === "clinical"
                  ? "Explore how network inputs contribute to the synthetic score."
                  : "Explore cognitive practice and the assumptions behind a possible trajectory."}
              </p>
            </div>
            <button className="secondary export" onClick={exportReport}>
              <Download size={15} /> Export demo report
            </button>
          </div>
          <div className="disclaimer">
            <FlaskConical size={16} />
            <p>
              <strong>Research demonstration.</strong> Synthetic subjects and
              illustrative scores. Not for diagnosis or clinical decisions.
            </p>
            <button onClick={() => setModal(true)}>
              Our approach <ArrowUpRight size={14} />
            </button>
          </div>
          <section className="subject-bar" aria-label="Subject selection">
            <div className="subject-symbol">
              <Focus size={22} />
            </div>
            <div>
              <span className="field-label">ACTIVE DEMO SUBJECT</span>
              <div className="select-wrap">
                <select
                  aria-label="Select synthetic subject"
                  value={subject}
                  onChange={(e) => chooseSubject(e.target.value)}
                >
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.label}
                    </option>
                  ))}
                  <option value="custom">Custom · Your network pattern</option>
                </select>
                <ChevronDown size={13} />
              </div>
            </div>
            <span className="subject-divider" />
            <div className="subject-meta">
              <span className="field-label">AGE</span>
              <strong>
                {subject === "custom"
                  ? "—"
                  : presets.find((p) => p.id === subject).age}{" "}
                <small>years</small>
              </strong>
            </div>
            <div className="subject-meta">
              <span className="field-label">DATA SOURCE</span>
              <strong>
                {subject === "custom"
                  ? "Synthetic custom values"
                  : "Synthetic preset"}
              </strong>
            </div>
            <span className="tag source-tag">
              <span /> No patient data
            </span>
          </section>
          {tab === "clinical" ? (
            <>
              <div className="overview-grid">
                <section className="card spectrum-card">
                  <div className="card-heading">
                    <div>
                      <h2>Resilience–vulnerability spectrum</h2>
                    </div>
                    <span className="tiny-icon">
                      <Activity size={18} />
                    </span>
                  </div>
                  <div className="spectrum-inner">
                    <div className="gauge-section">
                      <Gauge score={result.score} />
                      <span
                        className={`band ${result.score >= 65 ? "rose" : ""}`}
                      >
                        {band}
                      </span>
                      <p>Lower scores indicate less synthetic vulnerability.</p>
                    </div>
                    <div className="brain-section">
                      <BrainMap />
                      <div className="brain-caption">
                        <span className="legend-dot" /> Illustrative functional
                        network
                      </div>
                    </div>
                  </div>
                  <div className="card-footer">
                    <Info size={14} />
                    <span>
                      A fictional 0–100 weighted index. Its values and
                      thresholds have no established clinical meaning.
                    </span>
                  </div>
                </section>
                <section className="card guardrail-card">
                  <div className="card-heading">
                    <div>
                      <h2>Research guardrails</h2>
                    </div>
                    <ShieldCheck size={19} />
                  </div>
                  <div className="guardrail">
                    <span className="check-circle">
                      <Check size={13} />
                    </span>
                    <div>
                      <strong>Visible model weights</strong>
                      <p>Every score comes from visible, fixed demo weights.</p>
                    </div>
                  </div>
                  <div className="guardrail">
                    <span className="check-circle">
                      <Check size={13} />
                    </span>
                    <div>
                      <strong>Interpretation</strong>
                      <p>Trace each score through its input contributions.</p>
                    </div>
                  </div>
                  <div className="guardrail">
                    <span className="check-circle">
                      <Check size={13} />
                    </span>
                    <div>
                      <strong>Validation status</strong>
                      <p>The synthetic inputs have no cohort calibration.</p>
                    </div>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setModal(true)}
                  >
                    Read the scientific boundaries <ArrowUpRight size={14} />
                  </button>
                </section>
              </div>
              <div className="detail-grid">
                <section className="card contribution-card">
                  <div className="card-heading">
                    <div>
                      <h2>What shapes this pattern?</h2>
                    </div>
                    <Layers size={18} />
                  </div>
                  <p className="card-description">
                    Exact additive contributions relative to a 50-point
                    reference.
                  </p>
                  <div className="contribution-chart">
                    <div className="bar-header">
                      <span>NETWORK</span>
                      <span>Lower ← → Higher</span>
                      <span>POINTS</span>
                    </div>
                    {result.contributions.map((c, i) => (
                      <div className="bar-row" key={c.network}>
                        <span>{c.network}</span>
                        <div className="bar-track">
                          <div className="bar-center" />
                          <div
                            className={`bar ${c.value < 0 ? "negative" : "positive"}`}
                            style={{
                              left:
                                c.value < 0
                                  ? `${50 - (Math.abs(c.value) / 15) * 47}%`
                                  : "50%",
                              width: `${(Math.abs(c.value) / 15) * 47}%`,
                            }}
                          />
                        </div>
                        <strong
                          className={c.value < 0 ? "green-text" : "purple-text"}
                        >
                          {c.value > 0 ? "+" : ""}
                          {c.value.toFixed(1)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-dot green" /> Lower index
                    </span>
                    <span>
                      <i className="legend-dot purple" /> Higher index
                    </span>
                    <span className="legend-note">
                      Reference 50 + contributions = {result.score.toFixed(1)}
                    </span>
                  </div>
                </section>
                <section className="card inputs-card">
                  <div className="card-heading">
                    <div>
                      <h2>Network sandbox</h2>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => chooseSubject("SYN-002")}
                      aria-label="Reset network values"
                    >
                      <RotateCcw size={15} />
                    </button>
                  </div>
                  <p className="card-description">
                    Adjust fictional disruption indices to see the score
                    respond.
                  </p>
                  {networks.map((n, i) => (
                    <label className="range-field" key={n}>
                      <span>
                        {n}
                        <output>{values[i]}</output>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={values[i]}
                        onChange={(e) => update(i, +e.target.value)}
                        style={{ "--range": `${values[i]}%` }}
                      />
                    </label>
                  ))}
                  <div className="input-endpoints">
                    <span>Less disruption</span>
                    <span>More disruption</span>
                  </div>
                </section>
              </div>
              <section className="copilot-banner">
                <div className="banner-icon">
                  <Sparkles size={25} />
                </div>
                <div>
                  <h3>Try the memory exercise</h3>
                  <p>
                    Try a spatial memory exercise and explore a hypothetical
                    12-month scenario.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setTab("copilot");
                    window.scrollTo(0, 0);
                  }}
                >
                  Open your copilot <ArrowRight size={16} />
                </button>
              </section>
            </>
          ) : (
            <>
              <section className="practice-intro">
                <div>
                  <h2>Spatial memory practice</h2>
                  <p>
                    Practice recalling spatial sequences, then explore a
                    hypothetical adherence scenario.
                  </p>
                </div>
                <div className="practice-pill">
                  <Target size={19} />
                  <div>
                    <strong>Spatial memory</strong>
                    <small>Adaptive · 2–7 spaces</small>
                  </div>
                </div>
              </section>
              <section className="card game-card">
                <div className="card-heading">
                  <div>
                    <h2>The memory path</h2>
                  </div>
                  <span className="tag">
                    <span /> Live interactive exercise
                  </span>
                </div>
                <MemoryGame />
              </section>
              <div className="simulation-grid">
                <section className="card simulation-card">
                  <div className="card-heading">
                    <div>
                      <h2>12-month scenario simulation</h2>
                    </div>
                    <span className="tag lavender">WHAT-IF MODEL</span>
                  </div>
                  <p className="card-description">
                    An illustration of assumptions, not a forecast of brain
                    health.
                  </p>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-dot green" /> Practice scenario
                    </span>
                    <span>
                      <i className="legend-dot purple" /> Assumed baseline
                    </span>
                  </div>
                  <Chart data={projection} />
                  <div className="simulation-assumption">
                    <Info size={14} />
                    <span>
                      Assumes +6 points/year drift and a 12-point dose-scaled
                      offset. Both are invented. Lower synthetic scores indicate
                      less vulnerability.
                    </span>
                  </div>
                </section>
                <section className="card scenario-card">
                  <div className="card-heading">
                    <div>
                      <h2>Your practice scenario</h2>
                    </div>
                    <Leaf size={18} />
                  </div>
                  <label className="range-field large-range">
                    <span>
                      Weekly adherence<output>{adherence}%</output>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={adherence}
                      onChange={(e) => setAdherence(+e.target.value)}
                      style={{ "--range": `${adherence}%` }}
                    />
                  </label>
                  <label className="range-field large-range">
                    <span>
                      Daily practice<output>{minutes} min</output>
                    </span>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      step="5"
                      value={minutes}
                      onChange={(e) => setMinutes(+e.target.value)}
                      style={{ "--range": `${((minutes - 5) / 25) * 100}%` }}
                    />
                  </label>
                  <div className="scenario-result">
                    <span>ILLUSTRATIVE GAP AT MONTH 12</span>
                    <strong>
                      <ArrowDownRight size={25} />
                      {projection.difference.toFixed(1)} <small>points</small>
                    </strong>
                    <p>
                      Difference between two toy scenarios. No proven benefit is
                      implied.
                    </p>
                  </div>
                </section>
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>
              <Brain size={14} /> Synthetic research workspace
            </span>
            <button onClick={() => setModal(true)}>
              Scientific attribution & responsible AI <ArrowUpRight size={13} />
            </button>
            <small>
              <span className="status-dot" />
              {service}
            </small>
          </footer>
        </div>
      </main>
      {modal && <Modal close={() => setModal(false)} />}
      <div className={`toast ${notice ? "visible" : ""}`} role="status">
        {notice && (
          <>
            <Check size={16} />
            {notice}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
