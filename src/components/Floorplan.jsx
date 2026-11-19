import React from "react";
import {
  KeyRound,
  Book,
  Coffee,
  Leaf,
  Camera,
  Compass,
  MapPin,
} from "lucide-react";
import { ROOMS, CONDITIONS } from "../experiment";

const icons = {
  Key: KeyRound,
  Book: Book,
  Mug: Coffee,
  Plant: Leaf,
  Camera: Camera,
  Compass: Compass,
};
export const courtyard = [
  "Fountain",
  "Greenhouse",
  "Pavilion",
  "Garden gate",
  "Reading bench",
  "Orchard",
];
export function ObjectIcon({ name, size = 20 }) {
  const Icon = icons[name] || MapPin;
  return <Icon size={size} strokeWidth={1.7} />;
}
export function Floorplan({ trial, phase, onChoose, prompt, inspect = false }) {
  const transfer = trial?.transfer;
  const labels = transfer ? courtyard : ROOMS;
  const order = transfer ? [2, 5, 1, 4, 0, 3] : [0, 1, 2, 3, 4, 5];
  const placementVisible = phase === "encode" || inspect;
  const candidates = trial?.placements[prompt]?.candidates;
  return (
    <div
      className={`apartment ${transfer ? "courtyard" : ""}`}
      data-phase={phase}
      aria-hidden={phase === "delay" || undefined}
      aria-label={transfer ? "Alternate courtyard layout" : "Apartment layout"}
    >
      <div className="plan-top">
        <span>{transfer ? "Courtyard" : "Apartment"}</span>
        <span>N ↑</span>
      </div>
      <div className="room-grid">
        {order.map((room) => {
          const item = placementVisible
            ? trial?.placements.find((p) => p.room === room)
            : null;
          const available =
            phase === "recall" &&
            (!CONDITIONS[trial.condition].cues || candidates.includes(room));
          return (
            <button
              key={room}
              className={`room room-${room} ${item ? "occupied" : ""} ${phase === "recall" && !available ? "room-muted" : ""}`}
              disabled={!available}
              onClick={() => onChoose(room)}
              aria-label={
                phase === "recall"
                  ? `Place ${trial.placements[prompt].object} in ${labels[room]}`
                  : `${labels[room]}${item ? `: ${item.object}` : ""}`
              }
            >
              <span className="room-label">{labels[room]}</span>
              {item && (
                <span className="placed-object">
                  <ObjectIcon name={item.object} />
                  <b>{item.object}</b>
                </span>
              )}
              {phase === "recall" && available && (
                <span className="place-here">
                  <MapPin size={17} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="plan-bottom">
        <span>
          {transfer
            ? "An alternate arrangement · first probe is unfamiliar"
            : "Three objects · six possible locations"}
        </span>
      </div>
    </div>
  );
}
