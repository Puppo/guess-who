import type {
  AppOutcome,
  PolicyDecision,
  PolicyThresholds,
  RawRoundDecision,
} from "./types.ts";

export type { AppOutcome };

export const MAX_QUESTION_LENGTH = 300;

export const DEFAULT_THRESHOLDS: PolicyThresholds = {
  questionKindThreshold: 0.5,
  factThreshold: 0.5,
};

export const POLICY_MESSAGES = {
  invalidInput: "Enter a single yes/no question up to 300 characters.",
  lowQuestionKindConfidence:
    "I couldn't interpret that reliably—please rephrase as one yes/no biography question.",
  identityGuess:
    "To guess a specific character, select their card and confirm 'Make my guess'.",
  needsRephrase:
    "Ask one yes/no question at a time about written biographical traits.",
  lowFactConfidenceOrConflict:
    "I'm not confident enough to answer that phrasing—try asking more directly.",
  yes: "Yes",
  no: "No",
  unknown: "Not enough information",
  engineError:
    "The decision engine returned an invalid response or encountered an error. Your question was kept—please retry.",
} as const;

export function validatePlayerInput(
  rawInput: string
): { valid: true; trimmed: string } | { valid: false; decision: PolicyDecision } {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_QUESTION_LENGTH) {
    return {
      valid: false,
      decision: {
        outcome: "rejection",
        message: POLICY_MESSAGES.invalidInput,
        countsAsQuestion: false,
      },
    };
  }
  return { valid: true, trimmed };
}

export function evaluateDecisionPolicy(
  raw: RawRoundDecision,
  thresholds: PolicyThresholds = DEFAULT_THRESHOLDS
): PolicyDecision {
  // Step 1: Low question_kind confidence gates before intent routing
  if (raw.question_kind.confidence < thresholds.questionKindThreshold) {
    return {
      outcome: "clarification",
      message: POLICY_MESSAGES.lowQuestionKindConfidence,
      countsAsQuestion: false,
    };
  }

  // Step 2: Route direct identity guess
  if (raw.question_kind.label === "identity_guess") {
    return {
      outcome: "clarification",
      message: POLICY_MESSAGES.identityGuess,
      countsAsQuestion: false,
    };
  }

  // Step 3: Route compound, ambiguous, or invalid questions needing rephrase
  if (raw.question_kind.label === "needs_rephrase") {
    return {
      outcome: "clarification",
      message: POLICY_MESSAGES.needsRephrase,
      countsAsQuestion: false,
    };
  }

  // Step 4: Check fact booleans confidence
  if (
    raw.supports_yes.confidence < thresholds.factThreshold ||
    raw.contradicts_no.confidence < thresholds.factThreshold
  ) {
    return {
      outcome: "clarification",
      message: POLICY_MESSAGES.lowFactConfidenceOrConflict,
      countsAsQuestion: false,
    };
  }

  // Step 5: Evaluate factual labels
  const supportsYes = raw.supports_yes.label === "true";
  const contradictsNo = raw.contradicts_no.label === "true";

  if (supportsYes && !contradictsNo) {
    return {
      outcome: "answered",
      answer: "Yes",
      message: POLICY_MESSAGES.yes,
      countsAsQuestion: true,
    };
  }

  if (!supportsYes && contradictsNo) {
    return {
      outcome: "answered",
      answer: "No",
      message: POLICY_MESSAGES.no,
      countsAsQuestion: true,
    };
  }

  if (!supportsYes && !contradictsNo) {
    return {
      outcome: "unknown",
      answer: "Not enough information",
      message: POLICY_MESSAGES.unknown,
      countsAsQuestion: true,
    };
  }

  // supportsYes && contradictsNo (conflict)
  return {
    outcome: "clarification",
    message: POLICY_MESSAGES.lowFactConfidenceOrConflict,
    countsAsQuestion: false,
  };
}

export function createErrorPolicyDecision(): PolicyDecision {
  return {
    outcome: "error",
    message: POLICY_MESSAGES.engineError,
    countsAsQuestion: false,
  };
}
