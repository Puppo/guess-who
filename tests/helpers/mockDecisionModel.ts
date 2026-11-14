import type {
  BooleanLabel,
  DecisionAvailability,
  DecisionCreateOptions,
  DecisionDecideOptions,
  DecisionModelInstance,
  DecisionModelStatic,
  DecisionSchema,
  QuestionDecision,
  QuestionKindLabel,
  RawRoundDecision,
} from "../../src/engine/types.ts";
import type {
  OpenJevInstanceLike,
  OpenJevModuleLike,
} from "../../src/engine/decisionAdapter.ts";

export type MakeRawDecisionOptions = {
  kindLabel?: QuestionKindLabel;
  kindConfidence?: number;
  supportsYesLabel?: BooleanLabel;
  supportsYesConfidence?: number;
  contradictsNoLabel?: BooleanLabel;
  contradictsNoConfidence?: number;
  kindProbabilities?: Record<QuestionKindLabel, number>;
  supportsYesProbabilities?: Record<BooleanLabel, number>;
  contradictsNoProbabilities?: Record<BooleanLabel, number>;
};

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function makeRawDecision(
  overrides?: MakeRawDecisionOptions
): RawRoundDecision {
  const kindLabel = overrides?.kindLabel ?? "trait_question";
  const kindConfidence = overrides?.kindConfidence ?? 0.9;
  const supportsYesLabel = overrides?.supportsYesLabel ?? "true";
  const supportsYesConfidence = overrides?.supportsYesConfidence ?? 0.9;
  const contradictsNoLabel = overrides?.contradictsNoLabel ?? "false";
  const contradictsNoConfidence = overrides?.contradictsNoConfidence ?? 0.9;

  const defaultKindProbs: Record<QuestionKindLabel, number> = {
    trait_question:
      kindLabel === "trait_question"
        ? kindConfidence
        : round4((1 - kindConfidence) / 2),
    identity_guess:
      kindLabel === "identity_guess"
        ? kindConfidence
        : round4((1 - kindConfidence) / 2),
    needs_rephrase:
      kindLabel === "needs_rephrase"
        ? kindConfidence
        : round4((1 - kindConfidence) / 2),
  };

  const defaultSupportsYesProbs: Record<BooleanLabel, number> = {
    true:
      supportsYesLabel === "true"
        ? supportsYesConfidence
        : round4(1 - supportsYesConfidence),
    false:
      supportsYesLabel === "false"
        ? supportsYesConfidence
        : round4(1 - supportsYesConfidence),
  };

  const defaultContradictsNoProbs: Record<BooleanLabel, number> = {
    true:
      contradictsNoLabel === "true"
        ? contradictsNoConfidence
        : round4(1 - contradictsNoConfidence),
    false:
      contradictsNoLabel === "false"
        ? contradictsNoConfidence
        : round4(1 - contradictsNoConfidence),
  };

  return {
    question_kind: {
      id: "question_kind",
      label: kindLabel,
      confidence: kindConfidence,
      probabilities: overrides?.kindProbabilities ?? defaultKindProbs,
    },
    supports_yes: {
      id: "supports_yes",
      label: supportsYesLabel,
      confidence: supportsYesConfidence,
      probabilities:
        overrides?.supportsYesProbabilities ?? defaultSupportsYesProbs,
    },
    contradicts_no: {
      id: "contradicts_no",
      label: contradictsNoLabel,
      confidence: contradictsNoConfidence,
      probabilities:
        overrides?.contradictsNoProbabilities ?? defaultContradictsNoProbs,
    },
  };
}

export type MockDecisionModelStatic = DecisionModelStatic & {
  availabilityStatus: DecisionAvailability;
  setAvailability(status: DecisionAvailability): void;
  createdSchemas: DecisionCreateOptions[];
  createdInstances: DecisionModelInstance[];
  destroyedCount: number;
  setDecideHandler(
    handler: (
      input: string,
      options?: DecisionDecideOptions
    ) => Promise<unknown> | unknown
  ): void;
};

export type CreateMockDecisionModelOptions = {
  initialAvailability?: DecisionAvailability;
  downloadProgressEvents?: readonly number[];
  decideHandler?: (
    input: string,
    options?: DecisionDecideOptions
  ) => Promise<unknown> | unknown;
  createDelayMs?: number;
};

