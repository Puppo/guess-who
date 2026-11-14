import type { Character } from "../data/characters.ts";
import type { RoundStatus } from "../engine/types.ts";

export interface CharacterCardProps {
  character: Character;
  roundStatus: RoundStatus;
  isEliminated: boolean;
  isSecretReveal: boolean;
  isGuessedWrong: boolean;
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

export function CharacterCard({
  character,
  roundStatus,
  isEliminated,
  isSecretReveal,
  isGuessedWrong,
  isSubmitting,
  onOpenBiography,
  onToggleEliminate,
  onStartGuess,
}: CharacterCardProps) {
  const isPlaying = roundStatus === "playing";
  const canGuess = isPlaying && !isEliminated && !isSubmitting;

  return (
    <article
      className={`character-card ${
        isEliminated ? "card-eliminated" : ""
      } ${isSecretReveal ? "card-secret-reveal" : ""} ${
        isGuessedWrong ? "card-guessed-wrong" : ""
      }`}
      data-character-id={character.id}
      data-eliminated={isEliminated ? "true" : "false"}
    >
      <div className="card-header">
        <img
          src={character.avatarUrl}
          alt={character.avatarAlt}
          width={80}
          height={80}
          decoding="async"
          className="character-avatar"
        />
        <div className="card-identification">
          <h3 className="character-name">{character.name}</h3>
          <div className="card-badges" aria-label="Status badges">
            {isSecretReveal && (
              <span className="card-badge badge-secret">
                ★ Secret character
              </span>
            )}
            {isGuessedWrong && (
              <span className="card-badge badge-guessed">
                ✕ Guessed
              </span>
            )}
            {isEliminated && (
              <span className="card-badge badge-eliminated">
                ✕ Eliminated
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="card-body">
        <p className="character-biography">{character.biography}</p>
      </div>

      <div className="card-actions">
        <button
          type="button"
          className="btn btn-secondary card-btn-bio"
          onClick={(e) => onOpenBiography(character, e.currentTarget)}
          aria-label={`Biography for ${character.name}`}
        >
          Biography
        </button>

        <button
          type="button"
          className={`btn btn-secondary card-btn-eliminate ${
            isEliminated ? "btn-restore" : ""
          }`}
          onClick={() => onToggleEliminate(character.id)}
          disabled={!isPlaying}
          aria-pressed={isEliminated}
          aria-label={`${isEliminated ? "Restore" : "Eliminate"} ${character.name}`}
        >
          {isEliminated ? "Restore" : "Eliminate"}
        </button>

        <button
          type="button"
          className="btn btn-primary card-btn-guess"
          onClick={(e) => onStartGuess(character, e.currentTarget)}
          disabled={!canGuess}
          aria-label={`Make my guess: ${character.name}`}
        >
          Make my guess
        </button>
      </div>
    </article>
  );
}

export default CharacterCard;
