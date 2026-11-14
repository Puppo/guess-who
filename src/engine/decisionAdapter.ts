import type {
  AvailabilityCheckResult,
  BackendIdentity,
  BooleanLabel,
  DecisionDevTrialBackend,
  DecisionEngineAdapter,
  DecisionModelStatic,
  DecisionSchema,
  QuestionDecision,
  QuestionKindLabel,
  RawRoundDecision,
  RoundSession,
} from "./types.ts";
import { MalformedDecisionError } from "./types.ts";
import { BI_ENCODER_ANCHOR_LABEL, buildRoundSchema } from "./schema.ts";

const NATIVE_BACKEND_PRIORITY: readonly DecisionDevTrialBackend[] = [
  "laya-en-wint8",
  "language-model",
  "embedding-gemma-v1",
];

const OPEN_JEV_PACKAGE_NAME = "open-jev";
const OPEN_JEV_PACKAGE_VERSION = "0.1.2";
const DEFAULT_OPEN_JEV_MODEL = "kev-0.6b";

const QUESTION_KIND_LABELS: readonly QuestionKindLabel[] = [
  "trait_question",
  "identity_guess",
  "needs_rephrase",
];

const BOOLEAN_LABELS: readonly BooleanLabel[] = ["true", "false"];

type OpenJevChoiceQuestion = {
  type: "choice";
  instructions: string;
  options: readonly string[];
  descriptions?: Record<string, string>;
};

type OpenJevNoulQuestion = {
  type: "noul";
  instructions: string;
};

type OpenJevAnswer =
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | {
      type: "noul";
      answer: boolean;
      probability: number;
      confidence: number;
    };

export type OpenJevInstanceLike = {
  readonly runtime: {
    model: string;
    family: string;
    device: string;
    dtype: string;
  };
  decide(
    state: string,
    questions: Record<string, OpenJevChoiceQuestion | OpenJevNoulQuestion>,
    options?: { truncation?: "cut" | "error" }
  ): Promise<Record<string, OpenJevAnswer>>;
  dispose(): Promise<void>;
};

export type OpenJevModuleLike = {
  OpenJev: {
    info(options?: {
      model?: string;
      device?: "webgpu" | "wasm" | "cpu" | "auto";
      dtype?: "fp32" | "fp16" | "q4" | "q4f16" | "auto";
    }): Promise<{
      model: string;
      family: string;
      device: string;
      dtype: string;
      isCached: boolean;
      downloadSize: number;
    }>;
    load(options?: {
      model?: string;
      device?: "webgpu" | "wasm" | "cpu" | "auto";
      dtype?: "fp32" | "fp16" | "q4" | "q4f16" | "auto";
      truncation?: "cut" | "error";
      onProgress?: (progress: { progress: number }) => void;
    }): Promise<OpenJevInstanceLike>;
  };
};

export type DecisionAdapterOptions = {
  nativeDecisionModel?: DecisionModelStatic;
  loadOpenJevModule?: () => Promise<OpenJevModuleLike>;
  hasWebGpuAdapter?: () => Promise<boolean>;
};

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function createAbortError(signal?: AbortSignal): DOMException {
  if (signal?.reason instanceof DOMException) {
    return signal.reason;
  }
  if (signal?.reason instanceof Error) {
    return new DOMException(signal.reason.message, "AbortError");
  }
  return new DOMException("The operation was aborted.", "AbortError");
}

async function raceWithSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    throw createAbortError(signal);
  }
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

function isFiniteUnitScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function validateQuestionDecision<TLabel extends string>(
  raw: unknown,
  expectedId: string,
  allowedLabels: readonly TLabel[]
): QuestionDecision<TLabel> {
  if (!raw || typeof raw !== "object") {
    throw new MalformedDecisionError(
      `Decision for "${expectedId}" must be a non-null object.`
    );
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.id !== undefined && candidate.id !== expectedId) {
    throw new MalformedDecisionError(
      `Decision id mismatch for "${expectedId}": received "${String(candidate.id)}".`
    );
  }
  if (
    typeof candidate.label !== "string" ||
    !allowedLabels.includes(candidate.label as TLabel)
  ) {
    throw new MalformedDecisionError(
      `Invalid label "${String(candidate.label)}" for "${expectedId}".`
    );
  }
  if (!isFiniteUnitScore(candidate.confidence)) {
    throw new MalformedDecisionError(
      `Invalid confidence "${String(candidate.confidence)}" for "${expectedId}".`
    );
  }
  if (!candidate.probabilities || typeof candidate.probabilities !== "object") {
    throw new MalformedDecisionError(
      `Missing probabilities object for "${expectedId}".`
    );
  }

  const rawProbs = candidate.probabilities as Record<string, unknown>;
  const probabilities = {} as Record<TLabel, number>;
  for (const label of allowedLabels) {
    const prob = rawProbs[label];
    if (!isFiniteUnitScore(prob)) {
      throw new MalformedDecisionError(
        `Invalid probability for "${expectedId}.${label}": ${String(prob)}.`
      );
    }
    probabilities[label] = prob;
  }

  return {
    id: expectedId,
    label: candidate.label as TLabel,
    confidence: candidate.confidence,
    probabilities,
  };
}

export function validateRawRoundDecision(raw: unknown): RawRoundDecision {
  if (!raw || typeof raw !== "object") {
    throw new MalformedDecisionError(
      "Decision response must be a non-null object."
    );
  }
  const record = raw as Record<string, unknown>;

  return {
    question_kind: validateQuestionDecision(
      record.question_kind,
      "question_kind",
      QUESTION_KIND_LABELS
    ),
    supports_yes: validateQuestionDecision(
      record.supports_yes,
      "supports_yes",
      BOOLEAN_LABELS
    ),
    contradicts_no: validateQuestionDecision(
      record.contradicts_no,
      "contradicts_no",
      BOOLEAN_LABELS
    ),
  };
}

function hasStandardQuestionKindProbabilities(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  const probs = (candidate as Record<string, unknown>).probabilities;
  if (!probs || typeof probs !== "object") {
    return false;
  }
  const rec = probs as Record<string, unknown>;
  return (
    isFiniteUnitScore(rec.trait_question) &&
    isFiniteUnitScore(rec.identity_guess) &&
    isFiniteUnitScore(rec.needs_rephrase)
  );
}

function normalizeBiEncoderQuestionKind(candidate: unknown): unknown {
  if (hasStandardQuestionKindProbabilities(candidate)) {
    return candidate;
  }
  if (!candidate || typeof candidate !== "object") {
    throw new MalformedDecisionError(
      'Decision for "question_kind" must be a non-null object.'
    );
  }
  const rec = candidate as Record<string, unknown>;
  if (rec.id !== undefined && rec.id !== "question_kind") {
    throw new MalformedDecisionError(
      `Decision id mismatch for "question_kind": received "${String(rec.id)}".`
    );
  }
  if (!isFiniteUnitScore(rec.confidence)) {
    throw new MalformedDecisionError(
      `Invalid confidence "${String(rec.confidence)}" for "question_kind".`
    );
  }
  if (!rec.probabilities || typeof rec.probabilities !== "object") {
    throw new MalformedDecisionError(
      'Missing probabilities object for "question_kind".'
    );
  }

  const rawProbs = rec.probabilities as Record<string, unknown>;
  let maxTrait = 0;
  let maxIdentity = 0;
  let maxRephrase = 0;
  let hasKindKey = false;

  for (const [label, prob] of Object.entries(rawProbs)) {
    if (!isFiniteUnitScore(prob)) {
      throw new MalformedDecisionError(
        `Invalid probability for "question_kind.${label}": ${String(prob)}.`
      );
    }
    if (label.startsWith("kind_trait_")) {
      hasKindKey = true;
      if (prob > maxTrait) maxTrait = prob;
    } else if (label.startsWith("kind_identity_")) {
      hasKindKey = true;
      if (prob > maxIdentity) maxIdentity = prob;
    } else if (label.startsWith("kind_rephrase_")) {
      hasKindKey = true;
      if (prob > maxRephrase) maxRephrase = prob;
    }
  }

  const sum3 = maxTrait + maxIdentity + maxRephrase;
  if (!hasKindKey || sum3 <= 0) {
    return candidate;
  }

  const pTrait = round4(maxTrait / sum3);
  const pIdentity = round4(maxIdentity / sum3);
  const pRephrase = round4(maxRephrase / sum3);

  let winningLabel: QuestionKindLabel = "trait_question";
  let winningProb = pTrait;
  if (maxIdentity > maxTrait && maxIdentity >= maxRephrase) {
    winningLabel = "identity_guess";
    winningProb = pIdentity;
  } else if (maxRephrase > maxTrait && maxRephrase > maxIdentity) {
    winningLabel = "needs_rephrase";
    winningProb = pRephrase;
  }

  return {
    id: "question_kind",
    label: winningLabel,
    confidence: winningProb,
    probabilities: {
      trait_question: pTrait,
      identity_guess: pIdentity,
      needs_rephrase: pRephrase,
    },
  };
}

