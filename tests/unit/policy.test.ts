import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  MAX_QUESTION_LENGTH,
  POLICY_MESSAGES,
  createErrorPolicyDecision,
  evaluateDecisionPolicy,
  validatePlayerInput,
} from "../../src/engine/policy.ts";
import type {
  BooleanLabel,
  QuestionKindLabel,
  RawRoundDecision,
} from "../../src/engine/types.ts";
import {
  EVAL_FIXTURES,
  type EvalCategory,
  type EvalSplit,
} from "../../src/eval/fixtures.ts";

function createMockRawDecision(overrides?: {
  kindLabel?: QuestionKindLabel;
  kindConfidence?: number;
  supportsYesLabel?: BooleanLabel;
  supportsYesConfidence?: number;
  contradictsNoLabel?: BooleanLabel;
  contradictsNoConfidence?: number;
}): RawRoundDecision {
  const kindLabel = overrides?.kindLabel ?? "trait_question";
  const kindConfidence = overrides?.kindConfidence ?? 0.85;
  const supportsYesLabel = overrides?.supportsYesLabel ?? "false";
  const supportsYesConfidence = overrides?.supportsYesConfidence ?? 0.85;
  const contradictsNoLabel = overrides?.contradictsNoLabel ?? "false";
  const contradictsNoConfidence = overrides?.contradictsNoConfidence ?? 0.85;

  return {
    question_kind: {
      id: "question_kind",
      label: kindLabel,
      confidence: kindConfidence,
      probabilities: {
        trait_question: kindLabel === "trait_question" ? kindConfidence : 0.05,
        identity_guess: kindLabel === "identity_guess" ? kindConfidence : 0.05,
        needs_rephrase: kindLabel === "needs_rephrase" ? kindConfidence : 0.05,
      },
    },
    supports_yes: {
      id: "supports_yes",
      label: supportsYesLabel,
      confidence: supportsYesConfidence,
      probabilities: {
        true: supportsYesLabel === "true" ? supportsYesConfidence : 1 - supportsYesConfidence,
        false: supportsYesLabel === "false" ? supportsYesConfidence : 1 - supportsYesConfidence,
      },
    },
    contradicts_no: {
      id: "contradicts_no",
      label: contradictsNoLabel,
      confidence: contradictsNoConfidence,
      probabilities: {
        true: contradictsNoLabel === "true" ? contradictsNoConfidence : 1 - contradictsNoConfidence,
        false: contradictsNoLabel === "false" ? contradictsNoConfidence : 1 - contradictsNoConfidence,
      },
    },
  };
}

describe("Policy Constants", () => {
  it("defines MAX_QUESTION_LENGTH as 300", () => {
    expect(MAX_QUESTION_LENGTH).toBe(300);
  });

  it("defines default thresholds calibrated on the tuning split", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      questionKindThreshold: 0.5,
      factThreshold: 0.5,
    });
  });

  it("contains all required exact policy messages", () => {
    expect(POLICY_MESSAGES.invalidInput).toBe(
      "Enter a single yes/no question up to 300 characters."
    );
    expect(POLICY_MESSAGES.lowQuestionKindConfidence).toBe(
      "I couldn't interpret that reliably—please rephrase as one yes/no biography question."
    );
    expect(POLICY_MESSAGES.identityGuess).toBe(
      "To guess a specific character, select their card and confirm 'Make my guess'."
    );
    expect(POLICY_MESSAGES.needsRephrase).toBe(
      "Ask one yes/no question at a time about written biographical traits."
    );
    expect(POLICY_MESSAGES.lowFactConfidenceOrConflict).toBe(
      "I'm not confident enough to answer that phrasing—try asking more directly."
    );
    expect(POLICY_MESSAGES.yes).toBe("Yes");
    expect(POLICY_MESSAGES.no).toBe("No");
    expect(POLICY_MESSAGES.unknown).toBe("Not enough information");
    expect(POLICY_MESSAGES.engineError).toBe(
      "The decision engine returned an invalid response or encountered an error. Your question was kept—please retry."
    );
  });
});

describe("validatePlayerInput", () => {
  it("rejects an empty string", () => {
    const result = validatePlayerInput("");
    expect(result).toEqual({
      valid: false,
      decision: {
        outcome: "rejection",
        message: POLICY_MESSAGES.invalidInput,
        countsAsQuestion: false,
      },
    });
  });

  it("rejects whitespace-only input", () => {
    const result = validatePlayerInput("   \t  \n  ");
    expect(result).toEqual({
      valid: false,
      decision: {
        outcome: "rejection",
        message: POLICY_MESSAGES.invalidInput,
        countsAsQuestion: false,
      },
    });
  });

  it("accepts a string of exactly 300 characters", () => {
    const exact300 = "a".repeat(300);
    const result = validatePlayerInput(exact300);
    expect(result).toEqual({
      valid: true,
      trimmed: exact300,
    });
  });

  it("rejects a string of 301 characters", () => {
    const length301 = "a".repeat(301);
    const result = validatePlayerInput(length301);
    expect(result).toEqual({
      valid: false,
      decision: {
        outcome: "rejection",
        message: POLICY_MESSAGES.invalidInput,
        countsAsQuestion: false,
      },
    });
  });

  it("trims outer whitespace while preserving inner whitespace", () => {
    const result = validatePlayerInput("   Does this person work at night?   ");
    expect(result).toEqual({
      valid: true,
      trimmed: "Does this person work at night?",
    });
  });

  it("accepts input that exceeds 300 chars before trimming but is <= 300 after trimming", () => {
    const padded = `   ${"x".repeat(300)}   `;
    const result = validatePlayerInput(padded);
    expect(result).toEqual({
      valid: true,
      trimmed: "x".repeat(300),
    });
  });
});

