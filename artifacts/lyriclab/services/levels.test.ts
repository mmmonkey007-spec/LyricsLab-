import { levelForXp, xpEarnedForSession } from "./levels";

function equal(actual: number, expected: number, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

equal(levelForXp(0), 1, "0 XP");
equal(levelForXp(99), 1, "99 XP");
equal(levelForXp(100), 2, "100 XP");
equal(levelForXp(299), 2, "299 XP");
equal(levelForXp(300), 3, "300 XP");
equal(levelForXp(9100), 14, "9100 XP");
equal(levelForXp(50000), 14, "50000 XP cap");
equal(xpEarnedForSession(300, true), 15, "drill XP");
equal(xpEarnedForSession(300, false), 30, "normal XP");
console.log("levels tests: PASS");