import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHARACTERS, type Character } from "../data/characters.ts";
import { createDecisionEngineAdapter } from "../engine/decisionAdapter.ts";
import {
  createErrorPolicyDecision,
  evaluateDecisionPolicy,
  validatePlayerInput,
} from "../engine/policy.ts";
import type {
  BackendIdentity,
  DecisionEngineAdapter,
  DecisionSchema,
  EngineReadinessState,
  PolicyThresholds,
  RoundSession,
  RoundStatus,
  TurnRecord,
} from "../engine/types.ts";

export const STARTER_PROMPTS = [
  "Do they work at night?",
  "Do they enjoy camping?",
  "Do they own a pet?",
] as const;

export type UseGameStateOptions = {
  adapter?: DecisionEngineAdapter;
  characters?: readonly Character[];
  pickSecretCharacter?: (characters: readonly Character[]) => Character;
  thresholds?: PolicyThresholds;
};

export type GameStateResult = {
  engineState: EngineReadinessState;
  backend: BackendIdentity;
  downloadProgress: number | null;
  engineError: string | null;
  initDurationMs: number | null;
  roundStatus: RoundStatus;
  secretCharacter: Character | null;
  guessedCharacterId: string | null;
  roundSchema: DecisionSchema | null;
  sessionCreateDurationMs: number | null;
  eliminatedIds: ReadonlySet<string>;
  questionInput: string;
  setQuestionInput: (value: string) => void;
  isSubmitting: boolean;
  questionCount: number;
  requestNumber: number;
  turns: readonly TurnRecord[];
  latestAnnouncement: string;
  startNewGame: () => Promise<void>;
  submitQuestion: (overrideText?: string) => Promise<void>;
  toggleEliminate: (characterId: string) => void;
  confirmGuess: (characterId: string) => void;
};

