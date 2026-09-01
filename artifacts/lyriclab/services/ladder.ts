/**
 * The ranked ladder — the curve ruled by Viktor on 2026-08-31 and resolved
 * 2026-09-01 in `.claude/rules/lyriclab-game.md`.
 *
 * Four clauses hold at once, and they are the reason this is a module rather
 * than a few inline constants:
 *   - twenty ranks, counting DOWN inside each tier: Bronze 5 -> Bronze 1 ->
 *     Silver 5 -> ... -> Master 1. Promotion DECREASES the rank number.
 *   - the win share falls as tiers rise (50% -> 33% -> 25% -> 20%).
 *   - the loss is a flat fifth of the current rank's requirement, throughout.
 *   - Master therefore lands on eye-for-an-eye, and demotion gets genuinely
 *     easier as you climb: 28.6% of battles needed to hold Bronze, 50% Master.
 *
 * There is NO protected tier floor. Points fall through a rank floor and the
 * player lands at the top of the rank below carrying the deficit down; tier
 * boundaries behave exactly like rank boundaries. Ruled: "Progression should be
 * based on performance. if a player's performance is lacking, he should be
 * demoted."
 *
 * Time away is NOT decayed. The rule is that PERFORMANCE decides rank, and not
 * playing is not a performance.
 */

export type Tier = "Bronze" | "Silver" | "Gold" | "Master";

export const TIERS: Tier[] = ["Bronze", "Silver", "Gold", "Master"];

/** Points needed to promote out of any rank in the tier. */
export const TIER_REQUIREMENT: Record<Tier, number> = {
  Bronze: 50,
  Silver: 75,
  Gold: 100,
  Master: 125,
};

/**
 * A win is a flat 25 throughout. It is the constant Viktor proposed, and it is
 * the SHAPE that is ruled rather than this number: expressed as a share of the
 * rank it is 50 / 33 / 25 / 20 per cent, which is the falling win share.
 */
export const WIN_POINTS = 25;

/** The loss is a flat fifth of the current rank's requirement. */
export const LOSS_SHARE = 0.2;

export const RANKS_PER_TIER = 5;
export const TOTAL_RANKS = TIERS.length * RANKS_PER_TIER; // 20

export interface Rank {
  tier: Tier;
  /** 5 down to 1. Lower is better. */
  rank: number;
}

export interface LadderState extends Rank {
  /** Points banked inside the current rank, 0 .. requirement-1. */
  points: number;
}

export const ENTRY: LadderState = { tier: "Bronze", rank: 5, points: 0 };

/** Ladder index, 0 = Bronze 5 (entry) .. 19 = Master 1 (apex). */
export function toIndex({ tier, rank }: Rank): number {
  return TIERS.indexOf(tier) * RANKS_PER_TIER + (RANKS_PER_TIER - rank);
}

export function fromIndex(index: number): Rank {
  const clamped = Math.max(0, Math.min(TOTAL_RANKS - 1, index));
  return {
    tier: TIERS[Math.floor(clamped / RANKS_PER_TIER)]!,
    rank: RANKS_PER_TIER - (clamped % RANKS_PER_TIER),
  };
}

export function requirementFor(tier: Tier): number {
  return TIER_REQUIREMENT[tier];
}

export function lossPointsFor(tier: Tier): number {
  return Math.round(requirementFor(tier) * LOSS_SHARE);
}

/** Wins needed to promote out of a rank: 2 Bronze, 3 Silver, 4 Gold, 5 Master. */
export function winsToPromote(tier: Tier): number {
  return Math.ceil(requirementFor(tier) / WIN_POINTS);
}

/**
 * The win rate a player must beat to HOLD this rank, as a fraction.
 * loss / (win + loss) — 0.286 Bronze, 0.375 Silver, 0.444 Gold, 0.500 Master.
 *
 * This is the number the rank card prints beside the player's own rate. A rate
 * without its break-even is a statistic; a rate beside it is a verdict.
 */
export function breakEvenFor(tier: Tier): number {
  const loss = lossPointsFor(tier);
  return loss / (WIN_POINTS + loss);
}

/** Apply one battle result, promoting or demoting across as many ranks as needed. */
export function applyResult(state: LadderState, won: boolean): LadderState {
  let index = toIndex(state);
  let points = state.points + (won ? WIN_POINTS : -lossPointsFor(state.tier));

  // Promote while the rank is cleared, carrying the surplus up.
  while (points >= requirementFor(fromIndex(index).tier)) {
    if (index >= TOTAL_RANKS - 1) {
      // Master 1 is the apex: points bank rather than overflow.
      return { ...fromIndex(index), points: Math.min(points, requirementFor("Master") - 1) };
    }
    points -= requirementFor(fromIndex(index).tier);
    index += 1;
  }

  // Demote while points are negative, landing at the TOP of the rank below and
  // carrying the deficit down. No protected floor at a tier boundary.
  while (points < 0) {
    if (index <= 0) return { ...ENTRY, points: 0 }; // Bronze 5 is entry; nothing below it.
    index -= 1;
    points += requirementFor(fromIndex(index).tier);
  }

  return { ...fromIndex(index), points };
}

/** Replay an ordered list of battle outcomes from entry. */
export function ladderFromResults(results: boolean[]): LadderState {
  return results.reduce<LadderState>(applyResult, ENTRY);
}

export function formatRank({ tier, rank }: Rank): string {
  return `${tier} ${rank}`;
}

/** "you 41%" vs "hold 44.4%" — the two halves the rank card prints. */
export function formatPercent(fraction: number, dp = 0): string {
  return `${(fraction * 100).toFixed(dp)}%`;
}
