import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  DEFAULT_THRESHOLDS,
  evaluateDecisionPolicy,
} from "../src/engine/policy.ts";
import type { PolicyThresholds } from "../src/engine/types.ts";
import type { EvalCaseResult, EvalRunResult } from "../src/eval/evalHarness.tsx";

const BASE_URL = "http://localhost:5173";
const PERSISTENT_PROFILE_DIR = path.resolve(
  process.cwd(),
  ".cache/playwright-real-profile"
);
const REPORT_PATH = path.resolve(process.cwd(), "docs/evaluation-report.md");

function parseSplitArg(): "tuning" | "held_out" | "all" {
  const arg = process.argv.find((a) => a.startsWith("--split="));
  const value = arg?.split("=")[1];
  if (value === "tuning" || value === "held_out" || value === "all") {
    return value;
  }
  return "all";
}

async function isServerRunning(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerRunning(url)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for Vite server at ${url}`);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

type SplitMetrics = {
  total: number;
  questionKindAccuracy: number;
  supportsYesAccuracy: number;
  contradictsNoAccuracy: number;
  validTraitTotal: number;
  validTraitClarified: number;
  validTraitClarificationRate: number;
  validTraitAcceptanceRate: number;
  acceptedFactualTotal: number;
  acceptedFactualCorrect: number;
  acceptedFactualAccuracy: number;
  unknownToNoCount: number;
  nonTraitTotal: number;
  nonTraitCorrectClarifications: number;
  warmLatencyMedianMs: number;
  warmLatencyP95Ms: number;
  createMedianMs: number;
  failures: Array<{
    id: string;
    category: string;
    characterId: string;
    question: string;
    expected: string;
    actual: string;
    rawSummary: string;
  }>;
};

function computeMetrics(
  cases: readonly EvalCaseResult[],
  thresholds: PolicyThresholds
): SplitMetrics {
  let qKindCorrect = 0;
  let yesCorrect = 0;
  let yesTotal = 0;
  let noCorrect = 0;
  let noTotal = 0;

  let validTraitTotal = 0;
  let validTraitClarified = 0;
  let acceptedFactualTotal = 0;
  let acceptedFactualCorrect = 0;
  let unknownToNoCount = 0;
  let nonTraitTotal = 0;
  let nonTraitCorrectClarifications = 0;

  const failures: SplitMetrics["failures"] = [];

  for (const item of cases) {
    const { fixture, raw } = item;
    if (raw.question_kind.label === fixture.expectedQuestionKind) {
      qKindCorrect += 1;
    }
    if (fixture.expectedSupportsYes !== undefined) {
      yesTotal += 1;
      if (raw.supports_yes.label === fixture.expectedSupportsYes) {
        yesCorrect += 1;
      }
    }
    if (fixture.expectedContradictsNo !== undefined) {
      noTotal += 1;
      if (raw.contradicts_no.label === fixture.expectedContradictsNo) {
        noCorrect += 1;
      }
    }

    const decision = evaluateDecisionPolicy(raw, thresholds);
    const isValidTrait = fixture.expectedQuestionKind === "trait_question";

    if (isValidTrait) {
      validTraitTotal += 1;
      if (decision.outcome === "clarification") {
        validTraitClarified += 1;
      }
      if (decision.countsAsQuestion) {
        acceptedFactualTotal += 1;
        const expectedLabel = fixture.expectedAnswer ?? fixture.expectedOutcome;
        const actualLabel = decision.answer ?? decision.outcome;
        if (
          decision.outcome === fixture.expectedOutcome &&
          decision.answer === fixture.expectedAnswer
        ) {
          acceptedFactualCorrect += 1;
        } else {
          if (
            fixture.expectedOutcome === "unknown" &&
            decision.answer === "No"
          ) {
            unknownToNoCount += 1;
          }
          failures.push({
            id: fixture.id,
            category: fixture.category,
            characterId: fixture.characterId,
            question: fixture.question,
            expected: String(expectedLabel),
            actual: String(actualLabel),
            rawSummary: `qk=${raw.question_kind.label}(${raw.question_kind.confidence.toFixed(2)}), yes=${raw.supports_yes.label}(${raw.supports_yes.confidence.toFixed(2)}), no=${raw.contradicts_no.label}(${raw.contradicts_no.confidence.toFixed(2)})`,
          });
        }
      } else {
        failures.push({
          id: fixture.id,
          category: fixture.category,
          characterId: fixture.characterId,
          question: fixture.question,
          expected: `${fixture.expectedAnswer ?? fixture.expectedOutcome}`,
          actual: `clarification (${decision.message})`,
          rawSummary: `qk=${raw.question_kind.label}(${raw.question_kind.confidence.toFixed(2)}), yes=${raw.supports_yes.label}(${raw.supports_yes.confidence.toFixed(2)}), no=${raw.contradicts_no.label}(${raw.contradicts_no.confidence.toFixed(2)})`,
        });
      }
    } else {
      nonTraitTotal += 1;
      const expectedClarify = fixture.expectedOutcome === "clarification";
      const actualClarify =
        decision.outcome === "clarification" &&
        (raw.question_kind.label !== "trait_question" ||
          raw.question_kind.confidence < thresholds.questionKindThreshold);
      if (expectedClarify && actualClarify) {
        nonTraitCorrectClarifications += 1;
      } else {
        failures.push({
          id: fixture.id,
          category: fixture.category,
          characterId: fixture.characterId,
          question: fixture.question,
          expected: `${fixture.expectedQuestionKind} -> clarification`,
          actual: `${raw.question_kind.label} -> ${decision.outcome}${decision.answer ? ` (${decision.answer})` : ""}`,
          rawSummary: `qk=${raw.question_kind.label}(${raw.question_kind.confidence.toFixed(2)}), yes=${raw.supports_yes.label}(${raw.supports_yes.confidence.toFixed(2)}), no=${raw.contradicts_no.label}(${raw.contradicts_no.confidence.toFixed(2)})`,
        });
      }
    }
  }

  const latencies = cases
    .map((c) => c.inferenceDurationMs)
    .sort((a, b) => a - b);
  const createTimes = cases
    .map((c) => c.createDurationMs)
    .sort((a, b) => a - b);

  return {
    total: cases.length,
    questionKindAccuracy: cases.length > 0 ? qKindCorrect / cases.length : 0,
    supportsYesAccuracy: yesTotal > 0 ? yesCorrect / yesTotal : 0,
    contradictsNoAccuracy: noTotal > 0 ? noCorrect / noTotal : 0,
    validTraitTotal,
    validTraitClarified,
    validTraitClarificationRate:
      validTraitTotal > 0 ? validTraitClarified / validTraitTotal : 0,
    validTraitAcceptanceRate:
      validTraitTotal > 0
        ? (validTraitTotal - validTraitClarified) / validTraitTotal
        : 0,
    acceptedFactualTotal,
    acceptedFactualCorrect,
    acceptedFactualAccuracy:
      acceptedFactualTotal > 0
        ? acceptedFactualCorrect / acceptedFactualTotal
        : 0,
    unknownToNoCount,
    nonTraitTotal,
    nonTraitCorrectClarifications,
    warmLatencyMedianMs: percentile(latencies, 50),
    warmLatencyP95Ms: percentile(latencies, 95),
    createMedianMs: percentile(createTimes, 50),
    failures,
  };
}

function sweepTuningThresholds(tuningCases: readonly EvalCaseResult[]): Array<{
  thresholds: PolicyThresholds;
  metrics: SplitMetrics;
  score: number;
}> {
  const candidates: Array<{
    thresholds: PolicyThresholds;
    metrics: SplitMetrics;
    score: number;
  }> = [];
  for (let qk = 50; qk <= 90; qk += 5) {
    for (let ft = 50; ft <= 90; ft += 5) {
      const thresholds: PolicyThresholds = {
        questionKindThreshold: qk / 100,
        factThreshold: ft / 100,
      };
      const metrics = computeMetrics(tuningCases, thresholds);
      const meetsAcceptance = metrics.validTraitAcceptanceRate >= 0.7;
      const nonTraitRate =
        metrics.nonTraitTotal > 0
          ? metrics.nonTraitCorrectClarifications / metrics.nonTraitTotal
          : 1;
      // Score strongly rewards accepted factual accuracy, penalizes unknown-to-no,
      // and rewards valid-trait acceptance >= 70% + non-trait clarification accuracy.
      const score =
        metrics.acceptedFactualAccuracy * 100 +
        (meetsAcceptance ? 25 : -50) +
        metrics.validTraitAcceptanceRate * 15 +
        nonTraitRate * 20 -
        metrics.unknownToNoCount * 35;
      candidates.push({ thresholds, metrics, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatReport(
  run: EvalRunResult,
  tuningMetrics: SplitMetrics,
  heldOutMetrics: SplitMetrics,
  pinned: PolicyThresholds
): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const osVersion = execSync("sw_vers -productVersion").toString().trim();
  const arch = process.arch;

  const heldOutAcceptedPass = heldOutMetrics.acceptedFactualAccuracy >= 0.9;
  const heldOutAcceptancePass = heldOutMetrics.validTraitAcceptanceRate >= 0.7;

  const lines: string[] = [
    "# Decisions API Browser Evaluation Report",
    "",
    "## Provenance & Environment",
    "",
    `- **Date:** ${dateStr}`,
    `- **Node.js:** ${process.version}`,
    `- **Runtime / Polyfill:** \`${run.backend.packageName ?? "native"}@${run.backend.packageVersion ?? "browser"}\` (${run.backend.badgeLabel})`,
    `- **Model Checkpoint:** \`${run.backend.modelId ?? "native"}\` (device: \`${run.backend.device ?? "n/a"}\`, dtype: \`${run.backend.dtype ?? "n/a"}\`)`,
    `- **Schema Version:** \`${run.schemaVersion}\``,
    `- **Browser:** \`${run.userAgent}\``,
    `- **OS / Architecture:** macOS ${osVersion} (${arch})`,
    `- **Warm-up Protocol:** ${run.warmupCount} \`decide()\` calls discarded before measuring warm inference timings`,
    `- **Initialization / Download Duration:** ${run.initDurationMs.toFixed(1)} ms`,
    `- **Per-Round \`createRoundSession()\` Median Duration:** ${heldOutMetrics.createMedianMs.toFixed(2)} ms`,
    "",
    `## Pinned Policy Thresholds (Calibrated on Tuning Split \`n = ${tuningMetrics.total}\`)`,
    "",
    `- \`questionKindThreshold\`: \`${pinned.questionKindThreshold.toFixed(2)}\``,
    `- \`factThreshold\`: \`${pinned.factThreshold.toFixed(2)}\``,
    "",
    `## Tuning Split Summary (\`n = ${tuningMetrics.total}\`)`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Raw \`question_kind\` accuracy | ${pct(tuningMetrics.questionKindAccuracy)} |`,
    `| Raw \`supports_yes\` accuracy | ${pct(tuningMetrics.supportsYesAccuracy)} |`,
    `| Raw \`contradicts_no\` accuracy | ${pct(tuningMetrics.contradictsNoAccuracy)} |`,
    `| Valid single-trait acceptance rate | ${pct(tuningMetrics.validTraitAcceptanceRate)} (${tuningMetrics.validTraitTotal - tuningMetrics.validTraitClarified}/${tuningMetrics.validTraitTotal}) |`,
    `| Accepted factual answer accuracy | ${pct(tuningMetrics.acceptedFactualAccuracy)} (${tuningMetrics.acceptedFactualCorrect}/${tuningMetrics.acceptedFactualTotal}) |`,
    `| Post-policy \`unknown\`-to-\`No\` error count | ${tuningMetrics.unknownToNoCount} |`,
    `| Non-trait routing accuracy | ${tuningMetrics.nonTraitCorrectClarifications}/${tuningMetrics.nonTraitTotal} |`,
    "",
    `## Held-Out Evaluation Results (\`n = ${heldOutMetrics.total}\`)`,
    "",
    "| Metric | Observed | Benchmark Target | Status |",
    "| --- | --- | --- | --- |",
    `| Raw \`question_kind\` label accuracy | ${pct(heldOutMetrics.questionKindAccuracy)} | — | Recorded |`,
    `| Raw \`supports_yes\` label accuracy | ${pct(heldOutMetrics.supportsYesAccuracy)} | — | Recorded |`,
    `| Raw \`contradicts_no\` label accuracy | ${pct(heldOutMetrics.contradictsNoAccuracy)} | — | Recorded |`,
    `| Post-policy \`unknown\`-to-\`No\` error count | ${heldOutMetrics.unknownToNoCount} | Minimize (0 ideal) | Recorded |`,
    `| Valid-trait clarification rate | ${pct(heldOutMetrics.validTraitClarificationRate)} (${heldOutMetrics.validTraitClarified}/${heldOutMetrics.validTraitTotal}) | <= 30.0% | ${heldOutAcceptancePass ? "Pass" : "Below target (waiver/review)"} |`,
    `| Valid-trait acceptance rate | ${pct(heldOutMetrics.validTraitAcceptanceRate)} (${heldOutMetrics.validTraitTotal - heldOutMetrics.validTraitClarified}/${heldOutMetrics.validTraitTotal}) | >= 70.0% | ${heldOutAcceptancePass ? "Pass" : "Below target (waiver/review)"} |`,
    `| Accepted factual answer accuracy | ${pct(heldOutMetrics.acceptedFactualAccuracy)} (${heldOutMetrics.acceptedFactualCorrect}/${heldOutMetrics.acceptedFactualTotal}) | >= 90.0% | ${heldOutAcceptedPass ? "Pass" : "Below target (waiver/review)"} |`,
    `| Non-trait routing (\`identity_guess\` / \`needs_rephrase\`) | ${heldOutMetrics.nonTraitCorrectClarifications}/${heldOutMetrics.nonTraitTotal} | — | Recorded |`,
    `| Warm inference latency (median) | ${heldOutMetrics.warmLatencyMedianMs.toFixed(1)} ms | — | Recorded |`,
    `| Warm inference latency (p95) | ${heldOutMetrics.warmLatencyP95Ms.toFixed(1)} ms | — | Recorded |`,
    "",
    "## Held-Out Failure Listing",
    "",
  ];

  if (heldOutMetrics.failures.length === 0) {
    lines.push(`0 failures observed on the ${heldOutMetrics.total}-case held-out split.`);
  } else {
    lines.push(
      "| Fixture ID | Category | Character | Question | Expected | Actual | Raw Model Output |",
      "| --- | --- | --- | --- | --- | --- | --- |"
    );
    for (const f of heldOutMetrics.failures) {
      lines.push(
        `| \`${f.id}\` | ${f.category} | ${f.characterId} | ${f.question.replace(/\|/g, "\\|")} | ${f.expected} | ${f.actual} | \`${f.rawSummary}\` |`
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const split = parseSplitArg();
  let devServer: ChildProcess | null = null;

  if (!(await isServerRunning(BASE_URL))) {
    devServer = spawn("npm", ["run", "dev"], {
      stdio: "ignore",
      detached: false,
    });
    await waitForServer(BASE_URL);
  }

  const context = await chromium.launchPersistentContext(
    PERSISTENT_PROFILE_DIR,
    {
      channel: "chrome",
      headless: true,
      args: [
        "--enable-unsafe-webgpu",
        "--use-angle=metal",
        "--enable-features=Vulkan,UseSkiaRenderer",
        "--ignore-gpu-blocklist",
      ],
    }
  );

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${BASE_URL}/?eval=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => typeof window.__GUESS_WHO_EVAL__ !== "undefined",
      { timeout: 15_000 }
    );

    const runResult = await page.evaluate(async (targetSplit) => {
      return await window.__GUESS_WHO_EVAL__!.runSplit(targetSplit, {
        warmups: 3,
      });
    }, split);

    if (split === "tuning") {
      console.log(`=== Tuning Split Calibration (n=${runResult.results.length}) ===`);
      for (const r of runResult.results) {
        console.log(
          `${r.fixture.id} [${r.fixture.category}/${r.fixture.characterId}] "${r.fixture.question}" => qk=${r.raw.question_kind.label}(${r.raw.question_kind.confidence}) yes=${r.raw.supports_yes.label}(${r.raw.supports_yes.confidence}) no=${r.raw.contradicts_no.label}(${r.raw.contradicts_no.confidence}) | exp=(${r.fixture.expectedQuestionKind}, yes=${r.fixture.expectedSupportsYes ?? "-"}, no=${r.fixture.expectedContradictsNo ?? "-"})`
        );
      }
      const top = sweepTuningThresholds(runResult.results).slice(0, 5);
      console.log("\nTop 5 Threshold Candidates on Tuning Split:");
      for (const c of top) {
        console.log(
          `qk=${c.thresholds.questionKindThreshold.toFixed(2)} fact=${c.thresholds.factThreshold.toFixed(2)} => acceptedAcc=${pct(c.metrics.acceptedFactualAccuracy)} (${c.metrics.acceptedFactualCorrect}/${c.metrics.acceptedFactualTotal}), acceptRate=${pct(c.metrics.validTraitAcceptanceRate)}, unkToNo=${c.metrics.unknownToNoCount}, nonTrait=${c.metrics.nonTraitCorrectClarifications}/${c.metrics.nonTraitTotal}`
        );
      }
      return;
    }

    const tuningCases = runResult.results.filter(
      (r) => r.fixture.split === "tuning"
    );
    const heldOutCases = runResult.results.filter(
      (r) => r.fixture.split === "held_out"
    );

    const tuningMetrics = computeMetrics(tuningCases, DEFAULT_THRESHOLDS);
    const heldOutMetrics = computeMetrics(heldOutCases, DEFAULT_THRESHOLDS);

    const report = formatReport(
      runResult,
      tuningMetrics,
      heldOutMetrics,
      DEFAULT_THRESHOLDS
    );
    await fs.writeFile(REPORT_PATH, report, "utf8");
    console.log(report);
  } finally {
    await context.close();
    if (devServer) {
      devServer.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
