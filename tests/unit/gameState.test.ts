import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../../src/data/characters.ts";
import { createDecisionEngineAdapter } from "../../src/engine/decisionAdapter.ts";
import { STARTER_PROMPTS, useGameState } from "../../src/state/gameState.ts";
import {
  createMockDecisionModelStatic,
  makeRawDecision,
} from "../helpers/mockDecisionModel.ts";

describe("useGameState hook", () => {
  describe("initialization and availability check", () => {
    it("starts in idle uninitialized state and updates on mount", async () => {
      const nativeMock = createMockDecisionModelStatic({
        initialAvailability: "available",
      });
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });

      const { result } = renderHook(() => useGameState({ adapter }));

      // Initial synchronous values
      expect(result.current.roundStatus).toBe("idle");
      expect(result.current.secretCharacter).toBeNull();
      expect(result.current.guessedCharacterId).toBeNull();
      expect(result.current.roundSchema).toBeNull();
      expect(result.current.sessionCreateDurationMs).toBeNull();
      expect(result.current.eliminatedIds.size).toBe(0);
      expect(result.current.questionInput).toBe("");
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.questionCount).toBe(0);
      expect(result.current.requestNumber).toBe(0);
      expect(result.current.turns).toEqual([]);
      expect(result.current.downloadProgress).toBeNull();
      expect(result.current.engineError).toBeNull();

      // Mount availability check finishes
      await waitFor(() => {
        expect(result.current.engineState).toBe("ready");
      });
      expect(result.current.backend.kind).toBe("native");
      expect(result.current.backend.badgeLabel).toBe("Native DecisionModel");
    });

    it("sets error state when checkAvailability rejects on mount", async () => {
      const adapter = {
        checkAvailability: () => Promise.reject(new Error("GPU crashed")),
        initialize: () => Promise.reject(new Error("GPU crashed")),
        createRoundSession: () => Promise.reject(new Error("GPU crashed")),
        getBackendIdentity: () => ({
          kind: "unavailable" as const,
          badgeLabel: "Unavailable",
        }),
      };

      const { result } = renderHook(() => useGameState({ adapter }));

      await waitFor(() => {
        expect(result.current.engineState).toBe("error");
      });
      expect(result.current.engineError).toBe("GPU crashed");
    });
  });

  describe("anonymous schema check", () => {
    it("excludes secret character id and name from roundSchema prompts and options", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      const secret = CHARACTERS.find((c) => c.id === "elena")!;

      const { result } = renderHook(() =>
        useGameState({
          adapter,
          pickSecretCharacter: () => secret,
        })
      );

      await waitFor(() => expect(result.current.engineState).toBe("ready"));

      await act(async () => {
        await result.current.startNewGame();
      });

      expect(result.current.roundStatus).toBe("playing");
      expect(result.current.secretCharacter?.id).toBe("elena");
      expect(result.current.roundSchema).not.toBeNull();

      const schemaStr = JSON.stringify(result.current.roundSchema).toLowerCase();
      expect(schemaStr).not.toContain("elena");

      // Verify the fact prompts only contain the serialized facts, never the secret id/name
      const supportsYesQ = result.current.roundSchema!.questions.find(
        (q) => q.id === "supports_yes"
      )!;
      const contradictsNoQ = result.current.roundSchema!.questions.find(
        (q) => q.id === "contradicts_no"
      )!;
      expect(supportsYesQ.prompt).not.toContain("Elena");
      expect(supportsYesQ.prompt).not.toContain("elena");
      expect(contradictsNoQ.prompt).not.toContain("Elena");
      expect(contradictsNoQ.prompt).not.toContain("elena");

      for (const fact of secret.facts) {
        expect(supportsYesQ.prompt).toContain(fact);
        expect(contradictsNoQ.prompt).toContain(fact);
      }
    });
  });

  describe("pre-inference validation (empty and >300 chars)", () => {
    it("rejects empty and whitespace questions without calling adapter or incrementing requestNumber", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      const { result } = renderHook(() => useGameState({ adapter }));
      await waitFor(() => expect(result.current.engineState).toBe("ready"));

      await act(async () => {
        await result.current.startNewGame();
      });

      act(() => {
        result.current.setQuestionInput("    ");
      });

      await act(async () => {
        await result.current.submitQuestion();
      });

      expect(result.current.requestNumber).toBe(0);
      expect(result.current.questionCount).toBe(0);
      expect(result.current.turns).toHaveLength(1);
      expect(result.current.turns[0].requestNumber).toBe(0);
      expect(result.current.turns[0].questionNumber).toBeNull();
      expect(result.current.turns[0].policy.outcome).toBe("rejection");
      expect(result.current.turns[0].raw).toBeNull();
      expect(result.current.turns[0].inferenceDurationMs).toBeNull();
      expect(result.current.questionInput).toBe("    ");
      expect(result.current.latestAnnouncement).toContain("Enter a single yes/no question up to 300 characters.");
    });

    it("rejects questions longer than 300 characters and retains input text", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      const { result } = renderHook(() => useGameState({ adapter }));
      await waitFor(() => expect(result.current.engineState).toBe("ready"));

      await act(async () => {
        await result.current.startNewGame();
      });

      const longQuestion = "Does this suspect work ".padEnd(301, "x");
      act(() => {
        result.current.setQuestionInput(longQuestion);
      });

      await act(async () => {
        await result.current.submitQuestion();
      });

      expect(result.current.requestNumber).toBe(0);
      expect(result.current.questionCount).toBe(0);
      expect(result.current.turns).toHaveLength(1);
      expect(result.current.turns[0].policy.outcome).toBe("rejection");
      expect(result.current.questionInput).toBe(longQuestion);
    });
  });

  describe("questionCount vs requestNumber accounting across outcomes", () => {
    it("handles Yes, No, Not enough information, clarification, and error correctly", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      const { result } = renderHook(() => useGameState({ adapter }));
      await waitFor(() => expect(result.current.engineState).toBe("ready"));

      await act(async () => {
        await result.current.startNewGame();
      });

      // 1. Yes answer -> countsAsQuestion: true
      nativeMock.setDecideHandler(() =>
        makeRawDecision({
          kindLabel: "trait_question",
          kindConfidence: 0.9,
          supportsYesLabel: "true",
          supportsYesConfidence: 0.9,
          contradictsNoLabel: "false",
          contradictsNoConfidence: 0.9,
        })
      );
      act(() => {
        result.current.setQuestionInput("Do they work at night?");
      });
      await act(async () => {
        await result.current.submitQuestion();
      });
      expect(result.current.requestNumber).toBe(1);
      expect(result.current.questionCount).toBe(1);
      expect(result.current.turns[0].questionNumber).toBe(1);
      expect(result.current.turns[0].policy.answer).toBe("Yes");
      expect(result.current.questionInput).toBe("");
      expect(result.current.latestAnnouncement).toBe("Yes");

      // 2. No answer -> countsAsQuestion: true
      nativeMock.setDecideHandler(() =>
        makeRawDecision({
          kindLabel: "trait_question",
          kindConfidence: 0.9,
          supportsYesLabel: "false",
          supportsYesConfidence: 0.9,
          contradictsNoLabel: "true",
          contradictsNoConfidence: 0.9,
        })
      );
      act(() => {
        result.current.setQuestionInput("Do they bake sourdough bread?");
      });
      await act(async () => {
        await result.current.submitQuestion();
      });
      expect(result.current.requestNumber).toBe(2);
      expect(result.current.questionCount).toBe(2);
      expect(result.current.turns[1].questionNumber).toBe(2);
      expect(result.current.turns[1].policy.answer).toBe("No");
      expect(result.current.questionInput).toBe("");
      expect(result.current.latestAnnouncement).toBe("No");

      // 3. Not enough information -> countsAsQuestion: true
      nativeMock.setDecideHandler(() =>
        makeRawDecision({
          kindLabel: "trait_question",
          kindConfidence: 0.9,
          supportsYesLabel: "false",
          supportsYesConfidence: 0.9,
          contradictsNoLabel: "false",
          contradictsNoConfidence: 0.9,
        })
      );
      act(() => {
        result.current.setQuestionInput("Do they enjoy astronomy?");
      });
      await act(async () => {
        await result.current.submitQuestion();
      });
      expect(result.current.requestNumber).toBe(3);
      expect(result.current.questionCount).toBe(3);
      expect(result.current.turns[2].questionNumber).toBe(3);
      expect(result.current.turns[2].policy.answer).toBe("Not enough information");
      expect(result.current.questionInput).toBe("");
      expect(result.current.latestAnnouncement).toBe("Not enough information");

      // 4. Clarification (e.g. needs_rephrase) -> countsAsQuestion: false
      nativeMock.setDecideHandler(() =>
        makeRawDecision({
          kindLabel: "needs_rephrase",
          kindConfidence: 0.95,
        })
      );
      act(() => {
        result.current.setQuestionInput("Do they work at night and ride a bike?");
      });
      await act(async () => {
        await result.current.submitQuestion();
      });
      expect(result.current.requestNumber).toBe(4);
      expect(result.current.questionCount).toBe(3); // untouched
      expect(result.current.turns[3].questionNumber).toBeNull();
      expect(result.current.turns[3].policy.outcome).toBe("clarification");
      expect(result.current.questionInput).toBe("Do they work at night and ride a bike?"); // retained

      // 5. Error (engine returns invalid structure) -> countsAsQuestion: false
      nativeMock.setDecideHandler(() => ({ bad: "response" }));
      act(() => {
        result.current.setQuestionInput("Do they play chess?");
      });
      await act(async () => {
        await result.current.submitQuestion();
      });
      expect(result.current.requestNumber).toBe(5);
      expect(result.current.questionCount).toBe(3); // untouched
      expect(result.current.turns[4].questionNumber).toBeNull();
      expect(result.current.turns[4].policy.outcome).toBe("error");
      expect(result.current.questionInput).toBe("Do they play chess?"); // retained
      expect(result.current.latestAnnouncement).toContain("The decision engine returned an invalid response");
    });
  });

  describe("starter chip submission with overrideText", () => {
    it("clears questionInput on accepted answer and populates questionInput on clarification", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      const { result } = renderHook(() => useGameState({ adapter }));
      await waitFor(() => expect(result.current.engineState).toBe("ready"));

      await act(async () => {
        await result.current.startNewGame();
      });

      // 1. Starter prompt with accepted response
      nativeMock.setDecideHandler(() =>
        makeRawDecision({
          kindLabel: "trait_question",
          kindConfidence: 0.9,
          supportsYesLabel: "true",
          supportsYesConfidence: 0.9,
        })
      );
      await act(async () => {
        await result.current.submitQuestion(STARTER_PROMPTS[0]);
      });
      expect(result.current.questionCount).toBe(1);
      expect(result.current.turns[0].playerQuestion).toBe(STARTER_PROMPTS[0]);
      expect(result.current.questionInput).toBe("");

      // 2. Starter prompt with clarification needed
      nativeMock.setDecideHandler(() =>
        makeRawDecision({
          kindLabel: "needs_rephrase",
          kindConfidence: 0.9,
        })
      );
      await act(async () => {
        await result.current.submitQuestion(STARTER_PROMPTS[1]);
      });
      expect(result.current.questionCount).toBe(1);
      expect(result.current.questionInput).toBe(STARTER_PROMPTS[1]);
    });
  });

  describe("card elimination and restoration", () => {
    it("toggles elimination, updates announcement, and blocks confirmGuess on eliminated card", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      const secret = CHARACTERS.find((c) => c.id === "nora")!;

      const { result } = renderHook(() =>
        useGameState({
          adapter,
          pickSecretCharacter: () => secret,
        })
      );
      await waitFor(() => expect(result.current.engineState).toBe("ready"));

      await act(async () => {
        await result.current.startNewGame();
      });

      // Eliminate Theo
      act(() => {
        result.current.toggleEliminate("theo");
      });
      expect(result.current.eliminatedIds.has("theo")).toBe(true);
      expect(result.current.latestAnnouncement).toBe(
        "Theo eliminated. 11 suspects remaining."
      );

      // Attempt guess on eliminated Theo -> BLOCKED
      act(() => {
        result.current.confirmGuess("theo");
      });
      expect(result.current.roundStatus).toBe("playing");
      expect(result.current.guessedCharacterId).toBeNull();

      // Restore Theo
      act(() => {
        result.current.toggleEliminate("theo");
      });
      expect(result.current.eliminatedIds.has("theo")).toBe(false);
      expect(result.current.latestAnnouncement).toBe(
        "Theo restored. 12 suspects remaining."
      );
    });
  });

  describe("round outcomes ('won' and 'lost')", () => {
    it("transitions to won on correct guess, naming secret character and question count", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      const secret = CHARACTERS.find((c) => c.id === "nora")!;

      const { result } = renderHook(() =>
        useGameState({
          adapter,
          pickSecretCharacter: () => secret,
        })
      );
      await waitFor(() => expect(result.current.engineState).toBe("ready"));

      await act(async () => {
        await result.current.startNewGame();
      });

      // Ask 1 question first
      nativeMock.setDecideHandler(() => makeRawDecision());
      await act(async () => {
        await result.current.submitQuestion(STARTER_PROMPTS[0]);
      });
      expect(result.current.questionCount).toBe(1);

      // Guess correctly
      act(() => {
        result.current.confirmGuess("nora");
      });
      expect(result.current.roundStatus).toBe("won");
      expect(result.current.guessedCharacterId).toBe("nora");
      expect(result.current.latestAnnouncement).toContain("Correct!");
      expect(result.current.latestAnnouncement).toContain("Nora");
      expect(result.current.latestAnnouncement).toContain("1 question");
    });

    it("transitions to lost on incorrect guess, naming secret character and question count", async () => {
      const nativeMock = createMockDecisionModelStatic();
      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      const secret = CHARACTERS.find((c) => c.id === "nora")!;

      const { result } = renderHook(() =>
        useGameState({
          adapter,
          pickSecretCharacter: () => secret,
        })
      );
      await waitFor(() => expect(result.current.engineState).toBe("ready"));

      await act(async () => {
        await result.current.startNewGame();
      });

      // Guess incorrectly
      act(() => {
        result.current.confirmGuess("milo");
      });
      expect(result.current.roundStatus).toBe("lost");
      expect(result.current.guessedCharacterId).toBe("milo");
      expect(result.current.latestAnnouncement).toContain("Incorrect.");
      expect(result.current.latestAnnouncement).toContain("Nora");
      expect(result.current.latestAnnouncement).toContain("0 questions");
    });
  });

  describe("startNewGame mid-flight abort and session cleanup", () => {
    it("aborts in-flight decision, destroys previous session, and resets counters", async () => {
      const finishPendingRef = { current: null as (() => void) | null };
      const nativeMock = createMockDecisionModelStatic({
        decideHandler: (_input, opts) => {
          return new Promise((resolve, reject) => {
            finishPendingRef.current = () => resolve(makeRawDecision());
            opts?.signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError")
              );
            });
          });
        },
      });

      const adapter = createDecisionEngineAdapter({
        nativeDecisionModel: nativeMock,
      });
      const { result } = renderHook(() => useGameState({ adapter }));
      await waitFor(() => expect(result.current.engineState).toBe("ready"));

      await act(async () => {
        await result.current.startNewGame();
      });
      expect(result.current.roundStatus).toBe("playing");

      // Submit a question that remains pending
      act(() => {
        result.current.setQuestionInput("Do they work at night?");
      });
      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.submitQuestion();
      });
      expect(result.current.isSubmitting).toBe(true);

      // While in-flight, start a new game
      await act(async () => {
        await result.current.startNewGame();
      });

      // The old session was destroyed
      expect(nativeMock.destroyedCount).toBe(1);

      // State is freshly reset
      expect(result.current.roundStatus).toBe("playing");
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.turns).toEqual([]);
      expect(result.current.requestNumber).toBe(0);
      expect(result.current.questionCount).toBe(0);

      // Finish pending decide from old session: should NOT mutate new state
      if (finishPendingRef.current) {
        finishPendingRef.current();
      }
      await act(async () => {
        await submitPromise;
      });

      expect(result.current.turns).toEqual([]);
      expect(result.current.requestNumber).toBe(0);
      expect(result.current.questionCount).toBe(0);
    });
  });
});
