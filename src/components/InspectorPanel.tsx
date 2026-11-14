import { useState } from "react";
import type {
  BackendIdentity,
  DecisionSchema,
  QuestionDecision,
  RoundStatus,
  TurnRecord,
} from "../engine/types.ts";

export interface InspectorPanelProps {
  backend: BackendIdentity;
  initDurationMs: number | null;
  sessionCreateDurationMs: number | null;
  roundStatus: RoundStatus;
  roundSchema: DecisionSchema | null;
  turns: readonly TurnRecord[];
  requestNumber: number;
}

function RawQuestionBlock({
  title,
  decision,
}: {
  title: string;
  decision: QuestionDecision<string>;
}) {
  const entries = Object.entries(decision.probabilities);

  return (
    <div className="inspector-question-card">
      <div className="inspector-question-head">
        <code className="inspector-question-id">{title}</code>
        <span className="inspector-winning-label">{decision.label}</span>
      </div>

      <p className="inspector-confidence-line">
        Confidence (model score, not guaranteed correctness):{" "}
        <strong>{(decision.confidence * 100).toFixed(1)}%</strong>
      </p>

      <ul className="inspector-prob-list">
        {entries.map(([label, prob]) => {
          const pct = Math.max(0, Math.min(100, prob * 100));
          const isWinner = label === decision.label;
          return (
            <li
              key={label}
              className={`inspector-prob-row ${
                isWinner ? "inspector-prob-row-winner" : ""
              }`}
            >
              <span className="inspector-prob-label">{label}</span>
              <span className="inspector-prob-track" aria-hidden="true">
                <span
                  className="inspector-prob-fill"
                  style={{ width: `${pct.toFixed(1)}%` }}
                />
              </span>
              <span className="inspector-prob-value">{pct.toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function InspectorPanel({
  backend,
  initDurationMs,
  sessionCreateDurationMs,
  roundStatus,
  roundSchema,
  turns,
  requestNumber,
}: InspectorPanelProps) {
  const [isOpen, setIsOpen] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(
    null
  );

  const activeTurnIndex =
    selectedTurnIndex !== null && selectedTurnIndex < turns.length
      ? selectedTurnIndex
      : turns.length - 1;
  const activeTurn = activeTurnIndex >= 0 ? turns[activeTurnIndex] : null;

  return (
    <aside
      className={`inspector-panel ${
        isOpen ? "inspector-panel-open" : "inspector-panel-collapsed"
      }`}
      aria-labelledby="inspector-panel-heading"
    >
      <div className="inspector-header">
        <h2 id="inspector-panel-heading" className="inspector-title">
          Decisions API Inspector
        </h2>
        <button
          type="button"
          className="btn btn-secondary inspector-toggle-btn"
          aria-expanded={isOpen}
          aria-controls="inspector-panel-body"
          data-testid="inspector-toggle-btn"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {isOpen ? "Inspector (Hide)" : "Inspector (Show)"}
        </button>
      </div>

      <div
        id="inspector-panel-body"
        className="inspector-body"
        hidden={!isOpen}
      >
        <section className="inspector-section" aria-label="Runtime telemetry">
          <h3 className="inspector-section-heading">Runtime &amp; Timings</h3>
          <dl className="inspector-kv-list">
            <div className="inspector-kv-row">
              <dt>Engine identity</dt>
              <dd data-testid="inspector-engine-identity">
                {backend.badgeLabel}
              </dd>
            </div>
            {backend.packageName && (
              <div className="inspector-kv-row">
                <dt>Package</dt>
                <dd>
                  <code>
                    {backend.packageName}
                    {backend.packageVersion
                      ? `@${backend.packageVersion}`
                      : ""}
                  </code>
                </dd>
              </div>
            )}
            {backend.modelId && (
              <div className="inspector-kv-row">
                <dt>Model / Backend</dt>
                <dd>
                  <code>{backend.modelId}</code>
                  {backend.device ? ` (${backend.device}` : ""}
                  {backend.dtype ? `, ${backend.dtype})` : backend.device ? ")" : ""}
                </dd>
              </div>
            )}
            <div className="inspector-kv-row">
              <dt>Init / download time</dt>
              <dd data-testid="inspector-init-duration">
                {initDurationMs !== null ? `${initDurationMs.toFixed(1)} ms` : "—"}
              </dd>
            </div>
            <div className="inspector-kv-row">
              <dt>Round create() time</dt>
              <dd data-testid="inspector-create-duration">
                {sessionCreateDurationMs !== null
                  ? `${sessionCreateDurationMs.toFixed(2)} ms`
                  : "—"}
              </dd>
            </div>
            <div className="inspector-kv-row">
              <dt>Round status / requests</dt>
              <dd>
                {roundStatus} · {requestNumber}{" "}
                {requestNumber === 1 ? "request" : "requests"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="inspector-section" aria-label="Turn raw decision scores">
          <div className="inspector-turn-header">
            <h3 className="inspector-section-heading">Latest Decision Output</h3>
            {turns.length > 1 && (
              <label className="inspector-turn-select-label">
                <span className="sr-only">Select turn to inspect</span>
                <select
                  className="inspector-turn-select"
                  value={activeTurnIndex}
                  onChange={(e) => setSelectedTurnIndex(Number(e.target.value))}
                >
                  {turns.map((turn, idx) => (
                    <option
                      key={`${turn.requestNumber}-${turn.policy.outcome}-${turn.playerQuestion}-${turn.timestampMs}`}
                      value={idx}
                    >
                      Req #{turn.requestNumber} ({turn.policy.outcome})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {!activeTurn ? (
            <p className="inspector-empty-note">
              Submit a question during an active round to inspect raw
              single-pass option probabilities and policy routing.
            </p>
          ) : (
            <div className="inspector-turn-detail" data-testid="inspector-turn-detail">
              <dl className="inspector-kv-list">
                <div className="inspector-kv-row">
                  <dt>Request #</dt>
                  <dd data-testid="inspector-request-number">
                    {activeTurn.requestNumber}
                  </dd>
                </div>
                <div className="inspector-kv-row">
                  <dt>AppOutcome</dt>
                  <dd data-testid="inspector-app-outcome">
                    <code>{activeTurn.policy.outcome}</code>
                    {activeTurn.policy.answer
                      ? ` (${activeTurn.policy.answer})`
                      : ""}
                  </dd>
                </div>
                <div className="inspector-kv-row">
                  <dt>Inference duration</dt>
                  <dd data-testid="inspector-inference-duration">
                    {activeTurn.inferenceDurationMs !== null
                      ? `${activeTurn.inferenceDurationMs.toFixed(1)} ms`
                      : "—"}
                  </dd>
                </div>
                <div className="inspector-kv-row inspector-kv-stack">
                  <dt>Player question</dt>
                  <dd>{activeTurn.playerQuestion}</dd>
                </div>
              </dl>

              {activeTurn.raw ? (
                <div className="inspector-raw-heads">
                  <RawQuestionBlock
                    title="question_kind"
                    decision={activeTurn.raw.question_kind}
                  />
                  <RawQuestionBlock
                    title="supports_yes"
                    decision={activeTurn.raw.supports_yes}
                  />
                  <RawQuestionBlock
                    title="contradicts_no"
                    decision={activeTurn.raw.contradicts_no}
                  />
                </div>
              ) : (
                <p className="inspector-empty-note">
                  No raw model scores recorded for this turn (
                  {activeTurn.policy.outcome}).
                </p>
              )}
            </div>
          )}
        </section>

        <section className="inspector-section" aria-label="Schema context">
          <details
            className="spoilers-disclosure"
            data-testid="spoilers-disclosure"
          >
            <summary className="spoilers-summary">
              Reveal context — spoilers
            </summary>
            {roundSchema ? (
              <pre
                className="spoilers-schema-pre"
                data-testid="spoilers-schema-content"
              >
                {JSON.stringify(roundSchema, null, 2)}
              </pre>
            ) : (
              <p className="inspector-empty-note">
                Start a round to inspect the exact anonymous schema prompts sent
                to <code>DecisionModel.create()</code>.
              </p>
            )}
          </details>
        </section>
      </div>
    </aside>
  );
}

export default InspectorPanel;
