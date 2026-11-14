import type { RoundStatus, TurnRecord } from "../engine/types.ts";

export interface QuestionPanelProps {
  roundStatus: RoundStatus;
  questionInput: string;
  isSubmitting: boolean;
  turns: readonly TurnRecord[];
  maxLength: number;
  onInputChange: (val: string) => void;
  onSubmitQuestion: () => void;
  onSubmitChip: (prompt: string) => void;
  starterPrompts: readonly string[];
}

function getTurnBadge(turn: TurnRecord): { label: string; badgeClass: string } {
  switch (turn.policy.outcome) {
    case "answered":
      if (turn.policy.answer === "Yes") {
        return { label: "✓ Yes", badgeClass: "turn-badge-yes" };
      }
      if (turn.policy.answer === "No") {
        return { label: "✕ No", badgeClass: "turn-badge-no" };
      }
      return {
        label: "? Not enough information",
        badgeClass: "turn-badge-unknown",
      };
    case "unknown":
      return {
        label: "? Not enough information",
        badgeClass: "turn-badge-unknown",
      };
    case "clarification":
      return {
        label: "! Clarification",
        badgeClass: "turn-badge-clarification",
      };
    case "rejection":
      return { label: "⚠ Rejected", badgeClass: "turn-badge-rejection" };
    case "error":
      return { label: "⚠ Error", badgeClass: "turn-badge-error" };
    default:
      return {
        label: "? Not enough information",
        badgeClass: "turn-badge-unknown",
      };
  }
}

export function QuestionPanel({
  roundStatus,
  questionInput,
  isSubmitting,
  turns,
  maxLength,
  onInputChange,
  onSubmitQuestion,
  onSubmitChip,
  starterPrompts,
}: QuestionPanelProps) {
  const isPlaying = roundStatus === "playing";
  const trimmedLength = questionInput.trim().length;
  const isOverLength = trimmedLength > maxLength;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPlaying && !isSubmitting) {
      onSubmitQuestion();
    }
  };

  return (
    <section className="question-panel" aria-labelledby="question-panel-heading">
      <h2 id="question-panel-heading" className="sr-only">
        Investigation and Questions
      </h2>

      <form className="question-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="player-question-input" className="question-label">
            Ask yes/no questions based on the written biographies
          </label>

          <div className="input-row">
            <input
              id="player-question-input"
              type="text"
              className="question-input"
              value={questionInput}
              onChange={(e) => onInputChange(e.target.value)}
              disabled={!isPlaying || isSubmitting}
              placeholder="e.g. Do they regularly work at night?"
              aria-describedby="question-helper question-counter"
              autoComplete="off"
            />
            <button
              type="submit"
              className="btn btn-primary question-submit-btn"
              disabled={!isPlaying || isSubmitting}
            >
              {isSubmitting ? "Evaluating..." : "Ask question"}
            </button>
          </div>

          <div className="input-footer">
            <p id="question-helper" className="helper-text">
              Answers derive strictly from the written biographies.
            </p>
            <span
              id="question-counter"
              className={`char-counter ${isOverLength ? "char-counter-exceeded" : ""}`}
              aria-label={`${trimmedLength} of ${maxLength} characters`}
            >
              {trimmedLength} / {maxLength}
            </span>
          </div>
        </div>
      </form>

      {starterPrompts.length > 0 && (
        <div className="starter-prompts-section">
          <span className="starter-prompts-title">Starter prompts:</span>
          <div
            className="starter-chips"
            role="group"
            aria-label="Starter question prompts"
          >
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="btn btn-chip"
                onClick={() => onSubmitChip(prompt)}
                disabled={!isPlaying || isSubmitting}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="turn-history-section">
        <h3 className="turn-history-heading">Turn History</h3>
        {turns.length === 0 ? (
          <p className="turn-history-empty" role="note">
            No questions asked yet. Ask a question or click a starter prompt to
            begin investigating.
          </p>
        ) : (
          <ol className="turn-history">
            {turns.map((turn) => {
              const badge = getTurnBadge(turn);
              return (
                <li key={turn.requestNumber} className="turn-history-item">
                  <div className="turn-item-meta">
                    <span className="turn-number-tag">
                      {turn.questionNumber !== null
                        ? `Question #${turn.questionNumber}`
                        : `Request #${turn.requestNumber}`}
                    </span>
                    <span className={`turn-badge ${badge.badgeClass}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="turn-player-query">“{turn.playerQuestion}”</p>
                  <p className="turn-policy-response">{turn.policy.message}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

export default QuestionPanel;
