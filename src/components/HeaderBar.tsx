import type {
  BackendIdentity,
  EngineReadinessState,
  RoundStatus,
} from "../engine/types.ts";

export interface HeaderBarProps {
  engineState: EngineReadinessState;
  backend: BackendIdentity;
  downloadProgress: number | null;
  roundStatus: RoundStatus;
  questionCount: number;
  remainingCount: number;
  totalCount: number;
  onStartOrReset: () => void;
}

const READINESS_LABELS: Record<EngineReadinessState, string> = {
  uninitialized: "Checking",
  downloadable: "Downloadable",
  loading: "Loading",
  ready: "Ready",
  unavailable: "Unavailable",
  error: "Error",
};

export function HeaderBar({
  engineState,
  backend,
  downloadProgress,
  roundStatus,
  questionCount,
  remainingCount,
  totalCount,
  onStartOrReset,
}: HeaderBarProps) {
  const readinessLabel = READINESS_LABELS[engineState] ?? "Checking";
  const badgeText = `${readinessLabel} · ${backend.badgeLabel}`;

  let primaryButtonLabel = "Start game";
  let isPrimaryButtonDisabled = false;

  if (roundStatus === "idle") {
    if (engineState === "downloadable") {
      primaryButtonLabel = "Initialize & start game";
      isPrimaryButtonDisabled = false;
    } else if (engineState === "error") {
      primaryButtonLabel = "Retry engine";
      isPrimaryButtonDisabled = false;
    } else if (engineState === "ready") {
      primaryButtonLabel = "Start game";
      isPrimaryButtonDisabled = false;
    } else {
      // 'uninitialized' | 'loading' | 'unavailable'
      primaryButtonLabel = "Start game";
      isPrimaryButtonDisabled = true;
    }
  } else {
    // roundStatus !== 'idle'
    primaryButtonLabel = "New game";
    isPrimaryButtonDisabled = engineState === "loading";
  }

  return (
    <header className="header-bar">
      <div className="header-main-row">
        <div className="header-branding">
          <div className="header-title-group">
            <h1 className="header-title">Guess Who?</h1>
            <p className="header-subtitle">Decisions API Single-Pass Showcase</p>
          </div>
          <div
            className={`engine-badge engine-badge-${engineState}`}
            data-testid="engine-badge"
            role="status"
            aria-label={`Engine readiness status: ${badgeText}`}
          >
            <span className="badge-indicator" aria-hidden="true" />
            <span className="badge-text">{badgeText}</span>
          </div>
        </div>

        <div className="header-controls">
          <div className="header-metrics">
            <span
              className="metric-tag metric-questions"
              data-testid="question-count"
            >
              Questions: {questionCount}
            </span>
            <span
              className="metric-tag metric-remaining"
              data-testid="remaining-count"
            >
              Remaining: {remainingCount}/{totalCount}
            </span>
          </div>

          <button
            type="button"
            className="btn btn-primary primary-game-btn"
            data-testid="primary-game-btn"
            onClick={onStartOrReset}
            disabled={isPrimaryButtonDisabled}
          >
            {primaryButtonLabel}
          </button>
        </div>
      </div>

      {engineState === "loading" && (
        <div
          className="header-download-progress"
          data-testid="header-download-progress"
          role="status"
          aria-live="polite"
        >
          <label htmlFor="header-engine-progress" className="progress-label">
            <span>
              {downloadProgress !== null
                ? "Downloading engine model:"
                : "Loading decision engine weights..."}
            </span>
            {downloadProgress !== null && (
              <span className="progress-percent">
                {Math.round(downloadProgress * 100)}%
              </span>
            )}
          </label>
          {downloadProgress !== null ? (
            <progress
              id="header-engine-progress"
              className="download-progress-bar"
              value={downloadProgress}
              max={1}
            />
          ) : (
            <progress
              id="header-engine-progress"
              className="download-progress-bar"
              max={1}
            />
          )}
        </div>
      )}
    </header>
  );
}

export default HeaderBar;