function hasBooleanProbabilities(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  const probs = (candidate as Record<string, unknown>).probabilities;
  if (!probs || typeof probs !== "object") {
    return false;
  }
  const rec = probs as Record<string, unknown>;
  return isFiniteUnitScore(rec.true) && isFiniteUnitScore(rec.false);
}

function extractAnchorRelativeLogs(
  candidate: unknown,
  questionId: string
): Array<{ label: string; logRatio: number }> {
  if (!candidate || typeof candidate !== "object") {
    throw new MalformedDecisionError(
      `Decision for "${questionId}" must be a non-null object.`
    );
  }
  const rec = candidate as Record<string, unknown>;
  if (rec.id !== undefined && rec.id !== questionId) {
    throw new MalformedDecisionError(
      `Decision id mismatch for "${questionId}": received "${String(rec.id)}".`
    );
  }
  if (!isFiniteUnitScore(rec.confidence)) {
    throw new MalformedDecisionError(
      `Invalid confidence "${String(rec.confidence)}" for "${questionId}".`
    );
  }
  if (!rec.probabilities || typeof rec.probabilities !== "object") {
    throw new MalformedDecisionError(
      `Missing probabilities object for "${questionId}".`
    );
  }

  const rawProbs = rec.probabilities as Record<string, unknown>;
  const anchorRaw = rawProbs[BI_ENCODER_ANCHOR_LABEL];
  if (!isFiniteUnitScore(anchorRaw) || anchorRaw <= 0) {
    throw new MalformedDecisionError(
      `Invalid anchor probability for "${questionId}.${BI_ENCODER_ANCHOR_LABEL}": ${String(anchorRaw)}.`
    );
  }

  const logAnchor = Math.log(Math.max(1e-12, anchorRaw));
  const result: Array<{ label: string; logRatio: number }> = [];

  for (const [label, prob] of Object.entries(rawProbs)) {
    if (!isFiniteUnitScore(prob)) {
      throw new MalformedDecisionError(
        `Invalid probability for "${questionId}.${label}": ${String(prob)}.`
      );
    }
    result.push({
      label,
      logRatio: Math.log(Math.max(1e-12, prob)) - logAnchor,
    });
  }

  return result;
}

function stableSigmoid(x: number): number {
  const clamped = Math.max(-60, Math.min(60, x));
  return 1 / (1 + Math.exp(-clamped));
}

