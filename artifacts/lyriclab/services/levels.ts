export function levelForXp(xp: number): number {
  let level = 1;
  while (level < 14 && xp >= 50 * (level + 1) * level) level += 1;
  return level;
}

export function xpEarnedForSession(finalScore: number, isDrill: boolean): number {
  const normal = Math.floor(finalScore / 10);
  return isDrill ? Math.floor(normal / 2) : normal;
}