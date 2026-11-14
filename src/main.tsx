import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.tsx";

if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("eval") === "1"
) {
  const { registerEvalHarness } = await import("./eval/evalHarness.tsx");
  registerEvalHarness();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