export function normalizeBiEncoderDecision(
  raw: unknown,
  sharpness = 1
): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const record = raw as Record<string, unknown>;
  const standardKind = hasStandardQuestionKindProbabilities(
    record.question_kind
  );
  const booleanFacts =
    hasBooleanProbabilities(record.supports_yes) &&
    hasBooleanProbabilities(record.contradicts_no);

  if (standardKind && booleanFacts) {
    return raw;
  }

  const normalizedQuestionKind = normalizeBiEncoderQuestionKind(
    record.question_kind
  );

  if (booleanFacts) {
    return {
      question_kind: normalizedQuestionKind,
      supports_yes: record.supports_yes,
      contradicts_no: record.contradicts_no,
    };
  }

  const entries = [
    ...extractAnchorRelativeLogs(record.supports_yes, "supports_yes"),
    ...extractAnchorRelativeLogs(record.contradicts_no, "contradicts_no"),
  ];

  let maxYes = Number.NEGATIVE_INFINITY;
  let maxNo = Number.NEGATIVE_INFINITY;
  let maxUnk = 0; // Anchor label unk_other_topic always has logRatio === 0

  for (const { label, logRatio } of entries) {
    if (label.startsWith("yes_")) {
      if (logRatio > maxYes) maxYes = logRatio;
    } else if (label.startsWith("no_")) {
      if (logRatio > maxNo) maxNo = logRatio;
    } else if (label.startsWith("unk_")) {
      if (logRatio > maxUnk) maxUnk = logRatio;
    }
  }

  const k = Number.isFinite(sharpness) && sharpness > 0 ? sharpness : 1;
  const pYes = Number.isFinite(maxYes)
    ? round4(stableSigmoid(k * (maxYes - Math.max(maxNo, maxUnk))))
    : 0;
  const pYesFalse = round4(1 - pYes);

  const pNo = Number.isFinite(maxNo)
    ? round4(stableSigmoid(k * (maxNo - Math.max(maxYes, maxUnk))))
    : 0;
  const pNoFalse = round4(1 - pNo);

  const yesWins = pYes > 0.5;
  const noWins = pNo > 0.5;

  return {
    question_kind: normalizedQuestionKind,
    supports_yes: {
      id: "supports_yes",
      label: yesWins ? "true" : "false",
      confidence: round4(yesWins ? pYes : pYesFalse),
      probabilities: {
        true: pYes,
        false: pYesFalse,
      },
    },
    contradicts_no: {
      id: "contradicts_no",
      label: noWins ? "true" : "false",
      confidence: round4(noWins ? pNo : pNoFalse),
      probabilities: {
        true: pNo,
        false: pNoFalse,
      },
    },
  };
}

