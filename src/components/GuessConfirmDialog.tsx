import { useEffect, useRef } from "react";
import type { Character } from "../data/characters.ts";

export interface GuessConfirmDialogProps {
  character: Character | null;
  openerElement: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (characterId: string) => void;
}

export function GuessConfirmDialog({
  character,
  openerElement,
  onCancel,
  onConfirm,
}: GuessConfirmDialogProps) {
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
    onCancel();
  };

  const handleCancelClick = () => {
    const dialog = dialogRef.current;
    if (dialog && dialog.open && typeof dialog.close === "function") {
      dialog.close();
    } else {
      handleNativeClose();
    }
  };

  const handleConfirmClick = () => {
    if (!character) return;
    const targetId = character.id;
    const dialog = dialogRef.current;
    if (dialog && dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
    onConfirm(targetId);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      handleCancelClick();
    }
  };

  if (!character) {
    return (
      <dialog
        ref={dialogRef}
        aria-labelledby="guess-confirm-dialog-title"
        onClose={handleNativeClose}
        className="app-dialog guess-confirm-dialog"
      />
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="guess-confirm-dialog-title"
      onClose={handleNativeClose}
      onClick={handleBackdropClick}
      className="app-dialog guess-confirm-dialog"
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <h2 id="guess-confirm-dialog-title" className="dialog-title">
            Confirm final guess: {character.name}?
          </h2>
        </header>

        <div className="dialog-body">
          <p className="guess-warning-note">
            <strong>Warning:</strong> Making a final guess ends this round
            immediately. If correct, you win! If incorrect, you lose and the
            secret identity will be revealed.
          </p>
        </div>

        <footer className="dialog-footer">
          <button
            type="button"
            className="btn btn-secondary dialog-cancel-btn"
            onClick={handleCancelClick}
            aria-label={`Cancel guess for ${character.name}`}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary dialog-confirm-btn"
            onClick={handleConfirmClick}
            aria-label={`Confirm guess for ${character.name}`}
          >
            Confirm guess
          </button>
        </footer>
      </div>
    </dialog>
  );
}

export default GuessConfirmDialog;
