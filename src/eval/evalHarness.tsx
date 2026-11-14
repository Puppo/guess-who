import { getCharacterById, CHARACTERS } from "../data/characters.ts";
import { createDecisionEngineAdapter } from "../engine/decisionAdapter.ts";
import { SCHEMA_VERSION } from "../engine/schema.ts";
import type { BackendIdentity, RawRoundDecision } from "../engine/types.ts";
import { EVAL_FIXTURES, type EvalFixture, type EvalSplit } from "./fixtures.ts";

export type EvalCaseResult = {
  fixture: EvalFixture;
  raw: RawRoundDecision;
  inferenceDurationMs: number;
  createDurationMs: number;
};

export type EvalRunResult = {
  schemaVersion: string;
  backend: BackendIdentity;
  initDurationMs: number;
  warmupCount: number;
  userAgent: string;
  results: EvalCaseResult[];
};

declare global {
  interface Window {
    __GUESS_WHO_EVAL__?: {
      runSplit(
        split: EvalSplit | "all",
        options?: { warmups?: number }
      ): Promise<EvalRunResult>;
    };
  }
}

export function registerEvalHarness(): void {
  const adapter = createDecisionEngineAdapter();
  let initialized = false;
  let cachedInitDurationMs = 0;

  window.__GUESS_WHO_EVAL__ = {
    async runSplit(split, options = {}) {
      const warmupCount = options.warmups ?? 3;

      if (!initialized) {
        const availability = await adapter.checkAvailability();
        if (availability.readiness === "unavailable") {
          throw new Error(
            availability.backend.reason ?? "Decision engine unavailable."
          );
        }
        if (availability.readiness === "downloadable") {
          const init = await adapter.initialize();
          cachedInitDurationMs = init.initDurationMs;
        } else {
          cachedInitDurationMs = availability.initDurationMs ?? 0;
        }
        initialized = true;
      }

      if (warmupCount > 0) {
        const warmupSession = await adapter.createRoundSession(
          CHARACTERS[0].facts
        );
        const warmupPrompts = [
          "Does this person enjoy hiking?",
          "Does this person play chess?",
          "Is the secret person Nora?",
        ];
        for (let i = 0; i < warmupCount; i += 1) {
          await warmupSession.decide(warmupPrompts[i % warmupPrompts.length]);
        }
        warmupSession.destroy();
      }

      const selectedFixtures =
        split === "all"
          ? EVAL_FIXTURES
          : EVAL_FIXTURES.filter((item) => item.split === split);

      const byCharacter = new Map<string, EvalFixture[]>();
      for (const fixture of selectedFixtures) {
        const list = byCharacter.get(fixture.characterId) ?? [];
        list.push(fixture);
        byCharacter.set(fixture.characterId, list);
      }

      const results: EvalCaseResult[] = [];
      for (const [characterId, group] of byCharacter.entries()) {
        const character = getCharacterById(characterId);
        if (!character) {
          throw new Error(`Unknown character in fixture: ${characterId}`);
        }
        const session = await adapter.createRoundSession(character.facts);
        try {
          for (const fixture of group) {
            const { raw, inferenceDurationMs } = await session.decide(
              fixture.question
            );
            results.push({
              fixture,
              raw,
              inferenceDurationMs,
              createDurationMs: session.createDurationMs,
            });
          }
        } finally {
          session.destroy();
        }
      }

      return {
        schemaVersion: SCHEMA_VERSION,
        backend: adapter.getBackendIdentity(),
        initDurationMs: cachedInitDurationMs,
        warmupCount,
        userAgent: navigator.userAgent,
        results,
      };
    },
  };
}
