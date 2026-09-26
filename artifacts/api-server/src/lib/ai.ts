import Anthropic from "@anthropic-ai/sdk";

export type BattleTier = "bronze" | "silver" | "gold" | "master";

export interface QuickStats {
  wordCount: number;
  lineCount: number;
  rhymePairs: number;
  multiSyllRhymes: number;
  allitCount: number;
  flowScore: number | null;
  uniqueRatio: number;
}

export interface ClaudeCall {
  text: string;
  costUsd: number;
}

export function priceCall(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  },
): number {
  const inputPerMillion = model.includes("sonnet") ? 3 : 3;
  const outputPerMillion = model.includes("sonnet") ? 15 : 15;
  const cacheReadPerMillion = 0.3;
  const cacheCreatePerMillion = 3.75;
  return (
    ((usage.input_tokens ?? 0) / 1_000_000) * inputPerMillion +
    ((usage.output_tokens ?? 0) / 1_000_000) * outputPerMillion +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * cacheReadPerMillion +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * cacheCreatePerMillion
  );
}

export interface LyricsScoreResult {
  scores: {
    rhyme_score: number;
    flow_score: number;
    wordplay_score: number;
    originality_score: number;
    storytelling_score: number;
    humor_score: number;
  };
  multiplier: number;
  finalScore: number;
  standoutLine: string;
  coachNote: string;
  weaknessOptions: Array<{ dimension: string; exercise: string }>;
}

export interface BattleLineBreakdown {
  line_number: number;
  line_score: number;
  techniques: string[];
  is_critical: boolean;
}

export interface BattleScoreResult {
  winner: "player" | "opponent" | "draw";
  player_relative_score: number;
  opponent_relative_score: number;
  player_dimension_scores: {
    rhyme_score: number;
    flow_score: number;
    wordplay_score: number;
    originality_score: number;
    storytelling_score: number;
    humor_score: number;
  };
  opponent_dimension_scores: {
    rhyme_score: number;
    flow_score: number;
    wordplay_score: number;
    originality_score: number;
    storytelling_score: number;
    humor_score: number;
  };
  player_line_breakdown: BattleLineBreakdown[];
  opponent_line_breakdown: BattleLineBreakdown[];
  verdict: string;
}

const JUDGE_MODEL = "claude-sonnet-5";
const OPPONENT_MODEL = "claude-sonnet-4-6";

const SCORE_SYSTEM_PROMPT = `You are a hip-hop and poetry craft judge. Analyze the submitted lyrics and return ONLY a JSON object — no markdown, no explanation, no backticks.

Score the verse across these six player-facing axes, in this order: Barz, Flow, Wordplay, Humor, Storytelling, Originality. Quality per line matters more than line count.

Barz: how much rhyme is landed and how long a chain is held — landings anywhere in the bar, not only line-ends. Not the cleverness of the rhyme, which is Wordplay.
Flow: whether the cadence is controlled against the beat, and whether a deliberate switch lands — consistency within a passage, plus the switch. Not raw syllable-matching.
Wordplay: what the writer does to a word's meaning or sound that a plain reading would miss — double meanings, re-parses, homophones, pronunciation bent to serve the rhyme chain. Not the presence of rhyme.
Humor: built, delivered jokes — a setup and a payoff. Not a comic tone, not darkness, not incidental exaggeration.
Storytelling: whether a story is being told — a turn, a consequence, an arc. Not persona, not era, not world-building.
Originality: technical singularity — rhymes, pronunciations and constructions no other writer would produce. Not novelty of subject matter; a common subject written in a voice nobody else has scores high.

Evaluate multi-syllabic rhyme passage units, internal rhyme chains, simultaneous rhyme tracks, naturalness under technical complexity, deliberate flow shifts, and sustained syllable density. Humor should be 0 when there is no comic intent.

Return exactly this JSON:
{"rhyme_score":0,"flow_score":0,"wordplay_score":0,"originality_score":0,"storytelling_score":0,"humor_score":0,"standout_line":"","coach_note":"","weakness_options":[{"dimension":"","exercise":""},{"dimension":"","exercise":""}],"multiplier":1.0,"multiplier_reason":"","line_breakdown":[{"line_number":1,"line_score":0,"techniques":[],"is_critical":false}]}

Rules:
- Aggregate scores are 0-100. multiplier is 1.0 to 3.0.
- weakness_options has exactly 2 entries. Valid dimensions: rhymeQuality, flowRhythm, wordplay, humorCraft, storytelling, originality.
- line_breakdown has exactly one entry per non-empty submitted line, in order.
- Do not return line text. The caller already has the submitted verse and will match text by line_number.
- line_score is 0-100. is_critical is true only for genuinely exceptional lines, roughly the top 10-15%.
- techniques may contain only: multi_syllabic_rhyme, single_rhyme, internal_rhyme, alliteration, assonance, good_flow, flow_break.`;

