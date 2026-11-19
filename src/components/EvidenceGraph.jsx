import React from "react";
import { HYPOTHESES } from "../experiment";

export default function EvidenceGraph({ trials, mass }) {
  const valid = trials.filter((t) => t.valid && !t.transfer);
  return (
    <div
      className="evidence-graph-scroll"
      tabIndex={0}
      aria-label="Scrollable evidence flow"
    >
      <svg
        viewBox="0 0 820 220"
        className="evidence-graph"
        role="img"
        aria-label="Evidence graph connects observations through the explicit likelihood model to four competing hypotheses"
      >
        <defs>
          <linearGradient id="edge">
            <stop stopColor="#bdc1c6" />
            <stop offset="1" stopColor="#8ab4f8" />
          </linearGradient>
        </defs>
        {HYPOTHESES.map((h, i) => (
          <path
            key={h.id}
            d={`M400 110 C490 110 480 ${31 + i * 51} 560 ${31 + i * 51}`}
            stroke="url(#edge)"
            strokeWidth={1 + mass[i] * 5}
            fill="none"
            opacity=".7"
          />
        ))}
        {["Observed answers", "Condition & timing", "Validity checks"].map(
          (s, i) => (
            <g key={s}>
              <path
                d={`M235 ${44 + i * 66} C290 ${44 + i * 66} 280 110 325 110`}
                stroke="#bdc1c6"
                fill="none"
              />
              <rect
                x="25"
                y={24 + i * 66}
                width="210"
                height="40"
                rx="7"
                fill="#f8f9fa"
                stroke="#dadce0"
              />
              <text x="42" y={49 + i * 66} fontSize="12" fill="#3c4043">
                {s}
              </text>
            </g>
          ),
        )}
        <circle cx="365" cy="110" r="40" fill="#f1f3f4" stroke="#bdc1c6" />
        <text x="365" y="106" textAnchor="middle" fontSize="12" fill="#3c4043">
          {valid.length} trials
        </text>
        <text x="365" y="123" textAnchor="middle" fontSize="11" fill="#3c4043">
          fixed likelihood
        </text>
        {HYPOTHESES.map((h, i) => (
          <g key={h.id}>
            <rect
              x="560"
              y={11 + i * 51}
              width="240"
              height="40"
              rx="7"
              fill={i === 0 ? "#f8f9fa" : "#f8f9fa"}
              stroke={i === 0 ? "#dadce0" : "#dadce0"}
            />
            <text x="575" y={36 + i * 51} fontSize="11" fill="#3c4043">
              {h.name}
            </text>
            <text
              x="783"
              y={36 + i * 51}
              fontSize="11"
              textAnchor="end"
              fill="#3c4043"
            >
              {Math.round(mass[i] * 100)}%
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