describe("evaluateDecisionPolicy", () => {
  describe("question_kind confidence gating", () => {
    it("gates low question_kind confidence BEFORE checking trait_question intent", () => {
      const decision = createMockRawDecision({
        kindLabel: "trait_question",
        kindConfidence: 0.49,
        supportsYesLabel: "true",
        supportsYesConfidence: 0.99,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.lowQuestionKindConfidence,
        countsAsQuestion: false,
      });
    });

    it("gates low question_kind confidence BEFORE checking identity_guess intent", () => {
      const decision = createMockRawDecision({
        kindLabel: "identity_guess",
        kindConfidence: 0.45,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.lowQuestionKindConfidence,
        countsAsQuestion: false,
      });
    });

    it("gates low question_kind confidence BEFORE checking needs_rephrase intent", () => {
      const decision = createMockRawDecision({
        kindLabel: "needs_rephrase",
        kindConfidence: 0.4,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.lowQuestionKindConfidence,
        countsAsQuestion: false,
      });
    });

    it("respects custom questionKindThreshold", () => {
      const decision = createMockRawDecision({
        kindLabel: "trait_question",
        kindConfidence: 0.75,
        supportsYesLabel: "true",
        supportsYesConfidence: 0.9,
      });

      // Above default 0.6 -> answered
      expect(evaluateDecisionPolicy(decision).outcome).toBe("answered");

      // Below custom 0.8 -> clarification
      const customOutcome = evaluateDecisionPolicy(decision, {
        questionKindThreshold: 0.8,
        factThreshold: 0.6,
      });
      expect(customOutcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.lowQuestionKindConfidence,
        countsAsQuestion: false,
      });
    });
  });

  describe("intent routing for confident non-trait questions", () => {
    it("routes confident identity_guess to clarification with exact message", () => {
      const decision = createMockRawDecision({
        kindLabel: "identity_guess",
        kindConfidence: 0.8,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.identityGuess,
        countsAsQuestion: false,
      });
    });

    it("routes confident needs_rephrase to clarification with exact message", () => {
      const decision = createMockRawDecision({
        kindLabel: "needs_rephrase",
        kindConfidence: 0.85,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.needsRephrase,
        countsAsQuestion: false,
      });
    });
  });

  describe("fact confidence gating", () => {
    it("returns clarification when supports_yes confidence is below threshold", () => {
      const decision = createMockRawDecision({
        kindLabel: "trait_question",
        kindConfidence: 0.9,
        supportsYesLabel: "true",
        supportsYesConfidence: 0.48,
        contradictsNoLabel: "false",
        contradictsNoConfidence: 0.9,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.lowFactConfidenceOrConflict,
        countsAsQuestion: false,
      });
    });

    it("returns clarification when contradicts_no confidence is below threshold", () => {
      const decision = createMockRawDecision({
        kindLabel: "trait_question",
        kindConfidence: 0.9,
        supportsYesLabel: "false",
        supportsYesConfidence: 0.9,
        contradictsNoLabel: "true",
        contradictsNoConfidence: 0.45,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.lowFactConfidenceOrConflict,
        countsAsQuestion: false,
      });
    });

    it("returns clarification when both fact confidences are below threshold", () => {
      const decision = createMockRawDecision({
        kindLabel: "trait_question",
        kindConfidence: 0.9,
        supportsYesLabel: "false",
        supportsYesConfidence: 0.4,
        contradictsNoLabel: "false",
        contradictsNoConfidence: 0.45,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.lowFactConfidenceOrConflict,
        countsAsQuestion: false,
      });
    });

    it("respects custom factThreshold", () => {
      const decision = createMockRawDecision({
        kindLabel: "trait_question",
        kindConfidence: 0.9,
        supportsYesLabel: "true",
        supportsYesConfidence: 0.65,
        contradictsNoLabel: "false",
        contradictsNoConfidence: 0.7,
      });

      // Default threshold is 0.6 -> passes
      expect(evaluateDecisionPolicy(decision).outcome).toBe("answered");

      // Custom threshold of 0.75 -> fails supports_yes
      const customOutcome = evaluateDecisionPolicy(decision, {
        questionKindThreshold: 0.6,
        factThreshold: 0.75,
      });
      expect(customOutcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.lowFactConfidenceOrConflict,
        countsAsQuestion: false,
      });
    });
  });

  describe("factual boolean evaluation", () => {
    it("answers Yes when supports_yes is true and contradicts_no is false", () => {
      const decision = createMockRawDecision({
        kindLabel: "trait_question",
        kindConfidence: 0.9,
        supportsYesLabel: "true",
        supportsYesConfidence: 0.92,
        contradictsNoLabel: "false",
        contradictsNoConfidence: 0.88,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "answered",
        answer: "Yes",
        message: POLICY_MESSAGES.yes,
        countsAsQuestion: true,
      });
    });

    it("answers No when supports_yes is false and contradicts_no is true", () => {
      const decision = createMockRawDecision({
        kindLabel: "trait_question",
        kindConfidence: 0.9,
        supportsYesLabel: "false",
        supportsYesConfidence: 0.85,
        contradictsNoLabel: "true",
        contradictsNoConfidence: 0.95,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "answered",
        answer: "No",
        message: POLICY_MESSAGES.no,
        countsAsQuestion: true,
      });
    });

    it("answers Not enough information when both supports_yes and contradicts_no are false", () => {
      const decision = createMockRawDecision({
        kindLabel: "trait_question",
        kindConfidence: 0.9,
        supportsYesLabel: "false",
        supportsYesConfidence: 0.8,
        contradictsNoLabel: "false",
        contradictsNoConfidence: 0.85,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "unknown",
        answer: "Not enough information",
        message: POLICY_MESSAGES.unknown,
        countsAsQuestion: true,
      });
    });

    it("returns clarification on conflicting true/true booleans", () => {
      const decision = createMockRawDecision({
        kindLabel: "trait_question",
        kindConfidence: 0.95,
        supportsYesLabel: "true",
        supportsYesConfidence: 0.9,
        contradictsNoLabel: "true",
        contradictsNoConfidence: 0.9,
      });

      const outcome = evaluateDecisionPolicy(decision);
      expect(outcome).toEqual({
        outcome: "clarification",
        message: POLICY_MESSAGES.lowFactConfidenceOrConflict,
        countsAsQuestion: false,
      });
    });
  });
});