const BATTLE_SYSTEM_PROMPT = `You are a hip-hop craft judge scoring a head-to-head battle. Analyze both verses and return ONLY a JSON object — no markdown, no explanation, no backticks.

Score both verses across Barz, Flow, Wordplay, Humor, Storytelling, and Originality using the exact definitions above. Quality per line matters more than line count. Evaluate passage-level multi-syllabic and internal rhyme, simultaneous rhyme tracks, naturalness, deliberate flow shifts, and sustained syllable density. The winner gets exactly 100; calibrate the loser's relative score to the real quality gap: close 70-85, moderate 50-70, blowout below 40. Return a short, declarative hip-hop judge verdict of at most two sentences.

Return exactly this JSON:
{"winner":"player","player_relative_score":100,"opponent_relative_score":0,"player_dimension_scores":{"rhyme_score":0,"flow_score":0,"wordplay_score":0,"originality_score":0,"storytelling_score":0,"humor_score":0},"opponent_dimension_scores":{"rhyme_score":0,"flow_score":0,"wordplay_score":0,"originality_score":0,"storytelling_score":0,"humor_score":0},"player_line_breakdown":[{"line_number":1,"line_score":0,"techniques":[],"is_critical":false}],"opponent_line_breakdown":[{"line_number":1,"line_score":0,"techniques":[],"is_critical":false}],"verdict":""}

Rules:
- winner is exactly player or opponent; the winner's relative score is exactly 100 and the loser's is 0-99.
- Each line_breakdown has one entry per non-empty line, in order. Do not return line text; the caller already has both verses and will match text by line_number.
- techniques may contain only: multi_syllabic_rhyme, single_rhyme, internal_rhyme, alliteration, assonance, good_flow, flow_break.
- is_critical is true only for the top 10-15% of lines.`;

const TIER_SPECS: Record<BattleTier, { min: number; max: number; desc: string }> = {
  bronze: {
    min: 2,
    max: 2,
    desc: "Use a simple single-syllable AABB end rhyme, basic imagery, no wordplay, no internal rhyme, and slightly awkward flow. Sound like a very early beginner.",
  },
  silver: {
    min: 6,
    max: 8,
    desc: "Mix single and some multi-syllabic rhymes, with occasional internal rhyme and mostly consistent flow with minor variations. Competent but not impressive.",
  },
  gold: {
    min: 8,
    max: 10,
    desc: "Use regular multi-syllabic rhymes, some internal rhyme, consistent flow, and deliberate variation. Sound technically solid.",
  },
  master: {
    min: 10,
    max: 14,
    desc: "Use heavy multi-syllabic rhyme chains, strong internal rhyme throughout, deliberate flow shifts, and technically dense, genuinely challenging craft.",
  },
};

function anthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the API server.");
  }
  return new Anthropic({ apiKey });
}

async function callClaude(
  model: string,
  systemPrompt: string | null,
  userMessage: string,
  maxTokens: number,
  cacheSystemPrompt: boolean,
): Promise<ClaudeCall> {
  const response = await anthropicClient().messages.create({
    model,
    max_tokens: maxTokens,
    ...(systemPrompt
      ? {
          system: cacheSystemPrompt
            ? [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }]
            : systemPrompt,
        }
      : {}),
    messages: [{ role: "user", content: userMessage }],
  });

  const usage = response.usage;
  const costUsd = priceCall(model, usage);
  console.log(
    `[LyricLab AI] model=${model} stop_reason=${response.stop_reason ?? "unknown"} ` +
      `content_block_types=${response.content.map((block) => block.type).join(",") || "none"} ` +
      `input_tokens=${usage.input_tokens} output_tokens=${usage.output_tokens} ` +
      `cache_read_input_tokens=${usage.cache_read_input_tokens ?? 0} ` +
      `cache_creation_input_tokens=${usage.cache_creation_input_tokens ?? 0}`,
  );

  const text = response.content.find((block) => block.type === "text")?.text?.trim() ?? "";
  if (!text) throw new Error("Claude returned an empty response.");
  return { text, costUsd };
}

