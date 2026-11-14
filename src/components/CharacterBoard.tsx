import type { Character } from "../data/characters.ts";
import type { RoundStatus } from "../engine/types.ts";
import CharacterCard from "./CharacterCard.tsx";

export interface CharacterBoardProps {
  characters: readonly Character[];
  roundStatus: RoundStatus;
  eliminatedIds: ReadonlySet<string>;
  secretCharacterId: string | null;
  guessedCharacterId: string | null;
  isSubmitting: boolean;
  onOpenBiography: (
    character: Character,
    opener: HTMLButtonElement | null
  ) => void;
  onToggleEliminate: (characterId: string) => void;
  onStartGuess: (
    character: Character,
    opener: HTMLButtonElement | null
  ) => void;
}

export function CharacterBoard({
  characters,
  roundStatus,
  eliminatedIds,
  secretCharacterId,
  guessedCharacterId,
  isSubmitting,
  onOpenBiography,
  onToggleEliminate,
  onStartGuess,
}: CharacterBoardProps) {
  return (
    <section className="character-board" aria-labelledby="suspect-board-heading">
      <div className="board-header">
        <h2 id="suspect-board-heading">Suspects</h2>
      </div>

      <ul className="character-grid">
        {characters.map((character) => {
          const isEliminated = eliminatedIds.has(character.id);
          const isSecretReveal = Boolean(
            secretCharacterId &&
              character.id === secretCharacterId &&
              (roundStatus === "won" || roundStatus === "lost")
          );
          const isGuessedWrong = Boolean(
            guessedCharacterId &&
              character.id === guessedCharacterId &&
              character.id !== secretCharacterId &&
              (roundStatus === "lost" || roundStatus === "won")
          );

          return (
            <li key={character.id} className="character-grid-cell">
              <CharacterCard
                character={character}
                roundStatus={roundStatus}
                isEliminated={isEliminated}
                isSecretReveal={isSecretReveal}
                isGuessedWrong={isGuessedWrong}
                isSubmitting={isSubmitting}
                onOpenBiography={onOpenBiography}
                onToggleEliminate={onToggleEliminate}
                onStartGuess={onStartGuess}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default CharacterBoard;
