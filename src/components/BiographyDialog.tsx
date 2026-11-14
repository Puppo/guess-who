import { useEffect, useRef } from "react";
import type { Character } from "../data/characters.ts";

export interface BiographyDialogProps {
  character: Character | null;
  openerElement: HTMLElement | null;
  onClose: () => void;
}

export function BiographyDialog({
  character,
  openerElement,
  onClose,
}: BiographyDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(openerElement);

  useEffect(() => {
    if (openerElement) {
      openerRef.current = openerElement;
    }
  }, [openerElement]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (character && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    } else if (!character && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [character]);

  const handleNativeClose = () => {
    const opener = openerRef.current;
    if (opener && document.contains(opener)) {
      requestAnimationFrame(() => {
        if (opener && document.contains(opener)) {
          opener.focus();
        }
      });
    }
    onClose();
  };

  const handleManualClose = () => {
    const dialog = dialogRef.current;
    if (dialog && dialog.open && typeof dialog.close === "function") {
      dialog.close();
    } else {
      handleNativeClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      handleManualClose();
    }
  };

  if (!character) {
    return (
      <dialog
        ref={dialogRef}
        aria-labelledby="biography-dialog-title"
        onClose={handleNativeClose}
        className="app-dialog biography-dialog"
      />
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="biography-dialog-title"
      onClose={handleNativeClose}
      onClick={handleBackdropClick}
      className="app-dialog biography-dialog"
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <img
            src={character.avatarUrl}
            alt={character.avatarAlt}
            width={96}
            height={96}
            decoding="async"
            className="dialog-avatar"
          />
          <div className="dialog-title-group">
            <h2 id="biography-dialog-title" className="dialog-title">
              {character.name}
            </h2>
            <span className="dialog-subtitle">Biography &amp; Known Facts</span>
          </div>
        </header>

        <div className="dialog-body">
          <div className="dialog-bio-section">
            <p className="dialog-bio-text">{character.biography}</p>
          </div>

          <div className="dialog-facts-section">
            <h3 className="dialog-facts-heading">Source Facts</h3>
            <ul className="dialog-facts-list">
              {character.facts.map((fact, index) => (
                <li key={index} className="dialog-fact-item">
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer className="dialog-footer">
          <button
            type="button"
            className="btn btn-secondary dialog-close-btn"
            onClick={handleManualClose}
            aria-label={`Close biography for ${character.name}`}
          >
            Close
          </button>
        </footer>
      </div>
    </dialog>
  );
}

export default BiographyDialog;