export function createMockDecisionModelStatic(
  options: CreateMockDecisionModelOptions = {}
): MockDecisionModelStatic {
  let availabilityStatus: DecisionAvailability =
    options.initialAvailability ?? "available";
  const createdSchemas: DecisionCreateOptions[] = [];
  const createdInstances: DecisionModelInstance[] = [];
  let currentDecideHandler =
    options.decideHandler ??
    ((_input: string, _opts?: DecisionDecideOptions) => makeRawDecision());

  const mock: MockDecisionModelStatic = {
    get availabilityStatus() {
      return availabilityStatus;
    },
    setAvailability(status: DecisionAvailability) {
      availabilityStatus = status;
    },
    createdSchemas,
    createdInstances,
    destroyedCount: 0,
    setDecideHandler(handler) {
      currentDecideHandler = handler;
    },
    async availability(_schema?: DecisionSchema): Promise<DecisionAvailability> {
      return availabilityStatus;
    },
    async create(createOpts: DecisionCreateOptions): Promise<DecisionModelInstance> {
      if (createOpts.signal?.aborted) {
        throw new DOMException(
          createOpts.signal.reason?.message ?? "The operation was aborted.",
          "AbortError"
        );
      }

      createdSchemas.push(createOpts);

      if (createOpts.monitor && options.downloadProgressEvents) {
        const target = new EventTarget();
        createOpts.monitor(target);
        for (const fraction of options.downloadProgressEvents) {
          const event = new ProgressEvent("downloadprogress", {
            lengthComputable: true,
            loaded: Math.round(fraction * 100),
            total: 100,
          });
          target.dispatchEvent(event);
        }
      }

      if (options.createDelayMs && options.createDelayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, options.createDelayMs);
          if (createOpts.signal) {
            createOpts.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(
                  new DOMException(
                    "The operation was aborted.",
                    "AbortError"
                  )
                );
              },
              { once: true }
            );
          }
        });
      }

      let instanceDestroyed = false;
      const instance: DecisionModelInstance = {
        async decide(input: string, decideOpts?: DecisionDecideOptions) {
          if (instanceDestroyed) {
            throw new DOMException(
              "The round session has been destroyed.",
              "AbortError"
            );
          }
          if (decideOpts?.signal?.aborted) {
            throw new DOMException(
              "The operation was aborted.",
              "AbortError"
            );
          }

          const resultPromise = Promise.resolve().then(() =>
            currentDecideHandler(input, decideOpts)
          );

          if (!decideOpts?.signal) {
            return (await resultPromise) as Record<
              string,
              QuestionDecision<string>
            >;
          }

          return await new Promise((resolve, reject) => {
            const onAbort = () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError")
              );
            };
            decideOpts.signal!.addEventListener("abort", onAbort, {
              once: true,
            });
            resultPromise.then(
              (res) => {
                decideOpts.signal!.removeEventListener("abort", onAbort);
                if (instanceDestroyed) {
                  reject(
                    new DOMException(
                      "The round session has been destroyed.",
                      "AbortError"
                    )
                  );
                } else {
                  resolve(res as Record<string, QuestionDecision<string>>);
                }
              },
              (err) => {
                decideOpts.signal!.removeEventListener("abort", onAbort);
                reject(err);
              }
            );
          });
        },
        destroy() {
          if (!instanceDestroyed) {
            instanceDestroyed = true;
            mock.destroyedCount++;
          }
        },
      };

      createdInstances.push(instance);
      return instance;
    },
  };

  return mock;
}

export type MockOpenJevModuleOptions = {
  isCached?: boolean;
  model?: string;
  device?: string;
  dtype?: string;
  downloadSize?: number;
  decideAnswers?: Record<string, unknown>;
};

export type MockOpenJevModule = OpenJevModuleLike & {
  infoCallCount: number;
  loadCallCount: number;
  instances: OpenJevInstanceLike[];
};

export function createMockOpenJevModule(
  opts: MockOpenJevModuleOptions = {}
): MockOpenJevModule {
  let infoCount = 0;
  let loadCount = 0;
  const instances: OpenJevInstanceLike[] = [];

  const module: MockOpenJevModule = {
    get infoCallCount() {
      return infoCount;
    },
    get loadCallCount() {
      return loadCount;
    },
    instances,
    OpenJev: {
      async info() {
        infoCount++;
        return {
          model: opts.model ?? "kev-0.6b",
          family: "kev",
          device: opts.device ?? "webgpu",
          dtype: opts.dtype ?? "auto",
          isCached: opts.isCached ?? false,
          downloadSize: opts.downloadSize ?? 500_000_000,
        };
      },
      async load(loadOpts) {
        loadCount++;
        loadOpts?.onProgress?.({ progress: 1.0 });
        const instance: OpenJevInstanceLike = {
          runtime: {
            model: opts.model ?? "kev-0.6b",
            family: "kev",
            device: opts.device ?? "webgpu",
            dtype: opts.dtype ?? "auto",
          },
          async decide() {
            return (opts.decideAnswers ?? {
              question_kind: {
                type: "choice",
                choice: "trait_question",
                confidence: 0.9,
                probabilities: {
                  trait_question: 0.9,
                  identity_guess: 0.05,
                  needs_rephrase: 0.05,
                },
              },
              supports_yes: {
                type: "noul",
                answer: true,
                probability: 0.9,
                confidence: 0.9,
              },
              contradicts_no: {
                type: "choice",
                choice: "false",
                confidence: 0.9,
                probabilities: { true: 0.1, false: 0.9 },
              },
            }) as any;
          },
          async dispose() {},
        };
        instances.push(instance);
        return instance;
      },
    },
  };

  return module;
}