export function useGameState(options?: UseGameStateOptions): GameStateResult {
  const adapter = useMemo(
    () => options?.adapter ?? createDecisionEngineAdapter(),
    [options?.adapter]
  );
  const characters = options?.characters ?? CHARACTERS;
  const thresholds = options?.thresholds;
  const pickSecretCharacter = options?.pickSecretCharacter;

  const [engineState, setEngineState] =
    useState<EngineReadinessState>("uninitialized");
  const [backend, setBackend] = useState<BackendIdentity>({
    kind: "unavailable",
    badgeLabel: "Checking...",
  });
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [initDurationMs, setInitDurationMs] = useState<number | null>(null);

  const [roundStatus, setRoundStatus] = useState<RoundStatus>("idle");
  const [secretCharacter, setSecretCharacter] = useState<Character | null>(
    null
  );
  const [guessedCharacterId, setGuessedCharacterId] = useState<string | null>(
    null
  );
  const [roundSchema, setRoundSchema] = useState<DecisionSchema | null>(null);
  const [sessionCreateDurationMs, setSessionCreateDurationMs] = useState<
    number | null
  >(null);
  const [eliminatedIds, setEliminatedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [questionInput, setQuestionInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [requestNumber, setRequestNumber] = useState<number>(0);
  const [turns, setTurns] = useState<readonly TurnRecord[]>([]);
  const [latestAnnouncement, setLatestAnnouncement] = useState<string>("");

  const generationRef = useRef<number>(0);
  const sessionRef = useRef<RoundSession | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);
  const startAbortRef = useRef<AbortController | null>(null);
  const requestNumberRef = useRef<number>(0);
  const questionCountRef = useRef<number>(0);
  const engineStateRef = useRef<EngineReadinessState>("uninitialized");

  useEffect(() => {
    engineStateRef.current = engineState;
  }, [engineState]);

  useEffect(() => {
    let isMounted = true;
    const gen = generationRef.current;

    adapter
      .checkAvailability()
      .then((res) => {
        if (!isMounted || generationRef.current !== gen) return;
        setBackend(res.backend);
        setEngineState(res.readiness);
        engineStateRef.current = res.readiness;
        setInitDurationMs(res.initDurationMs ?? null);
      })
      .catch((err) => {
        if (!isMounted || generationRef.current !== gen) return;
        setEngineState("error");
        engineStateRef.current = "error";
        setEngineError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      isMounted = false;
      if (submitAbortRef.current) {
        submitAbortRef.current.abort();
        submitAbortRef.current = null;
      }
      if (startAbortRef.current) {
        startAbortRef.current.abort();
        startAbortRef.current = null;
      }
      if (sessionRef.current) {
        sessionRef.current.destroy();
        sessionRef.current = null;
      }
    };
  }, [adapter]);

  const startNewGame = useCallback(async () => {
    const gen = ++generationRef.current;

    if (submitAbortRef.current) {
      submitAbortRef.current.abort();
      submitAbortRef.current = null;
    }
    if (startAbortRef.current) {
      startAbortRef.current.abort();
      startAbortRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.destroy();
      sessionRef.current = null;
    }

    const startAc = new AbortController();
    startAbortRef.current = startAc;

    setIsSubmitting(false);
    setTurns([]);
    setEliminatedIds(new Set());
    requestNumberRef.current = 0;
    setRequestNumber(0);
    questionCountRef.current = 0;
    setQuestionCount(0);
    setGuessedCharacterId(null);
    setEngineError(null);
    setQuestionInput("");
    setRoundSchema(null);
    setSessionCreateDurationMs(null);

    let currentReadiness = engineStateRef.current;
    if (currentReadiness === "uninitialized") {
      try {
        const avail = await adapter.checkAvailability();
        if (generationRef.current !== gen || startAc.signal.aborted) return;
        currentReadiness = avail.readiness;
        setBackend(avail.backend);
        setEngineState(avail.readiness);
        engineStateRef.current = avail.readiness;
        if (avail.initDurationMs !== undefined) {
          setInitDurationMs(avail.initDurationMs);
        }
      } catch (err) {
        if (generationRef.current !== gen || startAc.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setEngineState("error");
        engineStateRef.current = "error";
        setEngineError(msg);
        setRoundStatus("idle");
        setLatestAnnouncement(`Failed to check engine availability: ${msg}`);
        return;
      }
    }

    if (currentReadiness !== "ready") {
      setEngineState("loading");
      engineStateRef.current = "loading";
      setDownloadProgress(null);
      try {
        const initRes = await adapter.initialize({
          signal: startAc.signal,
          onProgress: (fraction) => {
            if (generationRef.current === gen) {
              setDownloadProgress(fraction);
            }
          },
        });
        if (generationRef.current !== gen || startAc.signal.aborted) return;
        setBackend(initRes.backend);
        setInitDurationMs(initRes.initDurationMs);
        setEngineState("ready");
        engineStateRef.current = "ready";
      } catch (err) {
        if (generationRef.current !== gen || startAc.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setEngineState("error");
        engineStateRef.current = "error";
        setEngineError(msg);
        setRoundStatus("idle");
        setLatestAnnouncement(`Failed to initialize engine: ${msg}`);
        return;
      }
    }

    const chosen = pickSecretCharacter
      ? pickSecretCharacter(characters)
      : characters[Math.floor(Math.random() * characters.length)];

    try {
      const session = await adapter.createRoundSession(chosen.facts, {
        signal: startAc.signal,
      });
      if (generationRef.current !== gen || startAc.signal.aborted) {
        session.destroy();
        return;
      }
      sessionRef.current = session;
      setRoundSchema(session.schema);
      setSessionCreateDurationMs(session.createDurationMs);
      setSecretCharacter(chosen);
      setEngineState("ready");
      engineStateRef.current = "ready";
      setRoundStatus("playing");
      setLatestAnnouncement(
        `New round started. ${characters.length} suspects remain. Ask a yes or no question.`
      );
    } catch (err) {
      if (generationRef.current !== gen || startAc.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setEngineState("error");
      engineStateRef.current = "error";
      setEngineError(msg);
      setRoundStatus("idle");
      setLatestAnnouncement(`Failed to create round session: ${msg}`);
    } finally {
      if (startAbortRef.current === startAc) {
        startAbortRef.current = null;
      }
    }
  }, [adapter, characters, pickSecretCharacter]);

  const submitQuestion = useCallback(
    async (overrideText?: string) => {
      if (roundStatus !== "playing" || isSubmitting || !sessionRef.current) {
        return;
      }

      const rawText =
        overrideText !== undefined ? overrideText : questionInput;
      const validation = validatePlayerInput(rawText);

      if (!validation.valid) {
        if (overrideText !== undefined) {
          setQuestionInput(overrideText);
        }
        const turn: TurnRecord = {
          requestNumber: requestNumberRef.current,
          questionNumber: null,
          playerQuestion: rawText.trim(),
          policy: validation.decision,
          raw: null,
          inferenceDurationMs: null,
          timestampMs: Date.now(),
        };
        setTurns((prev) => [...prev, turn]);
        setLatestAnnouncement(validation.decision.message);
        return;
      }

      const nextReq = requestNumberRef.current + 1;
      requestNumberRef.current = nextReq;
      setRequestNumber(nextReq);
      setIsSubmitting(true);

      const ac = new AbortController();
      submitAbortRef.current = ac;
      const gen = generationRef.current;
      const activeSession = sessionRef.current;

      try {
        const { raw, inferenceDurationMs } = await activeSession.decide(
          validation.trimmed,
          { signal: ac.signal }
        );

        if (ac.signal.aborted || generationRef.current !== gen) {
          return;
        }

        const policy = evaluateDecisionPolicy(raw, thresholds);
        let nextQuestionNumber: number | null = null;

        if (policy.countsAsQuestion) {
          const nextQ = questionCountRef.current + 1;
          questionCountRef.current = nextQ;
          setQuestionCount(nextQ);
          setQuestionInput("");
          nextQuestionNumber = nextQ;
        } else {
          if (overrideText !== undefined) {
            setQuestionInput(overrideText);
          }
        }

        const turn: TurnRecord = {
          requestNumber: nextReq,
          questionNumber: nextQuestionNumber,
          playerQuestion: validation.trimmed,
          policy,
          raw,
          inferenceDurationMs,
          timestampMs: Date.now(),
        };

        setTurns((prev) => [...prev, turn]);
        setLatestAnnouncement(policy.message);
      } catch (_err) {
        if (ac.signal.aborted || generationRef.current !== gen) {
          return;
        }

        const errorPolicy = createErrorPolicyDecision();
        if (overrideText !== undefined) {
          setQuestionInput(overrideText);
        }
        const turn: TurnRecord = {
          requestNumber: nextReq,
          questionNumber: null,
          playerQuestion: validation.trimmed,
          policy: errorPolicy,
          raw: null,
          inferenceDurationMs: null,
          timestampMs: Date.now(),
        };
        setTurns((prev) => [...prev, turn]);
        setLatestAnnouncement(errorPolicy.message);
      } finally {
        if (generationRef.current === gen) {
          setIsSubmitting(false);
          if (submitAbortRef.current === ac) {
            submitAbortRef.current = null;
          }
        }
      }
    },
    [roundStatus, isSubmitting, questionInput, thresholds]
  );

  const toggleEliminate = useCallback(
    (characterId: string) => {
      if (roundStatus !== "playing") {
        return;
      }
      const target = characters.find((c) => c.id === characterId);
      const targetName = target ? target.name : characterId;

      setEliminatedIds((prev) => {
        const next = new Set(prev);
        if (next.has(characterId)) {
          next.delete(characterId);
          const remaining = characters.length - next.size;
          setLatestAnnouncement(
            `${targetName} restored. ${remaining} suspects remaining.`
          );
        } else {
          next.add(characterId);
          const remaining = characters.length - next.size;
          setLatestAnnouncement(
            `${targetName} eliminated. ${remaining} suspects remaining.`
          );
        }
        return next;
      });
    },
    [roundStatus, characters]
  );

  const confirmGuess = useCallback(
    (characterId: string) => {
      if (
        roundStatus !== "playing" ||
        eliminatedIds.has(characterId) ||
        !secretCharacter
      ) {
        return;
      }

      generationRef.current++;
      if (submitAbortRef.current) {
        submitAbortRef.current.abort();
        submitAbortRef.current = null;
      }
      setIsSubmitting(false);

      if (sessionRef.current) {
        sessionRef.current.destroy();
        sessionRef.current = null;
      }

      setGuessedCharacterId(characterId);
      const isWin = characterId === secretCharacter.id;
      setRoundStatus(isWin ? "won" : "lost");

      const qCount = questionCountRef.current;
      const qWord = qCount === 1 ? "question" : "questions";

      if (isWin) {
        setLatestAnnouncement(
          `Correct! You found ${secretCharacter.name} in ${qCount} ${qWord}!`
        );
      } else {
        const guessedName =
          characters.find((c) => c.id === characterId)?.name ?? characterId;
        setLatestAnnouncement(
          `Incorrect. You guessed ${guessedName}, but the secret character was ${secretCharacter.name}. Game over in ${qCount} ${qWord}.`
        );
      }
    },
    [roundStatus, eliminatedIds, secretCharacter, characters]
  );

  return {
    engineState,
    backend,
    downloadProgress,
    engineError,
    initDurationMs,
    roundStatus,
    secretCharacter,
    guessedCharacterId,
    roundSchema,
    sessionCreateDurationMs,
    eliminatedIds,
    questionInput,
    setQuestionInput,
    isSubmitting,
    questionCount,
    requestNumber,
    turns,
    latestAnnouncement,
    startNewGame,
    submitQuestion,
    toggleEliminate,
    confirmGuess,
  };
}
