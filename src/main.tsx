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

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element "#root" not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
