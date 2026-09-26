import { activeTopicsForDate, applyOnFireMultiplier, battleTopicPairForDate, calculateBattleFinalScore, determineBattleWinner, onFireWordMatches, onFireWordsForDate, rerollTopics, TOPIC_BANK } from "./battle-topics";

function equal(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

equal(JSON.stringify(activeTopicsForDate("2026-09-23")), JSON.stringify(activeTopicsForDate("2026-09-23")), "same date");
if (JSON.stringify(activeTopicsForDate("2026-09-23")) === JSON.stringify(activeTopicsForDate("2026-09-24"))) throw new Error("different dates must differ");
equal(applyOnFireMultiplier(72, "I carry the fire", ["fire"]).score, 90, "72 with fire");
equal(applyOnFireMultiplier(65, "I carry the fire", ["fire"]).score, 81, "65 with fire");
equal(applyOnFireMultiplier(80, "I carry the smoke", ["fire"]).score, 80, "80 without fire");
equal(onFireWordMatches("The fires rise", "fire"), true, "fires matches fire");
equal(rerollTopics("2026-09-23", 1), null, "second reroll refused");
equal(TOPIC_BANK.length, 200, "exactly 200 topics");
equal(new Set(TOPIC_BANK).size, 200, "topics are unique");
const dimensions = { rhyme_score: 50, flow_score: 50, wordplay_score: 50, originality_score: 50, storytelling_score: 50, humor_score: 100 };
equal(calculateBattleFinalScore(dimensions, [{ line_score: 60, matchesOnFire: true }, { line_score: 40, matchesOnFire: false }]), 575, "five-axis score with fire uplift");
equal(calculateBattleFinalScore(dimensions, [{ line_score: 60, matchesOnFire: false }], 3, "assassin"), 600, "class multiplier capped at two on mapped axis");
equal(determineBattleWinner(800, 799), "player", "winner from final scores");
equal(determineBattleWinner(500, 500), "draw", "equal final scores draw");
for (const day of ["2026-09-23", "2026-09-24"]) {
  equal(activeTopicsForDate(day).length, 12, `${day} has 12 topics`);
  equal(new Set(activeTopicsForDate(day)).size, 12, `${day} topics are unique`);
}
const currentPair = battleTopicPairForDate("2026-09-23", "test-battle");
const replacementPair = rerollTopics("2026-09-23", 0, currentPair);
if (!replacementPair || replacementPair.length !== 2) throw new Error("re-roll must return two topics");
if (replacementPair.some((topic) => currentPair.includes(topic))) throw new Error("re-roll pair overlaps current pair");
if (replacementPair.some((topic) => !activeTopicsForDate("2026-09-23").includes(topic))) throw new Error("re-roll topic is not active today");
for (const tier of ["bronze", "silver", "gold", "master"] as const) {
  const today = onFireWordsForDate("2026-09-23", tier);
  const tomorrow = onFireWordsForDate("2026-09-24", tier);
  if (JSON.stringify(today) === JSON.stringify(tomorrow)) throw new Error(`${tier} fallback words must vary by date`);
}
console.log("topic bank, daily uniqueness, re-roll, and fallback tests: PASS");
console.log("battle topics tests: PASS");