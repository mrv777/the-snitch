import { GoogleGenAI, Type } from "@google/genai";
import type {
  AINarrative,
  ForensicReport,
  EvidenceItem,
  Suspect,
  Verdict,
} from "./types";
import { VERDICT_CONFIG } from "./types";
import { formatCompactUsd, formatPercent } from "@/lib/utils/format";

// --- Singleton AI Client ---

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";

// --- Structured Output Schema ---

const NARRATIVE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    caseNarrative: {
      type: Type.STRING,
      description:
        "3-5 paragraphs telling the forensic story. Use specific data points, timestamps, and amounts.",
    },
    keyFindings: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
        description: "A key finding, under 100 characters.",
      },
      description: "Exactly 3 key findings, each under 100 characters.",
    },
    shareableLine: {
      type: Type.STRING,
      description:
        "Under 120 characters. Works as a tweet. Punchy, memorable summary.",
    },
    verdictLabel: {
      type: Type.STRING,
      description:
        "One of: HIGHLY SUSPICIOUS, SUSPICIOUS, NOTABLE, INCONCLUSIVE, CLEAN",
    },
  },
  required: ["caseNarrative", "keyFindings", "shareableLine", "verdictLabel"],
  propertyOrdering: [
    "caseNarrative",
    "keyFindings",
    "shareableLine",
    "verdictLabel",
  ],
};

// --- System Prompt ---

function buildSystemPrompt(): string {
  return `You are The Snitch, an AI forensic intelligence agent that analyzes on-chain data to detect suspicious trading activity. You write case narratives like a seasoned financial crimes investigator.

## CONTEXT
You will receive the suspicion score (0-100) and verdict label. Calibrate your tone:
- HIGH scores (80+): Build tension. Emphasize specific timing, amounts, connections.
- MEDIUM scores (40-79): Analytical. Note patterns but acknowledge uncertainty.
- LOW scores (0-39): Brief. Note the investigation found limited evidence.

## TONE
- Professional but sharp. Think FBI financial crimes report meets crypto Twitter.
- Use specific data: addresses (truncated), amounts, timestamps, percentages.
- Build narrative tension: "At T-6 hours... then at T-4 hours... and when the pump hit..."
- Never accuse directly. Use phrases like "highly correlated," "notable timing," "warrants further investigation."
- End with a memorable one-liner that works as a tweet.

## DO NOT
- Use generic filler ("In the world of crypto...")
- Make moral judgments
- Claim certainty about intent

## OUTPUT RULES
- caseNarrative: 3-5 paragraphs. Build from discovery through evidence to conclusion.
- keyFindings: Exactly 3 items, each under 100 characters. Most impactful data points.
- shareableLine: Under 120 characters. Tweet-ready. Punchy and specific.
- verdictLabel: Must match the verdict provided in the data context.`;
}

// --- User Prompt Builder ---

function buildUserPrompt(report: ForensicReport): string {
  const { subject, suspicionScore, verdict, anomaly, suspects, clusters, evidence, timeline } = report;

  const verdictLabel = VERDICT_CONFIG[verdict].label;

  let prompt = `Generate a forensic case narrative for this investigation.

## INVESTIGATION CONTEXT
- Case ID: ${report.caseId}
- Token: ${subject.name} (${subject.symbol}) on ${subject.chain}
- Token Address: ${subject.address}
- Suspicion Score: ${suspicionScore}/100
- Verdict: ${verdictLabel}
`;

  if (subject.marketCapUsd) {
    prompt += `- Market Cap: ${formatCompactUsd(subject.marketCapUsd)}\n`;
  }

  if (anomaly) {
    prompt += `
## ANOMALY DETECTED
- Date: ${anomaly.date}
- Direction: ${anomaly.direction.toUpperCase()}
- Price Change: ${formatPercent(anomaly.priceChangePct)}
- Volume: ${formatCompactUsd(anomaly.volume)}
`;
  }

  if (suspects.length > 0) {
    prompt += `\n## TOP SUSPECTS\n`;
    for (const s of suspects) {
      prompt += formatSuspectBlock(s);
    }
  }

  if (clusters.length > 0) {
    prompt += `\n## WALLET CONNECTIONS\n`;
    for (const c of clusters) {
      prompt += `- ${c.connectionType.replace(/_/g, " ")}: ${c.description}\n`;
    }
  }

  if (evidence.length > 0) {
    prompt += `\n## EVIDENCE BREAKDOWN\n`;
    for (const e of evidence) {
      prompt += formatEvidenceBlock(e);
    }
  }

  if (timeline.length > 0) {
    prompt += `\n## FORENSIC TIMELINE\n`;
    for (const t of timeline.slice(0, 10)) {
      prompt += `- [${t.relativeLabel}] ${t.description}`;
      if (t.volumeUsd) prompt += ` (${formatCompactUsd(t.volumeUsd)})`;
      prompt += `\n`;
    }
  }

  prompt += `\nIMPORTANT: The verdictLabel in your response MUST be exactly "${verdictLabel}".`;

  return prompt;
}

