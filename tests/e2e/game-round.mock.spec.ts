import { expect, test } from "@playwright/test";
import { CHARACTERS, type Character } from "../../src/data/characters.ts";
import { POLICY_MESSAGES } from "../../src/engine/policy.ts";

export interface MockInitOptions {
  availabilityMode?: "available" | "downloadable";
  hasNative?: boolean;
  disableWebGpu?: boolean;
  secretIndices?: number[];
  characters?: readonly Character[];
}

/**
 * Deterministic window.DecisionModel mock injected via page.addInitScript.
 * Runs in browser context before page scripts execute.
 */
function installDecisionModelMock(options: MockInitOptions) {
  const {
    availabilityMode = "available",
    hasNative = true,
    disableWebGpu = false,
    secretIndices = [6, 3, 7, 2], // 6: Elena, 3: Theo, 7: Omar, 2: Ada
    characters = [],
  } = options;

  if (disableWebGpu) {
    try {
      Object.defineProperty(navigator, "gpu", {
        value: undefined,
        configurable: true,
        writable: true,
      });
    } catch (_e) {
      // ignore
    }
  }

  if (!hasNative) {
    delete (window as unknown as { DecisionModel?: unknown }).DecisionModel;
    return;
  }

  let secretIdxCursor = 0;
  const origRandom = Math.random;
  Math.random = function () {
    const stack = new Error().stack || "";
    if (
      stack.toLowerCase().includes("gamestate") ||
      stack.includes("startNewGame")
    ) {
      if (secretIdxCursor < secretIndices.length) {
        const idx = secretIndices[secretIdxCursor++];
        return (idx + 0.1) / (characters.length || 12);
      }
    }
    return origRandom.call(Math);
  };

  const spy = {
    createdSchemas: [] as unknown[],
    destroyedCount: 0,
    abortedCalls: 0,
    decideCalls: [] as Array<{ input: string; options?: unknown }>,
    lastSecretCharacter: null as unknown,
    availabilityMode,
    downloadProgressEvents: [0.25, 0.5, 0.75, 1.0],
    holdCreate: false,
    releaseCreate: null as (() => void) | null,
    hangDecide: false,
    slowDecideMs: 0,
    malformedNextDecide: false,
    nextDecision: null as unknown,
  };

  (window as unknown as { __TEST_DM_SPY__: typeof spy }).__TEST_DM_SPY__ = spy;

  function round4(v: number): number {
    return Math.round(v * 10_000) / 10_000;
  }

  function makeDecision(overrides?: {
    kindLabel?: string;
    kindConfidence?: number;
    supportsYesLabel?: string;
    supportsYesConfidence?: number;
    contradictsNoLabel?: string;
    contradictsNoConfidence?: number;
  }) {
    const kindLabel = overrides?.kindLabel ?? "trait_question";
    const kindConfidence = overrides?.kindConfidence ?? 0.9;
    const supportsYesLabel = overrides?.supportsYesLabel ?? "true";
    const supportsYesConfidence = overrides?.supportsYesConfidence ?? 0.9;
    const contradictsNoLabel = overrides?.contradictsNoLabel ?? "false";
    const contradictsNoConfidence = overrides?.contradictsNoConfidence ?? 0.9;

    const defaultKindProbs: Record<string, number> = {
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

    const defaultSupportsYesProbs: Record<string, number> = {
      true:
        supportsYesLabel === "true"
          ? supportsYesConfidence
          : round4(1 - supportsYesConfidence),
      false:
        supportsYesLabel === "false"
          ? supportsYesConfidence
          : round4(1 - supportsYesConfidence),
    };

    const defaultContradictsNoProbs: Record<string, number> = {
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
        probabilities: defaultKindProbs,
      },
      supports_yes: {
        id: "supports_yes",
        label: supportsYesLabel,
        confidence: supportsYesConfidence,
        probabilities: defaultSupportsYesProbs,
      },
      contradicts_no: {
        id: "contradicts_no",
        label: contradictsNoLabel,
        confidence: contradictsNoConfidence,
        probabilities: defaultContradictsNoProbs,
      },
    };
  }

  const MockDecisionModel = {
    async availability(_schema?: unknown) {
      return spy.availabilityMode;
    },
    async create(createOpts: {
      signal?: AbortSignal;
      monitor?: (target: EventTarget) => void;
      questions?: Array<{ id: string; prompt: string }>;
    }) {
      if (createOpts?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }

      spy.createdSchemas.push(createOpts);

      // Identify secret character by matching serialized facts in supports_yes prompt
      const supportsYesPrompt =
        createOpts.questions?.find((q) => q.id === "supports_yes")?.prompt || "";
      const matched = characters.find(
        (c) =>
          Array.isArray(c.facts) &&
          c.facts.length > 0 &&
          c.facts.every((f) => supportsYesPrompt.includes(f))
      );
      if (matched) {
        spy.lastSecretCharacter = matched;
      }

      if (createOpts.monitor && spy.downloadProgressEvents) {
        const target = new EventTarget();
        createOpts.monitor(target);
        for (const fraction of spy.downloadProgressEvents) {
          const event = new ProgressEvent("downloadprogress", {
            lengthComputable: true,
            loaded: Math.round(fraction * 100),
            total: 100,
          });
          target.dispatchEvent(event);
        }
      }

      if (spy.holdCreate) {
        await new Promise<void>((resolve) => {
          spy.releaseCreate = () => {
            spy.holdCreate = false;
            spy.releaseCreate = null;
            resolve();
          };
        });
      }

      let destroyed = false;
      return {
        async decide(
          input: string,
          decideOpts?: { signal?: AbortSignal }
        ) {
          if (destroyed) {
            throw new DOMException(
              "The round session has been destroyed.",
              "AbortError"
            );
          }
          if (decideOpts?.signal?.aborted) {
            spy.abortedCalls++;
            throw new DOMException("The operation was aborted.", "AbortError");
          }

          spy.decideCalls.push({ input, options: decideOpts });

          const evaluate = () => {
            if (spy.malformedNextDecide) {
              spy.malformedNextDecide = false;
              return { invalid_output: true };
            }
            if (spy.nextDecision) {
              const res = spy.nextDecision;
              spy.nextDecision = null;
              return res;
            }

            const lower = input.toLowerCase().trim();

            // Identity guess copy routing
            if (
              lower.includes("is it ") ||
              lower.includes("is the secret") ||
              lower.startsWith("nora") ||
              lower.startsWith("elena")
            ) {
              return makeDecision({
                kindLabel: "identity_guess",
                kindConfidence: 0.95,
              });
            }

            // Compound / needs rephrase routing
            if (
              lower.includes(" and ") ||
              lower.includes(" or ") ||
              lower.includes("rephrase")
            ) {
              return makeDecision({
                kindLabel: "needs_rephrase",
                kindConfidence: 0.95,
              });
            }

            const secretFacts =
              (spy.lastSecretCharacter as { facts?: string[] } | null)?.facts ??
              [];
            if (/\b(female|woman)\b/.test(lower)) {
              const isFemale = secretFacts.includes("Is a woman (female)");
              return makeDecision({
                kindLabel: "trait_question",
                supportsYesLabel: isFemale ? "true" : "false",
                contradictsNoLabel: isFemale ? "false" : "true",
              });
            }
            if (/\b(male|man)\b/.test(lower)) {
              const isMale = secretFacts.includes("Is a man (male)");
              return makeDecision({
                kindLabel: "trait_question",
                supportsYesLabel: isMale ? "true" : "false",
                contradictsNoLabel: isMale ? "false" : "true",
              });
            }

            // Trait question: "night" -> Yes
            if (lower.includes("night")) {
              return makeDecision({
                kindLabel: "trait_question",
                supportsYesLabel: "true",
                contradictsNoLabel: "false",
              });
            }

            // Trait question: "bicycle" -> No
            if (lower.includes("bicycle")) {
              return makeDecision({
                kindLabel: "trait_question",
                supportsYesLabel: "false",
                contradictsNoLabel: "true",
              });
            }

            // Trait question: "french" -> Not enough info
            if (lower.includes("french") || lower.includes("unknown")) {
              return makeDecision({
                kindLabel: "trait_question",
                supportsYesLabel: "false",
                contradictsNoLabel: "false",
              });
            }

            // Default: Yes trait answer
            return makeDecision({
              kindLabel: "trait_question",
              supportsYesLabel: "true",
              contradictsNoLabel: "false",
            });
          };

          if (spy.hangDecide || (spy.slowDecideMs && spy.slowDecideMs > 0)) {
            return new Promise((resolve, reject) => {
              let timer: ReturnType<typeof setTimeout> | null = null;
              if (spy.slowDecideMs && spy.slowDecideMs > 0) {
                timer = setTimeout(() => {
                  try {
                    resolve(evaluate());
                  } catch (e) {
                    reject(e);
                  }
                }, spy.slowDecideMs);
              }
              if (decideOpts?.signal) {
                decideOpts.signal.addEventListener(
                  "abort",
                  () => {
                    if (timer) clearTimeout(timer);
                    spy.abortedCalls++;
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

          if (decideOpts?.signal) {
            decideOpts.signal.addEventListener(
              "abort",
              () => {
                spy.abortedCalls++;
              },
              { once: true }
            );
          }

          return evaluate();
        },
        destroy() {
          if (!destroyed) {
            destroyed = true;
            spy.destroyedCount++;
          }
        },
      };
    },
  };

  (window as unknown as { DecisionModel: typeof MockDecisionModel }).DecisionModel =
    MockDecisionModel;
}

test.describe("Phase 4: Game Round Mock E2E Test Suite", () => {
  test("unavailable fallback banner renders and all 12 character biographies remain inspectable", async ({
    page,
  }) => {
    await page.addInitScript(installDecisionModelMock, {
      hasNative: false,
      disableWebGpu: true,
      characters: CHARACTERS,
    } satisfies MockInitOptions);

    await page.goto("/");

    // Verify engine badge reflects unavailable state
    await expect(page.getByTestId("engine-badge")).toHaveText(
      "Unavailable · Unavailable"
    );

    // Verify UnsupportedBanner renders with alert role
    const banner = page.locator(".unsupported-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveRole("alert");
    await expect(banner.locator(".banner-heading")).toHaveText(
      "Decision Engine Unsupported"
    );
    await expect(banner.locator(".banner-inspectable-note")).toHaveText(
      "All 12 character biographies remain inspectable below."
    );

    // Verify start button is disabled in unsupported mode
    await expect(page.getByTestId("primary-game-btn")).toBeDisabled();

    // Verify all 12 character cards are present and biographies remain inspectable
    const cards = page.locator(".character-card");
    await expect(cards).toHaveCount(12);

    // Verify all 12 384x384 character portrait JPEGs load cleanly
    await expect
      .poll(async () =>
        page.locator("img.character-avatar").evaluateAll((imgs) =>
          imgs.map((el) => {
            const img = el as HTMLImageElement;
            return {
              complete: img.complete,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
            };
          })
        )
      )
      .toEqual(
        Array.from({ length: 12 }, () => ({
          complete: true,
          naturalWidth: 384,
          naturalHeight: 384,
        }))
      );

    const bioDialog = page.locator("dialog.biography-dialog");

    // Inspect Nora's biography
    const noraCard = page.locator('.character-card[data-character-id="nora"]');
    await noraCard.getByRole("button", { name: "Biography for Nora" }).click();
    await expect(bioDialog).toBeVisible();
    await expect(page.locator("#biography-dialog-title")).toHaveText("Nora");
    await expect(page.locator(".dialog-facts-list")).toContainText(
      "Works as an astronomer"
    );
    await page.getByRole("button", { name: "Close biography for Nora" }).click();
    await expect(bioDialog).not.toBeVisible();

    // Inspect Milo's biography
    const miloCard = page.locator('.character-card[data-character-id="milo"]');
    await miloCard.getByRole("button", { name: "Biography for Milo" }).click();
    await expect(bioDialog).toBeVisible();
    await expect(page.locator("#biography-dialog-title")).toHaveText("Milo");
    await expect(page.locator(".dialog-facts-list")).toContainText(
      "Works as a baker"
    );
    await page.keyboard.press("Escape");
    await expect(bioDialog).not.toBeVisible();
  });

  test("downloadable readiness flow shows progress and transitions to ready round", async ({
    page,
  }) => {
    await page.addInitScript(installDecisionModelMock, {
      availabilityMode: "downloadable",
      characters: CHARACTERS,
    } satisfies MockInitOptions);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    // Header badge shows Downloadable
    await expect(page.getByTestId("engine-badge")).toHaveText(
      "Downloadable · Native DecisionModel"
    );

    // Primary button prompts initialization
    const startBtn = page.getByTestId("primary-game-btn");
    await expect(startBtn).toHaveText("Initialize & start game");
    await expect(startBtn).toBeEnabled();

    // Pause create() at 17% download progress so we can verify header layout
    await page.evaluate(() => {
      const spy = (
        window as unknown as {
          __TEST_DM_SPY__: {
            downloadProgressEvents: number[];
            holdCreate: boolean;
          };
        }
      ).__TEST_DM_SPY__;
      spy.downloadProgressEvents = [0.17];
      spy.holdCreate = true;
    });

    // Click initialize
    await startBtn.click();

    await expect(page.getByTestId("engine-badge")).toHaveText(
      "Loading · Native DecisionModel"
    );
    const downloadBox = page.getByTestId("header-download-progress");
    await expect(downloadBox).toBeVisible();
    await expect(downloadBox).toContainText("Downloading engine model:");
    await expect(downloadBox).toContainText("17%");

    const mainRowBox = await page.locator(".header-main-row").boundingBox();
    const progressContainerBox = await downloadBox.boundingBox();
    const titleBox = await page.locator(".header-title").boundingBox();
    const qBox = await page.locator(".metric-questions").boundingBox();
    const remBox = await page.locator(".metric-remaining").boundingBox();
    const btnBox = await startBtn.boundingBox();

    expect(mainRowBox).not.toBeNull();
    expect(progressContainerBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(qBox).not.toBeNull();
    expect(remBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    expect(progressContainerBox!.y).toBeGreaterThanOrEqual(
      mainRowBox!.y + mainRowBox!.height
    );
    expect(
      Math.abs(progressContainerBox!.width - mainRowBox!.width)
    ).toBeLessThanOrEqual(2);
    expect(titleBox!.height).toBeLessThanOrEqual(46);
    expect(qBox!.height).toBeLessThanOrEqual(46);
    expect(remBox!.height).toBeLessThanOrEqual(46);
    expect(btnBox!.height).toBeLessThanOrEqual(46);
    expect(Math.abs(qBox!.y - btnBox!.y)).toBeLessThanOrEqual(8);

    await page.evaluate(() => {
      (
        window as unknown as {
          __TEST_DM_SPY__: { releaseCreate: (() => void) | null };
        }
      ).__TEST_DM_SPY__.releaseCreate?.();
    });

    // Engine transitions to ready and round starts
    await expect(page.getByTestId("engine-badge")).toHaveText(
      "Ready · Native DecisionModel"
    );
    await expect(startBtn).toHaveText("New game");

    // Suspects board is in playing state
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 0");
    await expect(page.getByTestId("remaining-count")).toHaveText(
      "Remaining: 12/12"
    );
  });

  test("idle state, Biography dialog focus restoration, and mobile (390x844) vs desktop (1280x900) layout", async ({
    page,
  }) => {
    await page.addInitScript(installDecisionModelMock, {
      availabilityMode: "available",
      characters: CHARACTERS,
    } satisfies MockInitOptions);

    // 1. Desktop verification (1280x900)
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    // Header badge
    await expect(page.getByTestId("engine-badge")).toHaveText(
      "Ready · Native DecisionModel"
    );

    // 12 cards visible in idle state
    const cards = page.locator(".character-card");
    await expect(cards).toHaveCount(12);

    // Primary button says "Start game"
    const startBtn = page.getByTestId("primary-game-btn");
    await expect(startBtn).toHaveText("Start game");
    await expect(startBtn).toBeEnabled();

    // Biography dialog opens cleanly and restores focus on Escape
    const noraBioBtn = page.getByRole("button", { name: "Biography for Nora" });
    await noraBioBtn.click();

    const bioDialog = page.locator("dialog.biography-dialog");
    await expect(bioDialog).toBeVisible();
    const isDialogOpen = await bioDialog.evaluate(
      (el: HTMLDialogElement) => el.open
    );
    expect(isDialogOpen).toBe(true);

    // Press Escape to close
    await page.keyboard.press("Escape");
    await expect(bioDialog).not.toBeVisible();
    await expect(noraBioBtn).toBeFocused();

    // 2. Mobile verification (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    // Inspector starts collapsed on mobile (viewport width < 1024)
    const inspectorToggle = page.getByTestId("inspector-toggle-btn");
    await expect(inspectorToggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#inspector-panel-body")).toBeHidden();

    // Verify no horizontal overflow on mobile
    const hasHorizontalOverflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      );
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Open biography dialog on mobile and verify focus restoration
    const mobileNoraBioBtn = page.getByRole("button", {
      name: "Biography for Nora",
    });
    await mobileNoraBioBtn.click();
    await expect(bioDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bioDialog).not.toBeVisible();
    await expect(mobileNoraBioBtn).toBeFocused();
  });

  test("round startup, anonymous schema isolation, and all turn outcomes with retained input", async ({
    page,
  }) => {
    // Secret index 6 corresponds to Elena
    await page.addInitScript(installDecisionModelMock, {
      availabilityMode: "available",
      secretIndices: [6],
      characters: CHARACTERS,
    } satisfies MockInitOptions);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const liveRegion = page.locator('[role="status"][aria-live="polite"].sr-only');

    // Click "Start game"
    await page.getByTestId("primary-game-btn").click();
    await expect(page.getByTestId("primary-game-btn")).toHaveText("New game");

    // Anonymous schema isolation check
    const spyData = await page.evaluate(() => {
      const spy = (
        window as unknown as {
          __TEST_DM_SPY__: {
            createdSchemas: Array<{
              questions: Array<{ id: string; prompt: string }>;
            }>;
            lastSecretCharacter: Character;
          };
        }
      ).__TEST_DM_SPY__;
      return {
        createdSchema0: spy.createdSchemas[0],
        secretCharacter: spy.lastSecretCharacter,
      };
    });

    expect(spyData.createdSchema0).toBeDefined();
    expect(spyData.secretCharacter).toBeDefined();
    expect(spyData.secretCharacter.id).toBe("elena");

    const schemaStr = JSON.stringify(spyData.createdSchema0);

    // Verify schema contains serialized facts of the secret character
    for (const fact of spyData.secretCharacter.facts) {
      expect(schemaStr).toContain(fact);
    }

    // Verify zero secret character id or name strings anywhere inside schema serialization
    expect(schemaStr.toLowerCase()).not.toContain(`"${spyData.secretCharacter.id.toLowerCase()}"`);
    expect(schemaStr).not.toContain(`"${spyData.secretCharacter.name}"`);

    const supportsYesQ = spyData.createdSchema0.questions.find(
      (q) => q.id === "supports_yes"
    )!;
    const contradictsNoQ = spyData.createdSchema0.questions.find(
      (q) => q.id === "contradicts_no"
    )!;
    expect(supportsYesQ.prompt).not.toContain(spyData.secretCharacter.name);
    expect(supportsYesQ.prompt).not.toContain(spyData.secretCharacter.id);
    expect(contradictsNoQ.prompt).not.toContain(spyData.secretCharacter.name);
    expect(contradictsNoQ.prompt).not.toContain(spyData.secretCharacter.id);

    // 1. Starter prompt chip "Do they work at night?" -> "Yes", Questions: 1, Request: 1
    const nightChip = page.getByRole("button", {
      name: "Do they work at night?",
    });
    await nightChip.click();

    await expect(page.getByTestId("question-count")).toHaveText("Questions: 1");
    await expect(page.getByTestId("inspector-request-number")).toHaveText("1");

    const turns = page.locator(".turn-history-item");
    await expect(turns).toHaveCount(1);
    await expect(turns.nth(0)).toContainText("Question #1");
    await expect(turns.nth(0)).toContainText("✓ Yes");
    await expect(turns.nth(0)).toContainText("“Do they work at night?”");
    await expect(liveRegion).toHaveText("Yes");

    // 2. Typed trait question returning "No" -> Questions: 2, Request: 2
    // Verify live region does not update while typing
    const announcementBeforeTyping = await liveRegion.textContent();
    const input = page.locator("#player-question-input");
    await input.pressSequentially("Do they travel by bicycle?");
    expect(await liveRegion.textContent()).toBe(announcementBeforeTyping);

    await page.getByRole("button", { name: "Ask question" }).click();
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 2");
    await expect(page.getByTestId("inspector-request-number")).toHaveText("2");
    await expect(turns).toHaveCount(2);
    await expect(turns.nth(1)).toContainText("Question #2");
    await expect(turns.nth(1)).toContainText("✕ No");
    await expect(liveRegion).toHaveText("No");

    // 3. Typed trait question returning "Not enough information" -> Questions: 3, Request: 3
    await input.fill("Do they speak French?");
    await page.getByRole("button", { name: "Ask question" }).click();
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 3");
    await expect(page.getByTestId("inspector-request-number")).toHaveText("3");
    await expect(turns).toHaveCount(3);
    await expect(turns.nth(2)).toContainText("Question #3");
    await expect(turns.nth(2)).toContainText("? Not enough information");
    await expect(liveRegion).toHaveText(POLICY_MESSAGES.unknown);

    // 4. Identity guess "Is it Nora?" -> clarification copy, Questions: 3, Request: 4
    await input.fill("Is it Nora?");
    await page.getByRole("button", { name: "Ask question" }).click();
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 3");
    await expect(page.getByTestId("inspector-request-number")).toHaveText("4");
    await expect(turns).toHaveCount(4);
    await expect(turns.nth(3)).toContainText("Request #4");
    await expect(turns.nth(3)).toContainText("! Clarification");
    await expect(turns.nth(3)).toContainText(POLICY_MESSAGES.identityGuess);
    await expect(liveRegion).toHaveText(POLICY_MESSAGES.identityGuess);

    // 5. Compound / needs_rephrase question -> clarification copy, Questions: 3, Request: 5
    await input.fill("Do they work at night and like camping?");
    await page.getByRole("button", { name: "Ask question" }).click();
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 3");
    await expect(page.getByTestId("inspector-request-number")).toHaveText("5");
    await expect(turns).toHaveCount(5);
    await expect(turns.nth(4)).toContainText("Request #5");
    await expect(turns.nth(4)).toContainText("! Clarification");
    await expect(turns.nth(4)).toContainText(POLICY_MESSAGES.needsRephrase);
    await expect(liveRegion).toHaveText(POLICY_MESSAGES.needsRephrase);

    // 6a. Pre-inference rejection on empty submit -> Questions: 3, Request: 5 (adapter NOT called)
    await input.fill("");
    const decideCallsBeforeEmpty = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_DM_SPY__: { decideCalls: unknown[] };
          }
        ).__TEST_DM_SPY__.decideCalls.length
    );

    await page.getByRole("button", { name: "Ask question" }).click();
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 3");
    await expect(page.getByTestId("inspector-request-number")).toHaveText("5");
    await expect(turns).toHaveCount(6);
    await expect(turns.nth(5)).toContainText("⚠ Rejected");
    await expect(turns.nth(5)).toContainText(POLICY_MESSAGES.invalidInput);
    await expect(liveRegion).toHaveText(POLICY_MESSAGES.invalidInput);

    const decideCallsAfterEmpty = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_DM_SPY__: { decideCalls: unknown[] };
          }
        ).__TEST_DM_SPY__.decideCalls.length
    );
    expect(decideCallsAfterEmpty).toBe(decideCallsBeforeEmpty);

    // 6b. Pre-inference rejection on 301-char input -> Questions: 3, Request: 5, input retained
    const longInput = "a".repeat(301);
    await input.fill(longInput);
    const decideCallsBeforeLong = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_DM_SPY__: { decideCalls: unknown[] };
          }
        ).__TEST_DM_SPY__.decideCalls.length
    );

    await page.getByRole("button", { name: "Ask question" }).click();
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 3");
    await expect(page.getByTestId("inspector-request-number")).toHaveText("5");
    await expect(turns).toHaveCount(7);
    await expect(turns.nth(6)).toContainText("⚠ Rejected");
    await expect(turns.nth(6)).toContainText(POLICY_MESSAGES.invalidInput);

    const decideCallsAfterLong = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_DM_SPY__: { decideCalls: unknown[] };
          }
        ).__TEST_DM_SPY__.decideCalls.length
    );
    expect(decideCallsAfterLong).toBe(decideCallsBeforeLong);
    // Verify 301-char input text stays preserved in input
    await expect(input).toHaveValue(longInput);

    // 7. Malformed decide() return -> error copy, Questions: 3, Request: 6, input retained
    await page.evaluate(() => {
      (
        window as unknown as {
          __TEST_DM_SPY__: { malformedNextDecide: boolean };
        }
      ).__TEST_DM_SPY__.malformedNextDecide = true;
    });

    const malformedQuery = "Will the model return an invalid decision shape?";
    await input.fill(malformedQuery);
    await page.getByRole("button", { name: "Ask question" }).click();

    await expect(page.getByTestId("question-count")).toHaveText("Questions: 3");
    await expect(page.getByTestId("inspector-request-number")).toHaveText("6");
    await expect(turns).toHaveCount(8);
    await expect(turns.nth(7)).toContainText("Request #6");
    await expect(turns.nth(7)).toContainText("⚠ Error");
    await expect(turns.nth(7)).toContainText(POLICY_MESSAGES.engineError);
    await expect(liveRegion).toHaveText(POLICY_MESSAGES.engineError);
    // Verify malformed query stays preserved in input
    await expect(input).toHaveValue(malformedQuery);
  });

  test("manual card elimination/restoration, loss round, and win round via dialog confirmation", async ({
    page,
  }) => {
    // Secret sequence: Elena (6), then Theo (3)
    await page.addInitScript(installDecisionModelMock, {
      availabilityMode: "available",
      secretIndices: [6, 3],
      characters: CHARACTERS,
    } satisfies MockInitOptions);

    await page.goto("/");
    await page.getByTestId("primary-game-btn").click();

    // Verify secret character is Elena
    const round1Secret = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_DM_SPY__: { lastSecretCharacter: Character };
          }
        ).__TEST_DM_SPY__.lastSecretCharacter
    );
    expect(round1Secret.id).toBe("elena");

    // 1. Manual elimination and restoration on non-secret character (Nora)
    const noraCard = page.locator('.character-card[data-character-id="nora"]');
    const noraEliminateBtn = noraCard.getByRole("button", {
      name: "Eliminate Nora",
    });
    const noraGuessBtn = noraCard.getByRole("button", {
      name: "Make my guess: Nora",
    });

    await expect(noraGuessBtn).toBeEnabled();
    await noraEliminateBtn.click();

    // Verify Remaining: 11/12 and guess button disabled
    await expect(page.getByTestId("remaining-count")).toHaveText(
      "Remaining: 11/12"
    );
    await expect(noraCard).toHaveAttribute("data-eliminated", "true");
    await expect(noraGuessBtn).toBeDisabled();

    // Restore Nora
    const noraRestoreBtn = noraCard.getByRole("button", {
      name: "Restore Nora",
    });
    await noraRestoreBtn.click();
    await expect(page.getByTestId("remaining-count")).toHaveText(
      "Remaining: 12/12"
    );
    await expect(noraCard).toHaveAttribute("data-eliminated", "false");
    await expect(noraGuessBtn).toBeEnabled();

    // 2. Make guess on non-secret character (Nora) -> loss round and old session destroyed
    const destroyedBeforeGuess = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_DM_SPY__: { destroyedCount: number };
          }
        ).__TEST_DM_SPY__.destroyedCount
    );
    expect(destroyedBeforeGuess).toBe(0);

    await noraGuessBtn.click();
    const guessDialog = page.locator("dialog.guess-confirm-dialog");
    await expect(guessDialog).toBeVisible();
    await expect(page.locator("#guess-confirm-dialog-title")).toContainText(
      "Nora"
    );

    await page
      .getByRole("button", { name: "Confirm guess for Nora" })
      .click();
    await expect(guessDialog).not.toBeVisible();

    // Verify session was destroyed upon completing the round
    const destroyedAfterGuess = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_DM_SPY__: { destroyedCount: number };
          }
        ).__TEST_DM_SPY__.destroyedCount
    );
    expect(destroyedAfterGuess).toBe(1);

    // Verify loss banner reveals Elena as the secret character
    const resultBanner = page.getByTestId("round-result-banner");
    await expect(resultBanner).toBeVisible();
    await expect(resultBanner).toHaveClass(/round-result-banner-lost/);
    await expect(resultBanner.locator("h2")).toHaveText(
      "✕ Incorrect guess — Secret character was Elena"
    );
    await expect(page.getByTestId("primary-game-btn")).toHaveText("New game");

    // 3. Start "New game" -> counters/history/eliminations reset
    await page.getByTestId("primary-game-btn").click();

    await expect(page.getByTestId("question-count")).toHaveText("Questions: 0");
    await expect(page.getByTestId("remaining-count")).toHaveText(
      "Remaining: 12/12"
    );
    await expect(page.locator(".turn-history-empty")).toBeVisible();

    // 4. Identify new secret character (Theo) and make winning guess
    const round2Secret = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_DM_SPY__: { lastSecretCharacter: Character };
          }
        ).__TEST_DM_SPY__.lastSecretCharacter
    );
    expect(round2Secret.id).toBe("theo");

    const theoCard = page.locator('.character-card[data-character-id="theo"]');
    await theoCard
      .getByRole("button", { name: "Make my guess: Theo" })
      .click();
    await expect(guessDialog).toBeVisible();
    await page
      .getByRole("button", { name: "Confirm guess for Theo" })
      .click();
    await expect(guessDialog).not.toBeVisible();

    // Verify win banner appears
    await expect(resultBanner).toBeVisible();
    await expect(resultBanner).toHaveClass(/round-result-banner-won/);
    await expect(resultBanner.locator("h2")).toHaveText(
      "✓ Correct guess — Theo!"
    );
  });

  test("in-flight AbortController cancellation on New game", async ({ page }) => {
    await page.addInitScript(installDecisionModelMock, {
      availabilityMode: "available",
      characters: CHARACTERS,
    } satisfies MockInitOptions);

    await page.goto("/");
    await page.getByTestId("primary-game-btn").click();

    // Configure hanging decide turn
    await page.evaluate(() => {
      (
        window as unknown as {
          __TEST_DM_SPY__: { hangDecide: boolean };
        }
      ).__TEST_DM_SPY__.hangDecide = true;
    });

    const input = page.locator("#player-question-input");
    await input.fill("Are you slow to respond?");
    await page.getByRole("button", { name: "Ask question" }).click();

    // Verify evaluating in-flight state
    const submitBtn = page.locator(".question-submit-btn");
    await expect(submitBtn).toHaveText("Evaluating...");
    await expect(submitBtn).toBeDisabled();
    await expect(page.locator(".app-shell")).toHaveAttribute(
      "data-submitting",
      "true"
    );

    const { abortedBefore, destroyedBefore } = await page.evaluate(() => {
      const spy = (
        window as unknown as {
          __TEST_DM_SPY__: {
            abortedCalls: number;
            destroyedCount: number;
          };
        }
      ).__TEST_DM_SPY__;
      return {
        abortedBefore: spy.abortedCalls,
        destroyedBefore: spy.destroyedCount,
      };
    });

    // Click "New game" while decide is in flight
    await page.getByTestId("primary-game-btn").click();

    // Release hanging decide flag
    await page.evaluate(() => {
      (
        window as unknown as {
          __TEST_DM_SPY__: { hangDecide: boolean };
        }
      ).__TEST_DM_SPY__.hangDecide = false;
    });

    // Verify abortedCalls and destroyedCount incremented
    const { abortedAfter, destroyedAfter } = await page.evaluate(() => {
      const spy = (
        window as unknown as {
          __TEST_DM_SPY__: {
            abortedCalls: number;
            destroyedCount: number;
          };
        }
      ).__TEST_DM_SPY__;
      return {
        abortedAfter: spy.abortedCalls,
        destroyedAfter: spy.destroyedCount,
      };
    });

    expect(abortedAfter).toBeGreaterThan(abortedBefore);
    expect(destroyedAfter).toBeGreaterThan(destroyedBefore);

    // Verify new round started cleanly at Questions: 0 with empty history
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 0");
    await expect(page.locator(".turn-history-empty")).toBeVisible();
    await expect(submitBtn).toHaveText("Ask question");
    await expect(submitBtn).toBeEnabled();
    await expect(input).toHaveValue("");
  });

  test("Inspector panel displays telemetry, raw model distributions, and stateless spoilers disclosure", async ({
    page,
  }) => {
    await page.addInitScript(installDecisionModelMock, {
      availabilityMode: "available",
      characters: CHARACTERS,
    } satisfies MockInitOptions);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByTestId("primary-game-btn").click();

    // Ensure Inspector is open
    const toggleBtn = page.getByTestId("inspector-toggle-btn");
    const isExpanded = (await toggleBtn.getAttribute("aria-expanded")) === "true";
    if (!isExpanded) {
      await toggleBtn.click();
    }

    // Verify Engine identity and timings
    await expect(page.getByTestId("inspector-engine-identity")).toHaveText(
      "Native DecisionModel"
    );
    await expect(page.getByTestId("inspector-create-duration")).toBeVisible();

    // Submit starter chip to generate turn telemetry
    await page.getByRole("button", { name: "Do they work at night?" }).click();
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 1");

    // Inspect turn raw decision block
    const turnDetail = page.getByTestId("inspector-turn-detail");
    await expect(turnDetail).toBeVisible();
    await expect(page.getByTestId("inspector-app-outcome")).toContainText(
      "answered (Yes)"
    );

    // Verify raw heads and probabilities
    const questionCards = page.locator(".inspector-question-card");
    await expect(questionCards).toHaveCount(3);

    // Check question_kind card
    const kindCard = questionCards.nth(0);
    await expect(kindCard.locator(".inspector-question-id")).toHaveText(
      "question_kind"
    );
    await expect(kindCard.locator(".inspector-winning-label")).toHaveText(
      "trait_question"
    );
    await expect(kindCard.locator(".inspector-confidence-line")).toContainText(
      "Confidence (model score, not guaranteed correctness): 90.0%"
    );
    await expect(kindCard.locator(".inspector-prob-list")).toContainText(
      "trait_question"
    );

    // Check supports_yes card
    const supportsYesCard = questionCards.nth(1);
    await expect(supportsYesCard.locator(".inspector-question-id")).toHaveText(
      "supports_yes"
    );
    await expect(supportsYesCard.locator(".inspector-winning-label")).toHaveText(
      "true"
    );

    // Check contradicts_no card
    const contradictsNoCard = questionCards.nth(2);
    await expect(contradictsNoCard.locator(".inspector-question-id")).toHaveText(
      "contradicts_no"
    );
    await expect(contradictsNoCard.locator(".inspector-winning-label")).toHaveText(
      "false"
    );

    // Verify Inspector is docked cleanly at the bottom below .game-column at 1280x900
    // and stays in the exact same document position whether open or collapsed
    const measureLayout = () =>
      page.evaluate(() => {
        const docBox = (selector: string) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            x: r.left + window.scrollX,
            y: r.top + window.scrollY,
            width: r.width,
            height: r.height,
          };
        };
        const cards = Array.from(
          document.querySelectorAll(".inspector-question-card")
        ).map((el) => {
          const r = el.getBoundingClientRect();
          return { y: r.top + window.scrollY };
        });
        return {
          gameCol: docBox(".game-column"),
          inspector: docBox(".inspector-panel"),
          cards,
        };
      });

    const openLayout = await measureLayout();
    expect(openLayout.gameCol).not.toBeNull();
    expect(openLayout.inspector).not.toBeNull();
    expect(openLayout.cards).toHaveLength(3);

    expect(openLayout.inspector!.y).toBeGreaterThanOrEqual(
      openLayout.gameCol!.y + openLayout.gameCol!.height
    );
    expect(
      Math.abs(openLayout.inspector!.width - openLayout.gameCol!.width)
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(openLayout.cards[0].y - openLayout.cards[1].y)
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(openLayout.cards[1].y - openLayout.cards[2].y)
    ).toBeLessThanOrEqual(2);

    // Collapse Inspector and verify document position + game column width do not shift
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
    const collapsedLayout = await measureLayout();
    expect(collapsedLayout.gameCol).not.toBeNull();
    expect(collapsedLayout.inspector).not.toBeNull();
    expect(
      Math.abs(collapsedLayout.inspector!.x - openLayout.inspector!.x)
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(collapsedLayout.inspector!.y - openLayout.inspector!.y)
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(collapsedLayout.inspector!.width - openLayout.inspector!.width)
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(collapsedLayout.gameCol!.width - openLayout.gameCol!.width)
    ).toBeLessThanOrEqual(1);

    // Re-expand Inspector before checking spoilers disclosure
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "true");

    // Toggle spoilers disclosure open
    const spoilersDisclosure = page.getByTestId("spoilers-disclosure");
    await spoilersDisclosure.locator("summary").click();

    const spoilersPre = page.getByTestId("spoilers-schema-content");
    await expect(spoilersPre).toBeVisible();

    const schemaText = await spoilersPre.textContent();
    expect(schemaText).not.toBeNull();
    const parsedSchema = JSON.parse(schemaText!);
    expect(parsedSchema.questions.length).toBe(3);

    // Verify question count and roundStatus remain completely unchanged by toggling disclosure
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 1");
    await expect(page.getByTestId("primary-game-btn")).toHaveText("New game");
  });

  test("answers male and female biography questions accurately with Yes and No", async ({
    page,
  }) => {
    // Secret index 6 corresponds to Elena ("Is a woman (female)")
    await page.addInitScript(installDecisionModelMock, {
      availabilityMode: "available",
      secretIndices: [6],
      characters: CHARACTERS,
    } satisfies MockInitOptions);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await page.getByTestId("primary-game-btn").click();
    await expect(page.getByTestId("primary-game-btn")).toHaveText("New game");

    const input = page.locator("#player-question-input");
    const turns = page.locator(".turn-history-item");

    await input.fill("Is this person female?");
    await page.getByRole("button", { name: "Ask question" }).click();
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 1");
    await expect(turns).toHaveCount(1);
    await expect(turns.nth(0)).toContainText("✓ Yes");

    await input.fill("Is this person male?");
    await page.getByRole("button", { name: "Ask question" }).click();
    await expect(page.getByTestId("question-count")).toHaveText("Questions: 2");
    await expect(turns).toHaveCount(2);
    await expect(turns.nth(1)).toContainText("✕ No");
  });
});
