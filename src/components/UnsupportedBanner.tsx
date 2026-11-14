import type { BackendIdentity, EngineReadinessState } from "../engine/types.ts";

export interface UnsupportedBannerProps {
  engineState: EngineReadinessState;
  backend: BackendIdentity;
  engineError: string | null;
  onRetry?: () => void;
}

export function UnsupportedBanner({
  engineState,
  backend,
  engineError,
  onRetry,
}: UnsupportedBannerProps) {
  if (engineState !== "unavailable" && engineState !== "error") {
    return null;
  }

  const exactDetail =
    engineError ??
    backend.reason ??
    "The decision engine is unavailable in the current environment.";

  const isErrorState = engineState === "error";

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className={`unsupported-banner ${
        isErrorState ? "unsupported-banner-error" : "unsupported-banner-unavailable"
      }`}
    >
      <div className="banner-content">
        <div className="banner-title-row">
          <h2 className="banner-heading">
            {isErrorState
              ? "Decision Engine Error"
              : "Decision Engine Unsupported"}
          </h2>
          {isErrorState && onRetry && (
            <button
              type="button"
              className="btn btn-secondary banner-retry-btn"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </div>

        <p className="banner-detail">{exactDetail}</p>

        <p className="banner-requirement">
          This showcase requires desktop Chrome with WebGPU support (for the
          local single-pass ONNX encoder polyfill) or native{" "}
          <code>window.DecisionModel</code>.
        </p>

        <p className="banner-docs-pointer">
          Please refer to <strong>README.md</strong> for setup instructions,
          required browser flags, and verification steps.
        </p>

        <p className="banner-inspectable-note">
          All 12 character biographies remain inspectable below.
        </p>
      </div>
    </aside>
  );
}

export default UnsupportedBanner;