async function defaultHasWebGpuAdapter(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) {
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

async function defaultLoadOpenJevModule(): Promise<OpenJevModuleLike> {
  return (await import("open-jev")) as unknown as OpenJevModuleLike;
}

function schemaToOpenJevQuestions(
  schema: DecisionSchema
): Record<string, OpenJevChoiceQuestion | OpenJevNoulQuestion> {
  const mapped: Record<string, OpenJevChoiceQuestion | OpenJevNoulQuestion> = {};
  for (const q of schema.questions) {
    if (q.type === "boolean") {
      mapped[q.id] = {
        type: "noul",
        instructions: q.prompt,
      };
    } else if (q.type === "choice") {
      const descriptions: Record<string, string> = {};
      for (const opt of q.options) {
        if (opt.description) {
          descriptions[opt.label] = opt.description;
        }
      }
      mapped[q.id] = {
        type: "choice",
        instructions: q.prompt,
        options: q.options.map((o) => o.label),
        ...(Object.keys(descriptions).length > 0 ? { descriptions } : {}),
      };
    }
  }
  return mapped;
}

function mapOpenJevAnswersToRaw(
  answers: Record<string, OpenJevAnswer>
): Record<string, QuestionDecision<string>> {
  const mapped: Record<string, QuestionDecision<string>> = {};
  for (const [id, ans] of Object.entries(answers)) {
    if (!ans || typeof ans !== "object") continue;
    if (ans.type === "noul") {
      const pTrue = round4(ans.probability);
      const pFalse = round4(Math.max(0, Math.min(1, 1 - ans.probability)));
      mapped[id] = {
        id,
        label: ans.answer ? "true" : "false",
        confidence: round4(ans.confidence),
        probabilities: {
          true: pTrue,
          false: pFalse,
        },
      };
    } else if (ans.type === "choice") {
      const probabilities: Record<string, number> = {};
      for (const [label, prob] of Object.entries(ans.probabilities ?? {})) {
        probabilities[label] = round4(prob);
      }
      mapped[id] = {
        id,
        label: ans.choice,
        confidence: round4(ans.confidence),
        probabilities,
      };
    }
  }
  return mapped;
}

export function createDecisionEngineAdapter(
  options: DecisionAdapterOptions = {}
): DecisionEngineAdapter {
  const getNativeDecisionModel = (): DecisionModelStatic | undefined => {
    if (options.nativeDecisionModel !== undefined) {
      return options.nativeDecisionModel;
    }
    if (typeof window !== "undefined") {
      return window.DecisionModel;
    }
    return undefined;
  };

  const hasWebGpuAdapter = options.hasWebGpuAdapter ?? defaultHasWebGpuAdapter;
  const loadOpenJevModule = options.loadOpenJevModule ?? defaultLoadOpenJevModule;

  let activeMode: "native" | "polyfill" | "unavailable" = "unavailable";
  let selectedNativeBackend: DecisionDevTrialBackend | undefined;
  let nativeModelId: string | undefined;
  let backendIdentity: BackendIdentity = {
    kind: "unavailable",
    badgeLabel: "Unavailable",
  };
  let openJevInstance: OpenJevInstanceLike | null = null;
  let openJevInitPromise: Promise<{
    backend: BackendIdentity;
    initDurationMs: number;
  }> | null = null;

  const probeSchema = buildRoundSchema(["Probe biographical trait"], {
    variant: "cross-encoder",
  });
  const biEncoderProbeSchema = buildRoundSchema(["Probe biographical trait"], {
    variant: "bi-encoder",
  });

  async function loadPolyfillInstance(onProgress?: (fraction: number | null) => void): Promise<{
    backend: BackendIdentity;
    initDurationMs: number;
  }> {
    if (openJevInstance) {
      return { backend: backendIdentity, initDurationMs: 0 };
    }
    if (openJevInitPromise) {
      return openJevInitPromise;
    }

    openJevInitPromise = (async () => {
      const started = performance.now();
      const { OpenJev } = await loadOpenJevModule();
      const instance = await OpenJev.load({
        model: DEFAULT_OPEN_JEV_MODEL,
        device: "webgpu",
        dtype: "auto",
        truncation: "error",
        onProgress: ({ progress }) => {
          onProgress?.(
            typeof progress === "number" && Number.isFinite(progress)
              ? Math.max(0, Math.min(1, progress))
              : null
          );
        },
      });
      const initDurationMs = performance.now() - started;
      openJevInstance = instance;
      activeMode = "polyfill";
      backendIdentity = {
        kind: "polyfill",
        badgeLabel: `Polyfill (${OPEN_JEV_PACKAGE_NAME} · ${DEFAULT_OPEN_JEV_MODEL})`,
        packageName: OPEN_JEV_PACKAGE_NAME,
        packageVersion: OPEN_JEV_PACKAGE_VERSION,
        modelId: instance.runtime.model,
        device: instance.runtime.device,
        dtype: instance.runtime.dtype,
      };
      return { backend: backendIdentity, initDurationMs };
    })();

    try {
      return await openJevInitPromise;
    } finally {
      openJevInitPromise = null;
    }
  }

  return {
    getBackendIdentity(): BackendIdentity {
      return backendIdentity;
    },

    async checkAvailability(): Promise<AvailabilityCheckResult> {
      const nativeApi = getNativeDecisionModel();
      selectedNativeBackend = undefined;
      nativeModelId = undefined;

      if (nativeApi) {
        try {
          const isWebAiPolyfill = Boolean(
            (nativeApi as DecisionModelStatic & { __isPolyfill?: boolean })
              .__isPolyfill
          );

          if (isWebAiPolyfill) {
            const status = await nativeApi.availability(probeSchema);
            if (status === "available") {
              activeMode = "native";
              nativeModelId = "webai-polyfill";
              backendIdentity = {
                kind: "native",
                badgeLabel: "Native DecisionModel",
                modelId: nativeModelId,
              };
              return { readiness: "ready", backend: backendIdentity };
            }
            if (status === "downloadable" || status === "downloading") {
              activeMode = "native";
              nativeModelId = "webai-polyfill";
              backendIdentity = {
                kind: "native",
                badgeLabel: "Native DecisionModel",
                modelId: nativeModelId,
              };
              return { readiness: "downloadable", backend: backendIdentity };
            }
          } else {
            let firstAvailable: DecisionDevTrialBackend | undefined;
            let firstDownloadable: DecisionDevTrialBackend | undefined;
            let devTrialRejectedWithTypeError = false;

            for (const candidate of NATIVE_BACKEND_PRIORITY) {
              const candidateProbe =
                candidate === "embedding-gemma-v1"
                  ? biEncoderProbeSchema
                  : probeSchema;
              try {
                const status = await nativeApi.availability({
                  ...candidateProbe,
                  devTrialBackend: candidate,
                });
                if (status === "available" && !firstAvailable) {
                  firstAvailable = candidate;
                  break;
                }
                if (
                  (status === "downloadable" || status === "downloading") &&
                  !firstDownloadable
                ) {
                  firstDownloadable = candidate;
                }
              } catch (candidateErr) {
                if (candidateErr instanceof TypeError) {
                  devTrialRejectedWithTypeError = true;
                  break;
                }
              }
            }

            if (devTrialRejectedWithTypeError) {
              const status = await nativeApi.availability(probeSchema);
              if (status === "available") {
                activeMode = "native";
                backendIdentity = {
                  kind: "native",
                  badgeLabel: "Native DecisionModel",
                };
                return { readiness: "ready", backend: backendIdentity };
              }
              if (status === "downloadable" || status === "downloading") {
                activeMode = "native";
                backendIdentity = {
                  kind: "native",
                  badgeLabel: "Native DecisionModel",
                };
                return { readiness: "downloadable", backend: backendIdentity };
              }
            } else if (firstAvailable) {
              selectedNativeBackend = firstAvailable;
              nativeModelId = firstAvailable;
              activeMode = "native";
              backendIdentity = {
                kind: "native",
                badgeLabel: "Native DecisionModel",
                modelId: firstAvailable,
              };
              return { readiness: "ready", backend: backendIdentity };
            } else if (firstDownloadable) {
              selectedNativeBackend = firstDownloadable;
              nativeModelId = firstDownloadable;
              activeMode = "native";
              backendIdentity = {
                kind: "native",
                badgeLabel: "Native DecisionModel",
                modelId: firstDownloadable,
              };
              return { readiness: "downloadable", backend: backendIdentity };
            }
          }
        } catch {
          // Fall through to qualifying local single-pass encoder check.
        }
      }

      const gpuAvailable = await hasWebGpuAdapter();
      if (!gpuAvailable) {
        activeMode = "unavailable";
        backendIdentity = {
          kind: "unavailable",
          badgeLabel: "Unavailable",
          reason:
            "Neither native window.DecisionModel nor a WebGPU adapter for the local single-pass encoder (open-jev / kev-0.6b) is available in this browser.",
        };
        return { readiness: "unavailable", backend: backendIdentity };
      }

      try {
        const { OpenJev } = await loadOpenJevModule();
        const info = await OpenJev.info({
          model: DEFAULT_OPEN_JEV_MODEL,
          device: "webgpu",
          dtype: "auto",
        });

        activeMode = "polyfill";
        backendIdentity = {
          kind: "polyfill",
          badgeLabel: `Polyfill (${OPEN_JEV_PACKAGE_NAME} · ${DEFAULT_OPEN_JEV_MODEL})`,
          packageName: OPEN_JEV_PACKAGE_NAME,
          packageVersion: OPEN_JEV_PACKAGE_VERSION,
          modelId: info.model,
          device: info.device,
          dtype: info.dtype,
        };

        if (info.isCached || openJevInstance) {
          const loaded = await loadPolyfillInstance();
          return {
            readiness: "ready",
            backend: loaded.backend,
            initDurationMs: loaded.initDurationMs,
          };
        }

        return { readiness: "downloadable", backend: backendIdentity };
      } catch (err) {
        activeMode = "unavailable";
        backendIdentity = {
          kind: "unavailable",
          badgeLabel: "Unavailable",
          reason:
            err instanceof Error
              ? err.message
              : "Failed to inspect local single-pass decision model availability.",
        };
        return { readiness: "unavailable", backend: backendIdentity };
      }
    },

    async initialize(initOpts = {}): Promise<{
      backend: BackendIdentity;
      initDurationMs: number;
    }> {
      const { signal, onProgress } = initOpts;
      if (signal?.aborted) {
        throw createAbortError(signal);
      }

      const nativeApi = getNativeDecisionModel();
      if (activeMode === "native" && nativeApi) {
        const started = performance.now();
        const initSchema =
          selectedNativeBackend === "embedding-gemma-v1"
            ? biEncoderProbeSchema
            : probeSchema;
        const probeInstance = await nativeApi.create({
          ...initSchema,
          ...(selectedNativeBackend
            ? { devTrialBackend: selectedNativeBackend }
            : {}),
          signal,
          monitor(target) {
            target.addEventListener("downloadprogress", (event) => {
              const pe = event as ProgressEvent;
              if (pe.lengthComputable && pe.total > 0) {
                onProgress?.(Math.max(0, Math.min(1, pe.loaded / pe.total)));
              } else {
                onProgress?.(null);
              }
            });
          },
        });
        probeInstance.destroy();
        const initDurationMs = performance.now() - started;
        backendIdentity = {
          kind: "native",
          badgeLabel: "Native DecisionModel",
          ...(nativeModelId ? { modelId: nativeModelId } : {}),
        };
        return { backend: backendIdentity, initDurationMs };
      }

      const gpuAvailable = await hasWebGpuAdapter();
      if (!gpuAvailable) {
        activeMode = "unavailable";
        backendIdentity = {
          kind: "unavailable",
          badgeLabel: "Unavailable",
          reason:
            "Neither native window.DecisionModel nor a WebGPU adapter for the local single-pass encoder (open-jev / kev-0.6b) is available in this browser.",
        };
        throw new Error(backendIdentity.reason);
      }

      return await raceWithSignal(loadPolyfillInstance(onProgress), signal);
    },

    async createRoundSession(
      secretFacts: readonly string[],
      sessionOpts = {}
    ): Promise<RoundSession> {
      const { signal } = sessionOpts;
      if (signal?.aborted) {
        throw createAbortError(signal);
      }

      const schema = buildRoundSchema(secretFacts, {
        variant:
          activeMode === "native" &&
          selectedNativeBackend === "embedding-gemma-v1"
            ? "bi-encoder"
            : "cross-encoder",
      });
      const nativeApi = getNativeDecisionModel();

      if (activeMode === "native" && nativeApi) {
        const started = performance.now();
        const instance = await nativeApi.create({
          ...schema,
          ...(selectedNativeBackend
            ? { devTrialBackend: selectedNativeBackend }
            : {}),
          signal,
        });
        const createDurationMs = performance.now() - started;
        let destroyed = false;

        return {
          schema,
          createDurationMs,
          async decide(playerQuestion: string, decideOpts = {}) {
            if (destroyed) {
              throw new DOMException(
                "The round session has been destroyed.",
                "AbortError"
              );
            }
            if (decideOpts.signal?.aborted) {
              throw createAbortError(decideOpts.signal);
            }
            const t0 = performance.now();
            const rawResponse = await raceWithSignal(
              instance.decide(playerQuestion, { signal: decideOpts.signal }),
              decideOpts.signal
            );
            const inferenceDurationMs = performance.now() - t0;
            const normalizedResponse =
              selectedNativeBackend === "embedding-gemma-v1"
                ? normalizeBiEncoderDecision(rawResponse)
                : rawResponse;
            const raw = validateRawRoundDecision(normalizedResponse);
            return { raw, inferenceDurationMs };
          },
          destroy() {
            if (!destroyed) {
              destroyed = true;
              instance.destroy();
            }
          },
        };
      }

      if (!openJevInstance) {
        throw new Error(
          "Decision engine is not initialized. Call initialize() before creating a round session."
        );
      }

      const instance = openJevInstance;
      const started = performance.now();
      const openJevQuestions = schemaToOpenJevQuestions(schema);
      const createDurationMs = performance.now() - started;
      let destroyed = false;

      return {
        schema,
        createDurationMs,
        async decide(playerQuestion: string, decideOpts = {}) {
          if (destroyed) {
            throw new DOMException(
              "The round session has been destroyed.",
              "AbortError"
            );
          }
          if (decideOpts.signal?.aborted) {
            throw createAbortError(decideOpts.signal);
          }
          const t0 = performance.now();
          const answers = await raceWithSignal(
            instance.decide(playerQuestion, openJevQuestions, {
              truncation: "error",
            }),
            decideOpts.signal
          );
          if (destroyed) {
            throw new DOMException(
              "The round session has been destroyed.",
              "AbortError"
            );
          }
          const inferenceDurationMs = performance.now() - t0;
          const raw = validateRawRoundDecision(mapOpenJevAnswersToRaw(answers));
          return { raw, inferenceDurationMs };
        },
        destroy() {
          destroyed = true;
        },
      };
    },
  };
}
