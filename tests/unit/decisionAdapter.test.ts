import { describe, expect, it, vi } from "vitest";
import { CHARACTERS } from "../../src/data/characters.ts";
import {
  createDecisionEngineAdapter,
  normalizeBiEncoderDecision,
  validateRawRoundDecision,
} from "../../src/engine/decisionAdapter.ts";
import { evaluateDecisionPolicy } from "../../src/engine/policy.ts";
import { BI_ENCODER_ANCHOR_LABEL, buildRoundSchema } from "../../src/engine/schema.ts";
import {
  type DecisionAvailabilityOptions,
  type DecisionCreateOptions,
  type DecisionModelStatic,
  MalformedDecisionError,
} from "../../src/engine/types.ts";
import {
  createMockDecisionModelStatic,
  createMockOpenJevModule,
  makeRawDecision,
} from "../helpers/mockDecisionModel.ts";

describe("decisionAdapter", () => {
  describe("native DecisionModel precedence over polyfill", () => {
    it("prefers native DecisionModel when available without querying WebGPU", async () => {
      const nativeMock = createMockDecisionModelStatic({
        initialAvailability: "available",
      });
      const hasWebGpuAdapter = vi.fn().mockResolvedValue(true);
      const mockOpenJev = createMockOpenJevModule();
      const loadOpenJevModule = vi.fn().mockResolvedValue(mockOpenJev);

      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
        hasWebGpuAdapter,
        loadOpenJevModule,
      });

      const res = await adapter.checkAvailability();
      expect(res.readiness).toBe("ready");
      expect(res.backend.kind).toBe("native");
      expect(res.backend.badgeLabel).toBe("Native DecisionModel");

      // WebGPU and open-jev must not have been touched
      expect(hasWebGpuAdapter).not.toHaveBeenCalled();
      expect(loadOpenJevModule).not.toHaveBeenCalled();
    });
  });

  describe("downloadable -> initialize with monitor progress events", () => {
    it("reports downloadable and dispatches progress events on initialize", async () => {
      const nativeMock = createMockDecisionModelStatic({
        initialAvailability: "downloadable",
        downloadProgressEvents: [0.25, 0.5, 0.75, 1.0],
      });

      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });

      const check = await adapter.checkAvailability();
      expect(check.readiness).toBe("downloadable");
      expect(check.backend.kind).toBe("native");

      const progressFractions: (number | null)[] = [];
      const initRes = await adapter.initialize({
        onProgress: (fraction) => {
          progressFractions.push(fraction);
        },
      });

      expect(initRes.backend.kind).toBe("native");
      expect(initRes.backend.badgeLabel).toBe("Native DecisionModel");
      expect(initRes.initDurationMs).toBeGreaterThanOrEqual(0);
      expect(progressFractions).toEqual([0.25, 0.5, 0.75, 1.0]);
      // The probe instance created during initialize should be destroyed immediately
      expect(nativeMock.destroyedCount).toBe(1);
    });
  });

  describe("unavailable when both native and WebGPU are absent", () => {
    it("returns readiness unavailable and throws on initialize", async () => {
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: undefined,
        hasWebGpuAdapter: async () => false,
      });

      const check = await adapter.checkAvailability();
      expect(check.readiness).toBe("unavailable");
      expect(check.backend.kind).toBe("unavailable");
      expect(check.backend.badgeLabel).toBe("Unavailable");
      expect(check.backend.reason).toContain("Neither native window.DecisionModel nor a WebGPU adapter");

      await expect(adapter.initialize()).rejects.toThrow(
        /Neither native window\.DecisionModel nor a WebGPU adapter/
      );
    });
  });

  describe("MalformedDecisionError validation", () => {
    it("rejects non-object or null input", () => {
      expect(() => validateRawRoundDecision(null)).toThrow(MalformedDecisionError);
      expect(() => validateRawRoundDecision(undefined)).toThrow(MalformedDecisionError);
      expect(() => validateRawRoundDecision("not an object")).toThrow(MalformedDecisionError);
    });

    it("rejects missing top-level keys", () => {
      const valid = makeRawDecision();
      const missingKind = { ...valid, question_kind: undefined };
      expect(() => validateRawRoundDecision(missingKind)).toThrow(
        /Decision for "question_kind" must be a non-null object/
      );

      const missingSupports = { ...valid, supports_yes: undefined };
      expect(() => validateRawRoundDecision(missingSupports)).toThrow(
        /Decision for "supports_yes" must be a non-null object/
      );

      const missingContradicts = { ...valid, contradicts_no: undefined };
      expect(() => validateRawRoundDecision(missingContradicts)).toThrow(
        /Decision for "contradicts_no" must be a non-null object/
      );
    });

    it("rejects bad labels", () => {
      const valid = makeRawDecision();
      const badKind = {
        ...valid,
        question_kind: { ...valid.question_kind, label: "bogus_label" },
      };
      expect(() => validateRawRoundDecision(badKind)).toThrow(
        /Invalid label "bogus_label" for "question_kind"/
      );

      const badSupports = {
        ...valid,
        supports_yes: { ...valid.supports_yes, label: "maybe" },
      };
      expect(() => validateRawRoundDecision(badSupports)).toThrow(
        /Invalid label "maybe" for "supports_yes"/
      );
    });

    it("rejects NaN and out-of-range confidence scores", () => {
      const valid = makeRawDecision();
      const nanConfidence = {
        ...valid,
        question_kind: { ...valid.question_kind, confidence: Number.NaN },
      };
      expect(() => validateRawRoundDecision(nanConfidence)).toThrow(
        /Invalid confidence "NaN" for "question_kind"/
      );

      const overConfidence = {
        ...valid,
        supports_yes: { ...valid.supports_yes, confidence: 1.5 },
      };
      expect(() => validateRawRoundDecision(overConfidence)).toThrow(
        /Invalid confidence "1.5" for "supports_yes"/
      );

      const negativeConfidence = {
        ...valid,
        contradicts_no: { ...valid.contradicts_no, confidence: -0.1 },
      };
      expect(() => validateRawRoundDecision(negativeConfidence)).toThrow(
        /Invalid confidence "-0.1" for "contradicts_no"/
      );
    });

    it("rejects missing, NaN, or out-of-range probabilities", () => {
      const valid = makeRawDecision();
      const missingProbabilities = {
        ...valid,
        question_kind: { ...valid.question_kind, probabilities: null },
      };
      expect(() => validateRawRoundDecision(missingProbabilities)).toThrow(
        /Missing probabilities object for "question_kind"/
      );

      const nanProb = {
        ...valid,
        supports_yes: {
          ...valid.supports_yes,
          probabilities: { true: Number.NaN, false: 0.5 },
        },
      };
      expect(() => validateRawRoundDecision(nanProb)).toThrow(
        /Invalid probability for "supports_yes\.true": NaN/
      );

      const outOfRangeProb = {
        ...valid,
        contradicts_no: {
          ...valid.contradicts_no,
          probabilities: { true: 1.2, false: -0.2 },
        },
      };
      expect(() => validateRawRoundDecision(outOfRangeProb)).toThrow(
        /Invalid probability for "contradicts_no\.true": 1\.2/
      );
    });

    it("rejects mismatched decision ids", () => {
      const valid = makeRawDecision();
      const wrongId = {
        ...valid,
        supports_yes: { ...valid.supports_yes, id: "wrong_id" },
      };
      expect(() => validateRawRoundDecision(wrongId)).toThrow(
        /Decision id mismatch for "supports_yes": received "wrong_id"/
      );
    });

    it("session.decide rejects with MalformedDecisionError on invalid raw model output", async () => {
      const nativeMock = createMockDecisionModelStatic({
        decideHandler: () => ({
          question_kind: { bad: "payload" },
        }),
      });

      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });

      await adapter.checkAvailability();
      const session = await adapter.createRoundSession(["Fact 1"]);

      await expect(session.decide("Is this valid?")).rejects.toThrow(
        MalformedDecisionError
      );
    });
  });

  describe("AbortSignal handling (pre-abort and mid-flight abort)", () => {
    it("rejects pre-aborted signal in initialize", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      await adapter.checkAvailability();

      const ac = new AbortController();
      ac.abort();

      await expect(adapter.initialize({ signal: ac.signal })).rejects.toThrow(
        /aborted/i
      );
    });

    it("rejects pre-aborted signal in createRoundSession", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      await adapter.checkAvailability();

      const ac = new AbortController();
      ac.abort();

      await expect(
        adapter.createRoundSession(["Fact 1"], { signal: ac.signal })
      ).rejects.toThrow(/aborted/i);
    });

    it("rejects pre-aborted signal in session.decide", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      await adapter.checkAvailability();
      const session = await adapter.createRoundSession(["Fact 1"]);

      const ac = new AbortController();
      ac.abort();

      await expect(
        session.decide("Do they work at night?", { signal: ac.signal })
      ).rejects.toThrow(/aborted/i);
    });

    it("rejects mid-flight abort in session.decide", async () => {
      let triggerAbort: (() => void) | null = null;
      const nativeMock = createMockDecisionModelStatic({
        decideHandler: (_input, opts) => {
          return new Promise((resolve, reject) => {
            triggerAbort?.();
            const timer = setTimeout(() => resolve(makeRawDecision()), 500);
            opts?.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          });
        },
      });

      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      await adapter.checkAvailability();
      const session = await adapter.createRoundSession(["Fact 1"]);

      const ac = new AbortController();
      triggerAbort = () => {
        ac.abort();
      };

      await expect(
        session.decide("Do they work at night?", { signal: ac.signal })
      ).rejects.toThrow(/aborted/i);
    });
  });

  describe("post-destroy() rejection", () => {
    it("rejects decide after destroy with AbortError and idempotently destroys native instance", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      await adapter.checkAvailability();
      const session = await adapter.createRoundSession(["Fact 1"]);

      session.destroy();
      session.destroy(); // idempotent

      expect(nativeMock.destroyedCount).toBe(1);

      await expect(session.decide("Do they work at night?")).rejects.toThrow(
        /destroyed/i
      );
    });
  });

  describe("open-jev cached session path", () => {
    it("reuses openJevInstance across multiple round sessions without re-calling OpenJev.load", async () => {
      const mockOpenJev = createMockOpenJevModule({ isCached: true });
      const loadOpenJevModule = vi.fn().mockResolvedValue(mockOpenJev);
      const hasWebGpuAdapter = vi.fn().mockResolvedValue(true);

      const adapter = createDecisionEngineAdapter({
        loadOpenJevModule,
        hasWebGpuAdapter,
      });

      // Availability check sees cached model and pre-loads it
      const check = await adapter.checkAvailability();
      expect(check.readiness).toBe("ready");
      expect(check.backend.kind).toBe("polyfill");
      expect(mockOpenJev.loadCallCount).toBe(1);

      // Create session 1
      const session1 = await adapter.createRoundSession(["Fact 1"]);
      expect(session1.createDurationMs).toBeGreaterThanOrEqual(0);
      expect(mockOpenJev.loadCallCount).toBe(1);

      const res1 = await session1.decide("Do they work at night?");
      expect(res1.raw.question_kind.label).toBe("trait_question");
      expect(res1.inferenceDurationMs).toBeGreaterThanOrEqual(0);

      // Create session 2: does NOT reload weights
      const session2 = await adapter.createRoundSession(["Fact 2"]);
      expect(session2.createDurationMs).toBeGreaterThanOrEqual(0);
      expect(mockOpenJev.loadCallCount).toBe(1);

      const res2 = await session2.decide("Do they enjoy camping?");
      expect(res2.raw.question_kind.label).toBe("trait_question");
      expect(res2.inferenceDurationMs).toBeGreaterThanOrEqual(0);

      // Destroy session 1 should not break session 2
      session1.destroy();
      await expect(session1.decide("Test?")).rejects.toThrow(/destroyed/i);

      const res2Again = await session2.decide("Do they own a pet?");
      expect(res2Again.raw.supports_yes.label).toBe("true");
    });
  });

  describe("Chrome Canary devTrialBackend negotiation and bi-encoder schema fallback", () => {
    it("prefers laya-en-wint8 with cross-encoder schema when available", async () => {
      const availabilityCalls: DecisionAvailabilityOptions[] = [];
      const createdOptions: DecisionCreateOptions[] = [];

      const nativeMock: DecisionModelStatic = {
        async availability(opts) {
          if (opts) availabilityCalls.push(opts);
          return opts?.devTrialBackend === "laya-en-wint8"
            ? "available"
            : "unavailable";
        },
        async create(opts) {
          createdOptions.push(opts);
          return {
            async decide() {
              return makeRawDecision();
            },
            destroy() {},
          };
        },
      };

      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });

      const check = await adapter.checkAvailability();
      expect(check.readiness).toBe("ready");
      expect(check.backend.kind).toBe("native");
      expect(check.backend.badgeLabel).toBe("Native DecisionModel");
      expect(check.backend.modelId).toBe("laya-en-wint8");
      expect(availabilityCalls.map((c) => c.devTrialBackend)).toEqual([
        "laya-en-wint8",
      ]);

      await adapter.createRoundSession([
        "Is a woman (female)",
        "Works as an astronomer",
      ]);
      expect(createdOptions).toHaveLength(1);
      expect(createdOptions[0].devTrialBackend).toBe("laya-en-wint8");
      const supportsYes = createdOptions[0].questions.find(
        (q) => q.id === "supports_yes"
      );
      expect(supportsYes?.type).toBe("boolean");
    });

    it("falls back to embedding-gemma-v1 and selects bi-encoder choice schema", async () => {
      const availabilityCalls: DecisionAvailabilityOptions[] = [];
      const createdOptions: DecisionCreateOptions[] = [];

      const nativeMock: DecisionModelStatic = {
        async availability(opts) {
          if (opts) availabilityCalls.push(opts);
          return opts?.devTrialBackend === "embedding-gemma-v1"
            ? "available"
            : "unavailable";
        },
        async create(opts) {
          createdOptions.push(opts);
          return {
            async decide() {
              return makeRawDecision();
            },
            destroy() {},
          };
        },
      };

      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });

      const check = await adapter.checkAvailability();
      expect(check.readiness).toBe("ready");
      expect(check.backend.kind).toBe("native");
      expect(check.backend.modelId).toBe("embedding-gemma-v1");
      expect(availabilityCalls.map((c) => c.devTrialBackend)).toEqual([
        "laya-en-wint8",
        "language-model",
        "embedding-gemma-v1",
      ]);

      await adapter.createRoundSession([
        "Is a man (male)",
        "Works as a baker",
      ]);
      expect(createdOptions).toHaveLength(1);
      expect(createdOptions[0].devTrialBackend).toBe("embedding-gemma-v1");
      const supportsYes = createdOptions[0].questions.find(
        (q) => q.id === "supports_yes"
      );
      const contradictsNo = createdOptions[0].questions.find(
        (q) => q.id === "contradicts_no"
      );
      expect(supportsYes?.type).toBe("choice");
      expect(contradictsNo?.type).toBe("choice");
    });

    it("handles WebAI Extension (__isPolyfill: true) without devTrialBackend", async () => {
      const availabilitySpy = vi.fn().mockResolvedValue("available");
      const createdOptions: DecisionCreateOptions[] = [];

      const webAiPolyfill: DecisionModelStatic & { __isPolyfill: boolean } = {
        __isPolyfill: true,
        availability: availabilitySpy,
        async create(opts) {
          createdOptions.push(opts);
          return {
            async decide() {
              return makeRawDecision();
            },
            destroy() {},
          };
        },
      };

      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: webAiPolyfill,
      });

      const check = await adapter.checkAvailability();
      expect(check.readiness).toBe("ready");
      expect(check.backend.kind).toBe("native");
      expect(check.backend.badgeLabel).toBe("Native DecisionModel");
      expect(check.backend.modelId).toBe("webai-polyfill");
      expect(availabilitySpy).toHaveBeenCalledTimes(1);
      const availArg = availabilitySpy.mock
        .calls[0][0] as DecisionAvailabilityOptions;
      expect(availArg.expectedInputs).toEqual([
        { type: "text", languages: ["en"] },
      ]);
      expect(availArg.devTrialBackend).toBeUndefined();

      await adapter.createRoundSession(["Works as an astronomer"]);
      expect(createdOptions).toHaveLength(1);
      expect(createdOptions[0].devTrialBackend).toBeUndefined();
      const supportsYes = createdOptions[0].questions.find(
        (q) => q.id === "supports_yes"
      );
      expect(supportsYes?.type).toBe("boolean");
    });
  });

  describe("bi-encoder atomic schema limits and anchor-calibrated normalization", () => {
    it("keeps every character's bi-encoder schema within Chrome Canary Blink IDL limits", () => {
      for (const char of CHARACTERS) {
        const schema = buildRoundSchema(char.facts, { variant: "bi-encoder" });
        expect(schema.questions.length).toBeGreaterThanOrEqual(1);
        expect(schema.questions.length).toBeLessThanOrEqual(16);

        for (const q of schema.questions) {
          if (q.type === "choice") {
            expect(q.options.length).toBeGreaterThanOrEqual(2);
            expect(q.options.length).toBeLessThanOrEqual(26);
          }
        }

        const supportsYes = schema.questions.find(
          (q) => q.id === "supports_yes"
        );
        const contradictsNo = schema.questions.find(
          (q) => q.id === "contradicts_no"
        );
        expect(supportsYes?.type).toBe("choice");
        expect(contradictsNo?.type).toBe("choice");
        if (supportsYes?.type === "choice" && contradictsNo?.type === "choice") {
          expect(supportsYes.prompt).toBe(contradictsNo.prompt);
          expect(
            supportsYes.options.some((o) => o.label === BI_ENCODER_ANCHOR_LABEL)
          ).toBe(true);
          expect(
            contradictsNo.options.some(
              (o) => o.label === BI_ENCODER_ANCHOR_LABEL
            )
          ).toBe(true);
        }
      }
    });

    it("normalizes atomic bi-encoder option distributions into Yes, No, and Not enough information", async () => {
      const kindDecision = {
        id: "question_kind",
        label: "trait_question",
        confidence: 0.9,
        probabilities: {
          trait_question: 0.9,
          identity_guess: 0.05,
          needs_rephrase: 0.05,
        },
      };

      const yesNormalized = validateRawRoundDecision(
        normalizeBiEncoderDecision({
          question_kind: kindDecision,
          supports_yes: {
            id: "supports_yes",
            label: "yes_gender_man",
            confidence: 0.72,
            probabilities: {
              [BI_ENCODER_ANCHOR_LABEL]: 0.02,
              yes_gender_man: 0.72,
              no_gender_woman: 0.08,
            },
          },
          contradicts_no: {
            id: "contradicts_no",
            label: BI_ENCODER_ANCHOR_LABEL,
            confidence: 0.25,
            probabilities: {
              [BI_ENCODER_ANCHOR_LABEL]: 0.25,
              unk_hobby_hiking: 0.1,
            },
          },
        })
      );
      expect(evaluateDecisionPolicy(yesNormalized)).toMatchObject({
        outcome: "answered",
        answer: "Yes",
      });

      const noNormalized = validateRawRoundDecision(
        normalizeBiEncoderDecision({
          question_kind: kindDecision,
          supports_yes: {
            id: "supports_yes",
            label: "no_job_baker",
            confidence: 0.68,
            probabilities: {
              [BI_ENCODER_ANCHOR_LABEL]: 0.03,
              yes_job_illustrator: 0.02,
              no_job_baker: 0.68,
            },
          },
          contradicts_no: {
            id: "contradicts_no",
            label: BI_ENCODER_ANCHOR_LABEL,
            confidence: 0.3,
            probabilities: {
              [BI_ENCODER_ANCHOR_LABEL]: 0.3,
              no_pet_any: 0.05,
            },
          },
        })
      );
      expect(evaluateDecisionPolicy(noNormalized)).toMatchObject({
        outcome: "answered",
        answer: "No",
      });

      const unknownNormalized = validateRawRoundDecision(
        normalizeBiEncoderDecision({
          question_kind: kindDecision,
          supports_yes: {
            id: "supports_yes",
            label: BI_ENCODER_ANCHOR_LABEL,
            confidence: 0.4,
            probabilities: {
              [BI_ENCODER_ANCHOR_LABEL]: 0.4,
              yes_job_illustrator: 0.02,
              no_job_baker: 0.03,
            },
          },
          contradicts_no: {
            id: "contradicts_no",
            label: "unk_hobby_sourdough",
            confidence: 0.65,
            probabilities: {
              [BI_ENCODER_ANCHOR_LABEL]: 0.08,
              unk_hobby_sourdough: 0.65,
              no_hobby_camping: 0.02,
            },
          },
        })
      );
      expect(evaluateDecisionPolicy(unknownNormalized)).toMatchObject({
        outcome: "unknown",
        answer: "Not enough information",
      });

      // End-to-end through createRoundSession when native backend is embedding-gemma-v1
      const nativeMock: DecisionModelStatic = {
        async availability(opts) {
          return opts?.devTrialBackend === "embedding-gemma-v1"
            ? "available"
            : "unavailable";
        },
        async create() {
          return {
            async decide() {
              return {
                question_kind: kindDecision,
                supports_yes: {
                  id: "supports_yes",
                  label: BI_ENCODER_ANCHOR_LABEL,
                  confidence: 0.3,
                  probabilities: {
                    [BI_ENCODER_ANCHOR_LABEL]: 0.3,
                    yes_gender_man: 0.02,
                  },
                },
                contradicts_no: {
                  id: "contradicts_no",
                  label: "no_pet_any",
                  confidence: 0.78,
                  probabilities: {
                    [BI_ENCODER_ANCHOR_LABEL]: 0.04,
                    no_pet_any: 0.78,
                    yes_hobby_chess: 0.02,
                  },
                },
              };
            },
            destroy() {},
          };
        },
      };

      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      await adapter.checkAvailability();
      const session = await adapter.createRoundSession([
        "Is a man (male)",
        "Explicitly owns no pets",
      ]);
      const { raw } = await session.decide("Do they own a pet?");
      expect(raw.contradicts_no.label).toBe("true");
      expect(raw.supports_yes.label).toBe("false");
    });

    it("aggregates atomic kind_* question_kind options into canonical buckets while preserving standard 3-label mocks", () => {
      const atomicTraitKind = validateRawRoundDecision(
        normalizeBiEncoderDecision({
          question_kind: {
            id: "question_kind",
            label: "kind_trait_job_a",
            confidence: 0.62,
            probabilities: {
              kind_trait_gender: 0.04,
              kind_trait_job_a: 0.62,
              kind_trait_job_b: 0.1,
              kind_identity_secret: 0.08,
              kind_identity_direct: 0.05,
              kind_rephrase_open: 0.06,
              kind_rephrase_compound: 0.05,
            },
          },
          supports_yes: {
            id: "supports_yes",
            label: BI_ENCODER_ANCHOR_LABEL,
            confidence: 0.4,
            probabilities: {
              [BI_ENCODER_ANCHOR_LABEL]: 0.4,
              no_job_translator: 0.85,
            },
          },
          contradicts_no: {
            id: "contradicts_no",
            label: BI_ENCODER_ANCHOR_LABEL,
            confidence: 0.35,
            probabilities: {
              [BI_ENCODER_ANCHOR_LABEL]: 0.35,
              yes_hobby_chess: 0.02,
            },
          },
        })
      );
      expect(atomicTraitKind.question_kind.label).toBe("trait_question");
      expect(atomicTraitKind.question_kind.confidence).toBeCloseTo(0.8158, 4);
      expect(atomicTraitKind.contradicts_no.label).toBe("true");
      expect(evaluateDecisionPolicy(atomicTraitKind)).toMatchObject({
        outcome: "answered",
        answer: "No",
      });

      const atomicIdentityKind = validateRawRoundDecision(
        normalizeBiEncoderDecision({
          question_kind: {
            id: "question_kind",
            label: "kind_identity_secret",
            confidence: 0.7,
            probabilities: {
              kind_trait_gender: 0.05,
              kind_identity_secret: 0.7,
              kind_identity_direct: 0.15,
              kind_rephrase_open: 0.1,
            },
          },
          supports_yes: {
            id: "supports_yes",
            label: "false",
            confidence: 0.9,
            probabilities: { true: 0.1, false: 0.9 },
          },
          contradicts_no: {
            id: "contradicts_no",
            label: "false",
            confidence: 0.9,
            probabilities: { true: 0.1, false: 0.9 },
          },
        })
      );
      expect(atomicIdentityKind.question_kind.label).toBe("identity_guess");
      expect(atomicIdentityKind.question_kind.confidence).toBeCloseTo(
        0.7 / (0.05 + 0.7 + 0.1),
        4
      );
      expect(evaluateDecisionPolicy(atomicIdentityKind)).toMatchObject({
        outcome: "clarification",
        message:
          "To guess a specific character, select their card and confirm 'Make my guess'.",
      });

      const atomicRephraseKind = validateRawRoundDecision(
        normalizeBiEncoderDecision({
          question_kind: {
            id: "question_kind",
            label: "kind_rephrase_compound",
            confidence: 0.55,
            probabilities: {
              kind_trait_schedule: 0.15,
              kind_identity_direct: 0.1,
              kind_rephrase_compound: 0.55,
              kind_rephrase_open: 0.2,
            },
          },
          supports_yes: {
            id: "supports_yes",
            label: "false",
            confidence: 0.9,
            probabilities: { true: 0.1, false: 0.9 },
          },
          contradicts_no: {
            id: "contradicts_no",
            label: "false",
            confidence: 0.9,
            probabilities: { true: 0.1, false: 0.9 },
          },
        })
      );
      expect(atomicRephraseKind.question_kind.label).toBe("needs_rephrase");
      expect(evaluateDecisionPolicy(atomicRephraseKind)).toMatchObject({
        outcome: "clarification",
        message:
          "Ask one yes/no question at a time about written biographical traits.",
      });
    });
  });
});
