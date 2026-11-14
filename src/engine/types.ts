export type DecisionQuestionType = "boolean" | "choice" | "score";

export type DecisionOption = {
  readonly label: string;
  readonly description?: string;
};

export type DecisionQuestion =
  | {
      readonly id: string;
      readonly type: "boolean";
      readonly prompt: string;
    }
  | {
      readonly id: string;
      readonly type: "choice" | "score";
      readonly prompt: string;
      readonly options: readonly DecisionOption[];
    };

export type DecisionExpectedInput = {
  readonly type: "text";
  readonly languages?: readonly string[];
};

export type DecisionSchema = {
  readonly expectedInputs?: readonly DecisionExpectedInput[];
  readonly questions: readonly DecisionQuestion[];
};

export type DecisionDevTrialBackend =
  | "embedding-gemma-v1"
  | "language-model"
  | "laya-en-wint8"
  | "laya-ml-wint8";

export type DecisionAvailabilityOptions = DecisionSchema & {
  devTrialBackend?: DecisionDevTrialBackend;
};

export type DecisionAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

export type DecisionCreateOptions = DecisionSchema & {
  devTrialBackend?: DecisionDevTrialBackend;
  signal?: AbortSignal;
  monitor?: (target: EventTarget) => void;
};

export type DecisionDecideOptions = {
  signal?: AbortSignal;
};

export type QuestionDecision<TLabel extends string = string> = {
  id: string;
  label: TLabel;
  confidence: number;
  probabilities: Record<TLabel, number>;
};

export type QuestionKindLabel =
  | "trait_question"
  | "identity_guess"
  | "needs_rephrase";

export type BooleanLabel = "true" | "false";

export type RawRoundDecision = {
  question_kind: QuestionDecision<QuestionKindLabel>;
  supports_yes: QuestionDecision<BooleanLabel>;
  contradicts_no: QuestionDecision<BooleanLabel>;
};

export interface DecisionModelInstance {
  decide(
    input: string,
    options?: DecisionDecideOptions
  ): Promise<Record<string, QuestionDecision<string>>>;
  destroy(): void;
}

export interface DecisionModelStatic {
  availability(options?: DecisionAvailabilityOptions): Promise<DecisionAvailability>;
  create(options: DecisionCreateOptions): Promise<DecisionModelInstance>;
}

declare global {
  interface Window {
    DecisionModel?: DecisionModelStatic;
  }
}

export type EngineReadinessState =
  | "uninitialized"
  | "downloadable"
  | "loading"
  | "ready"
  | "unavailable"
  | "error";

export type BackendIdentity = {
  kind: "native" | "polyfill" | "unavailable";
  /** Display label for header badge, e.g. "Native DecisionModel" or "Polyfill (open-jev · kev-0.6b)" */
  badgeLabel: string;
  packageName?: string;
  packageVersion?: string;
  modelId?: string;
  device?: string;
  dtype?: string;
  reason?: string;
};

export type AvailabilityCheckResult = {
  readiness: "ready" | "downloadable" | "unavailable";
  backend: BackendIdentity;
  initDurationMs?: number;
};

export type RoundSession = {
  readonly schema: DecisionSchema;
  readonly createDurationMs: number;
  decide(
    playerQuestion: string,
    options?: { signal?: AbortSignal }
  ): Promise<{ raw: RawRoundDecision; inferenceDurationMs: number }>;
  destroy(): void;
};

export interface DecisionEngineAdapter {
  checkAvailability(): Promise<AvailabilityCheckResult>;
  initialize(options?: {
    signal?: AbortSignal;
    onProgress?: (fraction: number | null) => void;
  }): Promise<{ backend: BackendIdentity; initDurationMs: number }>;
  createRoundSession(
    secretFacts: readonly string[],
    options?: { signal?: AbortSignal }
  ): Promise<RoundSession>;
  getBackendIdentity(): BackendIdentity;
}

export type AppOutcome =
  | "answered"
  | "unknown"
  | "clarification"
  | "rejection"
  | "error";

export type PolicyThresholds = {
  questionKindThreshold: number;
  factThreshold: number;
};

export type PolicyDecision = {
  outcome: AppOutcome;
  answer?: "Yes" | "No" | "Not enough information";
  message: string;
  countsAsQuestion: boolean;
};

export class MalformedDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedDecisionError";
  }
}

export type RoundStatus = "idle" | "playing" | "won" | "lost";

export type TurnRecord = {
  readonly requestNumber: number;
  readonly questionNumber: number | null;
  readonly playerQuestion: string;
  readonly policy: PolicyDecision;
  readonly raw: RawRoundDecision | null;
  readonly inferenceDurationMs: number | null;
  readonly timestampMs: number;
};