function formatSuspectBlock(s: Suspect): string {
  const addr = s.address.slice(0, 6) + "..." + s.address.slice(-4);
  let block = `\n### Suspect #${s.rank}: ${s.entityName || addr}\n`;
  block += `- Address: ${addr}\n`;
  block += `- Timing Advantage: ${s.timingAdvantage.toFixed(1)}h before price move\n`;
  block += `- Volume: ${formatCompactUsd(s.volumeUsd)}\n`;
  block += `- Action: ${s.action}\n`;
  if (s.pnlUsd !== undefined) block += `- PnL: ${formatCompactUsd(s.pnlUsd)} (${formatPercent(s.pnlPercent ?? 0)})\n`;
  if (s.isDexVisible) block += `- DEX Visible: Yes (on-chain traceable)\n`;
  if (s.label) block += `- Label: ${s.label}\n`;
  return block;
}

function formatEvidenceBlock(e: EvidenceItem): string {
  const name = e.factor.replace(/_/g, " ");
  return `- ${name}: ${e.subScore}/100 (weight ${(e.weight * 100).toFixed(0)}%) — ${e.description}\n`;
}

// --- Gemini Call ---

async function callGemini(
  userPrompt: string,
  model: string
): Promise<string> {
  const response = await getAI().models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction: buildSystemPrompt(),
      responseMimeType: "application/json",
      responseJsonSchema: NARRATIVE_RESPONSE_SCHEMA,
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

// --- Parse + Validate ---

function parseNarrativeResponse(
  text: string,
  expectedVerdict: string
): AINarrative {
  const parsed = JSON.parse(text) as AINarrative;

  // Validate required fields
  if (!parsed.caseNarrative || typeof parsed.caseNarrative !== "string") {
    throw new Error("Missing or invalid caseNarrative");
  }
  if (!Array.isArray(parsed.keyFindings) || parsed.keyFindings.length === 0) {
    throw new Error("Missing or empty keyFindings");
  }
  if (!parsed.shareableLine || typeof parsed.shareableLine !== "string") {
    throw new Error("Missing or invalid shareableLine");
  }

  // Enforce exactly 3 key findings, truncate/pad
  if (parsed.keyFindings.length > 3) {
    parsed.keyFindings = parsed.keyFindings.slice(0, 3);
  }
  while (parsed.keyFindings.length < 3) {
    parsed.keyFindings.push("Further investigation recommended");
  }

  // Enforce 100-char limit on key findings
  parsed.keyFindings = parsed.keyFindings.map((f) =>
    f.length > 100 ? f.slice(0, 97) + "..." : f
  );

  // Enforce 120-char limit on shareable line
  if (parsed.shareableLine.length > 120) {
    parsed.shareableLine = parsed.shareableLine.slice(0, 117) + "...";
  }

  // Force verdict to match computed verdict
  parsed.verdictLabel = expectedVerdict;

  return parsed;
}

// --- Programmatic Fallback ---

export function buildProgrammaticNarrative(
  report: ForensicReport
): AINarrative {
  const { subject, suspicionScore, verdict, anomaly, suspects, evidence } = report;
  const verdictLabel = VERDICT_CONFIG[verdict].label;

  // Build narrative from evidence items
  let narrative = "";

  if (anomaly) {
    narrative += `An investigation into ${subject.name} (${subject.symbol}) on ${subject.chain} flagged a significant ${anomaly.direction} event on ${anomaly.date}, with a ${formatPercent(anomaly.priceChangePct)} price move on ${formatCompactUsd(anomaly.volume)} in volume.\n\n`;
  } else {
    narrative += `An investigation into ${subject.name} (${subject.symbol}) on ${subject.chain} found no significant anomalous price activity within the analyzed period.\n\n`;
  }

  if (suspects.length > 0) {
    narrative += `The investigation identified ${suspects.length} suspect wallet${suspects.length > 1 ? "s" : ""}. `;
    const top = suspects[0];
    const addr = top.address.slice(0, 6) + "..." + top.address.slice(-4);
    narrative += `The primary suspect (${top.entityName || addr}) showed a ${top.timingAdvantage.toFixed(1)}-hour timing advantage, with ${formatCompactUsd(top.volumeUsd)} in ${top.action} activity before the price move.`;
    if (top.pnlUsd !== undefined) {
      narrative += ` This wallet realized ${formatCompactUsd(top.pnlUsd)} in profit (${formatPercent(top.pnlPercent ?? 0)}).`;
    }
    narrative += `\n\n`;
  }

  if (evidence.length > 0) {
    const topFactors = evidence
      .filter((e) => e.subScore >= 50)
      .sort((a, b) => b.weightedScore - a.weightedScore);
    if (topFactors.length > 0) {
      narrative += `Key evidence factors: ${topFactors.map((e) => `${e.factor.replace(/_/g, " ")} (${e.subScore}/100)`).join(", ")}.\n\n`;
    }
  }

  narrative += `Overall suspicion score: ${suspicionScore}/100. Verdict: ${verdictLabel}.`;

  // Key findings from top evidence
  const keyFindings: string[] = [];
  if (anomaly) {
    keyFindings.push(
      `${formatPercent(anomaly.priceChangePct)} ${anomaly.direction} detected on ${anomaly.date}`.slice(0, 100)
    );
  }
  if (suspects.length > 0) {
    const top = suspects[0];
    keyFindings.push(
      `Top suspect traded ${top.timingAdvantage.toFixed(1)}h before the move with ${formatCompactUsd(top.volumeUsd)} volume`.slice(0, 100)
    );
  }
  if (evidence.length > 0) {
    const best = evidence.reduce((a, b) =>
      a.weightedScore > b.weightedScore ? a : b
    );
    keyFindings.push(
      `${best.factor.replace(/_/g, " ")} scored ${best.subScore}/100`.slice(0, 100)
    );
  }

  // Pad to 3
  while (keyFindings.length < 3) {
    keyFindings.push("Further investigation recommended");
  }

  // Shareable line
  let shareableLine = `${subject.symbol}: ${verdictLabel} (${suspicionScore}/100)`;
  if (anomaly) {
    shareableLine += ` — ${formatPercent(anomaly.priceChangePct)} ${anomaly.direction}`;
  }
  if (shareableLine.length > 120) {
    shareableLine = shareableLine.slice(0, 117) + "...";
  }

  return {
    caseNarrative: narrative,
    keyFindings: keyFindings.slice(0, 3),
    shareableLine,
    verdictLabel,
  };
}

// --- Main Export ---

export async function generateNarrative(
  report: ForensicReport
): Promise<AINarrative> {
  const expectedVerdict = VERDICT_CONFIG[report.verdict].label;

  // Attempt 1: Primary model
  try {
    const text = await callGemini(buildUserPrompt(report), PRIMARY_MODEL);
    return parseNarrativeResponse(text, expectedVerdict);
  } catch (err) {
    console.warn(
      `Narrative generation failed (primary ${PRIMARY_MODEL}):`,
      err instanceof Error ? err.message : err
    );
  }

  // Attempt 2: Retry primary with more explicit prompt
  try {
    const retryPrompt =
      buildUserPrompt(report) +
      "\n\nPREVIOUS ATTEMPT FAILED TO PARSE. Return ONLY valid JSON matching the schema exactly. No markdown, no code fences.";
    const text = await callGemini(retryPrompt, PRIMARY_MODEL);
    return parseNarrativeResponse(text, expectedVerdict);
  } catch (err) {
    console.warn(
      `Narrative generation failed (primary retry):`,
      err instanceof Error ? err.message : err
    );
  }

  // Attempt 3: Fallback model
  try {
    const text = await callGemini(buildUserPrompt(report), FALLBACK_MODEL);
    return parseNarrativeResponse(text, expectedVerdict);
  } catch (err) {
    console.warn(
      `Narrative generation failed (fallback ${FALLBACK_MODEL}):`,
      err instanceof Error ? err.message : err
    );
  }

  // Attempt 4: Programmatic fallback
  console.warn("All AI attempts failed. Using programmatic narrative.");
  return buildProgrammaticNarrative(report);
}

// --- Exports for testing ---

export { buildUserPrompt, buildSystemPrompt, parseNarrativeResponse };
