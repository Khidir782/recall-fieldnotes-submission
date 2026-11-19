import React from "react";
import { createRoot } from "react-dom/client";
import ExperimentLab from "./ExperimentLab";
import Admin from "./Admin";
import Privacy from "./Privacy";
import "./base.css";
import "./lab.css";

const Page = location.pathname.startsWith("/admin")
  ? Admin
  : location.pathname.replace(/\/$/, "") === "/privacy"
    ? Privacy
    : ExperimentLab;
createRoot(document.getElementById("root")).render(<Page />);