function extractJson(rawText: string): string {
  const clean = rawText.replace(/```json\s*|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Claude returned no JSON object.");
  return sanitizeJsonControlChars(clean.slice(start, end + 1));
}

function sanitizeJsonControlChars(value: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      output += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      output += character;
      inString = !inString;
      continue;
    }
    if (inString && character === "\n") output += "\\n";
    else if (inString && character === "\r") output += "\\r";
    else if (inString && character === "\t") output += "\\t";
    else output += character;
  }
  return output;
}

function clampScore(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : 0;
}

function clampMultiplier(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(3, value))
    : 1;
}

export function parseLyricsScore(rawText: string, quickStats: QuickStats): LyricsScoreResult {
  const result = JSON.parse(extractJson(rawText)) as Record<string, unknown>;
  const scores = {
    rhyme_score: clampScore(result.rhyme_score),
    flow_score: clampScore(result.flow_score),
    wordplay_score: clampScore(result.wordplay_score),
    originality_score: clampScore(result.originality_score),
    storytelling_score: clampScore(result.storytelling_score),
    humor_score: clampScore(result.humor_score),
  };
  const multiplier = clampMultiplier(result.multiplier);
  const flowForFinalScore = quickStats.flowScore === null ? 0 : scores.flow_score;
  const finalScore = Math.round(
    (scores.rhyme_score +
      flowForFinalScore +
      scores.wordplay_score +
      scores.originality_score +
      scores.storytelling_score) *
      multiplier,
  );
  const weaknessOptions = Array.isArray(result.weakness_options)
    ? result.weakness_options.filter(
        (option): option is { dimension: string; exercise: string } =>
          Boolean(option) &&
          typeof option === "object" &&
          typeof (option as Record<string, unknown>).dimension === "string" &&
          typeof (option as Record<string, unknown>).exercise === "string",
      )
    : [];

  return {
    scores,
    multiplier,
    finalScore,
    standoutLine: typeof result.standout_line === "string" ? result.standout_line : "",
    coachNote: typeof result.coach_note === "string" ? result.coach_note : "",
    weaknessOptions,
  };
}

export function parseBattleScore(rawText: string): BattleScoreResult {
  const result = JSON.parse(extractJson(rawText)) as BattleScoreResult;
  const validWinner = result.winner === "player" || result.winner === "opponent" || result.winner === "draw";
  const validShape =
    typeof result.player_relative_score === "number" &&
    typeof result.opponent_relative_score === "number" &&
    result.player_dimension_scores &&
    result.opponent_dimension_scores &&
    Array.isArray(result.player_line_breakdown) &&
    Array.isArray(result.opponent_line_breakdown) &&
    result.player_line_breakdown.length > 0 &&
    result.opponent_line_breakdown.length > 0 &&
    typeof result.verdict === "string";
  if (!validWinner || !validShape) {
    throw new Error("Battle scoring response was incomplete.");
  }
  return result;
}

export async function scoreLyricsWithClaude(lyrics: string, quickStats: QuickStats): Promise<ClaudeCall> {
  const userMessage = `LYRICS:
${lyrics}

PRE-COMPUTED STATS:
- Lines: ${quickStats.lineCount}
- Rhyme pairs: ${quickStats.rhymePairs}
- Multi-syllabic rhymes: ${quickStats.multiSyllRhymes}
- Alliteration hits: ${quickStats.allitCount}
- Flow consistency: ${quickStats.flowScore ?? "not available"}
- Lexical diversity: ${quickStats.uniqueRatio}%`;
  return callClaude(JUDGE_MODEL, SCORE_SYSTEM_PROMPT, userMessage, 2000, true);
}

export async function generateOpponentVerseWithClaude(
  word1: string,
  word2: string,
  difficulty: BattleTier,
  botName = "Beef",
): Promise<ClaudeCall> {
  const tier = TIER_SPECS[difficulty] ?? TIER_SPECS.bronze;
  const lineConstraint =
    tier.min === tier.max
      ? `Write EXACTLY ${tier.min} lines — no more, no fewer.`
      : `Write EXACTLY ${tier.min} to ${tier.max} lines, no more. Do not exceed ${tier.max} lines.`;
  const prompt = `You are ${botName}, a hip-hop battle rapper. Write a verse that naturally uses both of these words: "${word1}" and "${word2}".

${lineConstraint}

${tier.desc}

Keep the voice distinct to ${botName}. Do not mention being an AI.

Return ONLY the raw verse lines — no title, explanation, labels, or quotes.`;
  return callClaude(OPPONENT_MODEL, null, prompt, 600, false);
}

export async function judgeBattleWithClaude(
  playerLyrics: string,
  opponentLyrics: string,
): Promise<{ result: BattleScoreResult; costUsd: number }> {
  const call = await callClaude(
    JUDGE_MODEL,
    BATTLE_SYSTEM_PROMPT,
    `PLAYER VERSE:
${playerLyrics}

OPPONENT VERSE:
${opponentLyrics}`,
    3000,
    true,
  );
  return { result: parseBattleScore(call.text), costUsd: call.costUsd };
}

export async function generateOnFireWordsWithClaude(
  topics: string[],
  tier: BattleTier,
): Promise<ClaudeCall> {
  const rarity = tier === "bronze" ? "plain, common" : tier === "silver" ? "familiar but less common" : tier === "gold" ? "unusual and vivid" : "rare, precise, and sophisticated";
  const systemPrompt = `You select safe, single-word rhyme prompts for a lyric battle. Return exactly the requested comma-separated words and nothing else.`;
  return callClaude(
    JUDGE_MODEL,
    systemPrompt,
    `Choose exactly 3 single, rhymeable English words for today's lyric battle topics. They must fit these topics: ${topics.join(" | ")}. Tier: ${tier}; use ${rarity} vocabulary. Return ONLY a comma-separated list of exactly 3 words, with no explanation, punctuation beyond commas, or multi-word phrases.`,
    600,
    false,
  );
}