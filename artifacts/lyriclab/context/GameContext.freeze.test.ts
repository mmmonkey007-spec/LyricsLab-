import { computeStreakAndFreezes } from "../services/streak";

function equal(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

const days = (count: number, start = "2026-01-01"): string[] => {
  const first = new Date(`${start}T00:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first);
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
};

const three = computeStreakAndFreezes(days(3), "2026-01-03");
equal(three.currentStreak, 3, "three-day streak");
equal(three.freezesHeld, 1, "three-day freeze");

const seven = computeStreakAndFreezes(days(7), "2026-01-07");
equal(seven.currentStreak, 7, "seven-day streak");
equal(seven.freezesHeld, 2, "seven-day freezes");

const covered = computeStreakAndFreezes(
  ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05"],
  "2026-01-05",
);
equal(covered.currentStreak, 4, "covered streak");
equal(covered.freezesHeld, 0, "covered freeze balance");
equal(JSON.stringify(covered.coveredDays), JSON.stringify(["2026-01-04"]), "covered day");

const broken = computeStreakAndFreezes(["2026-01-01", "2026-01-02", "2026-01-03"], "2026-01-06");
equal(broken.currentStreak, 0, "broken streak");

const thirty = computeStreakAndFreezes(days(30), "2026-01-30");
equal(thirty.freezesHeld, 2, "thirty-day freeze cap");
if (thirty.freezesHeld > 2) throw new Error("freeze balance exceeded two");

console.log("streak-freeze tests: PASS");