describe("createErrorPolicyDecision", () => {
  it("returns error outcome with engineError message and countsAsQuestion=false", () => {
    const decision = createErrorPolicyDecision();
    expect(decision).toEqual({
      outcome: "error",
      message: POLICY_MESSAGES.engineError,
      countsAsQuestion: false,
    });
  });
});

describe("EVAL_FIXTURES invariants", () => {
  it("contains exactly 64 total fixtures", () => {
    expect(EVAL_FIXTURES).toHaveLength(64);
  });

  it("has exactly 28 tuning and 36 held_out fixtures", () => {
    const tuning = EVAL_FIXTURES.filter((f) => f.split === "tuning");
    const heldOut = EVAL_FIXTURES.filter((f) => f.split === "held_out");
    expect(tuning).toHaveLength(28);
    expect(heldOut).toHaveLength(36);
  });

  it("covers all 7 categories in both tuning and held_out splits", () => {
    const expectedCategories: EvalCategory[] = [
      "yes",
      "no",
      "unknown",
      "paraphrase",
      "explicit_negation",
      "compound_or_ambiguous",
      "identity_or_injection",
    ];

    for (const split of ["tuning", "held_out"] as EvalSplit[]) {
      const splitFixtures = EVAL_FIXTURES.filter((f) => f.split === split);
      const categories = new Set(splitFixtures.map((f) => f.category));
      for (const cat of expectedCategories) {
        expect(categories.has(cat)).toBe(true);
      }
    }
  });

  it("has unique IDs for every fixture", () => {
    const ids = EVAL_FIXTURES.map((f) => f.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("covers all 12 characters across fixtures", () => {
    const allCharacters = [
      "nora",
      "milo",
      "ada",
      "theo",
      "priya",
      "sam",
      "elena",
      "omar",
      "lin",
      "mateo",
      "clara",
      "jun",
    ];
    const present = new Set<string>(EVAL_FIXTURES.map((f) => f.characterId));
    for (const char of allCharacters) {
      expect(present.has(char)).toBe(true);
    }
  });

  it("has consistent answers and outcomes for each fixture", () => {
    for (const f of EVAL_FIXTURES) {
      if (f.expectedOutcome === "answered") {
        expect(["Yes", "No"]).toContain(f.expectedAnswer);
        expect(["true", "false"]).toContain(f.expectedSupportsYes);
        expect(["true", "false"]).toContain(f.expectedContradictsNo);
        if (f.expectedAnswer === "Yes") {
          expect(f.expectedSupportsYes).toBe("true");
          expect(f.expectedContradictsNo).toBe("false");
        } else {
          expect(f.expectedSupportsYes).toBe("false");
          expect(f.expectedContradictsNo).toBe("true");
        }
      } else if (f.expectedOutcome === "unknown") {
        expect(f.expectedAnswer).toBe("Not enough information");
        expect(f.expectedSupportsYes).toBe("false");
        expect(f.expectedContradictsNo).toBe("false");
      } else if (f.expectedOutcome === "clarification") {
        expect(["identity_guess", "needs_rephrase"]).toContain(
          f.expectedQuestionKind
        );
      }
    }
  });
});
