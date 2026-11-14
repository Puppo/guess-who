import { useState } from "react";
import { CHARACTERS, type Character } from "./data/characters.ts";
import { MAX_QUESTION_LENGTH } from "./engine/policy.ts";
import { STARTER_PROMPTS, useGameState } from "./state/gameState.ts";
import { HeaderBar } from "./components/HeaderBar.tsx";
import { UnsupportedBanner } from "./components/UnsupportedBanner.tsx";
import { CharacterBoard } from "./components/CharacterBoard.tsx";
import { QuestionPanel } from "./components/QuestionPanel.tsx";
import { BiographyDialog } from "./components/BiographyDialog.tsx";
import { GuessConfirmDialog } from "./components/GuessConfirmDialog.tsx";
import { InspectorPanel } from "./components/InspectorPanel.tsx";

export default function App() {
  const game = useGameState({ characters: CHARACTERS });

  const [bioTarget, setBioTarget] = useState<{
    character: Character;
    opener: HTMLButtonElement | null;
  } | null>(null);

  const [guessTarget, setGuessTarget] = useState<{
    character: Character;
    opener: HTMLButtonElement | null;
  } | null>(null);

  const remainingCount = CHARACTERS.length - game.eliminatedIds.size;

  return (
    <div
      className="app-shell"
      data-submitting={game.isSubmitting ? "true" : "false"}
    >
      {/* Single authoritative polite ARIA live region updated on discrete events only */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {game.latestAnnouncement}
      </div>

      <HeaderBar
        engineState={game.engineState}
        backend={game.backend}
        downloadProgress={game.downloadProgress}
        roundStatus={game.roundStatus}
        questionCount={game.questionCount}
        remainingCount={remainingCount}
        totalCount={CHARACTERS.length}
        onStartOrReset={() => {
          void game.startNewGame();
        }}
      />

      <main className="main-workspace">
        <div className="game-column">
          <UnsupportedBanner
            engineState={game.engineState}
            backend={game.backend}
            engineError={game.engineError}
            onRetry={() => {
              void game.startNewGame();
            }}
          />

          {(game.roundStatus === "won" || game.roundStatus === "lost") &&
            game.secretCharacter && (
              <section
                className={`round-result-banner ${
                  game.roundStatus === "won"
                    ? "round-result-banner-won"
                    : "round-result-banner-lost"
                }`}
                aria-label="Round result"
                data-testid="round-result-banner"
              >
                <div className="round-result-copy">
                  <h2>
                    {game.roundStatus === "won"
                      ? `✓ Correct guess — ${game.secretCharacter.name}!`
                      : `✕ Incorrect guess — Secret character was ${game.secretCharacter.name}`}
                  </h2>
                  <p>
                    Round finished in {game.questionCount}{" "}
                    {game.questionCount === 1 ? "question" : "questions"}.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    void game.startNewGame();
                  }}
                >
                  New game
                </button>
              </section>
            )}

          <CharacterBoard
            characters={CHARACTERS}
            roundStatus={game.roundStatus}
            eliminatedIds={game.eliminatedIds}
            secretCharacterId={game.secretCharacter?.id ?? null}
            guessedCharacterId={game.guessedCharacterId}
            isSubmitting={game.isSubmitting}
            onOpenBiography={(character, opener) => {
              setBioTarget({ character, opener });
            }}
            onToggleEliminate={game.toggleEliminate}
            onStartGuess={(character, opener) => {
              setGuessTarget({ character, opener });
            }}
          />

          <QuestionPanel
            roundStatus={game.roundStatus}
            questionInput={game.questionInput}
            isSubmitting={game.isSubmitting}
            turns={game.turns}
            maxLength={MAX_QUESTION_LENGTH}
            onInputChange={game.setQuestionInput}
            onSubmitQuestion={() => {
              void game.submitQuestion();
            }}
            onSubmitChip={(prompt) => {
              void game.submitQuestion(prompt);
            }}
            starterPrompts={STARTER_PROMPTS}
          />
        </div>

        <InspectorPanel
          backend={game.backend}
          initDurationMs={game.initDurationMs}
          sessionCreateDurationMs={game.sessionCreateDurationMs}
          roundStatus={game.roundStatus}
          roundSchema={game.roundSchema}
          turns={game.turns}
          requestNumber={game.requestNumber}
        />
      </main>

      <BiographyDialog
        character={bioTarget?.character ?? null}
        openerElement={bioTarget?.opener ?? null}
        onClose={() => {
          setBioTarget(null);
        }}
      />

      <GuessConfirmDialog
        character={guessTarget?.character ?? null}
        openerElement={guessTarget?.opener ?? null}
        onCancel={() => {
          setGuessTarget(null);
        }}
        onConfirm={(characterId) => {
          setGuessTarget(null);
          game.confirmGuess(characterId);
        }}
      />
    </div>
  );
}
