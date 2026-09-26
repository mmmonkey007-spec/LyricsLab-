export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  atRisk: boolean;
  playedToday: boolean;
  freezesHeld: number;
  freezeWillCoverToday: boolean;
  frosted: boolean;
  coveredDays: string[];
}

export interface StreakComputation extends StreakData {
  freezesEarnedTotal: number;
}

export function toDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateStr(date.getTime());
}

function freezeMilestone(day: number): boolean {
  return day === 3 || day === 7 || (day >= 30 && day % 30 === 0);
}

export function computeStreakAndFreezes(playedDays: Iterable<string>, today: string): StreakComputation {
  const dateSet = new Set(playedDays);
  const sortedDates = Array.from(dateSet).sort();
  if (!sortedDates.length) {
    return { currentStreak: 0, longestStreak: 0, atRisk: false, playedToday: false, freezesHeld: 0, freezeWillCoverToday: false, frosted: false, coveredDays: [], freezesEarnedTotal: 0 };
  }

  const playedToday = dateSet.has(today);
  const endDate = playedToday ? today : addDays(today, -1);
  const firstDate = sortedDates[0]!;
  let currentStreak = 0;
  let longestStreak = 0;
  let freezesHeld = 0;
  let freezesEarnedTotal = 0;
  let mostRecentCompletedDay: string | null = null;
  const coveredDays: string[] = [];

  for (let day = firstDate; day <= endDate; day = addDays(day, 1)) {
    if (dateSet.has(day)) {
      currentStreak += 1;
      mostRecentCompletedDay = day;
      if (freezeMilestone(currentStreak)) {
        freezesEarnedTotal += 1;
        freezesHeld = Math.min(2, freezesHeld + 1);
      }
      longestStreak = Math.max(longestStreak, currentStreak);
    } else if (currentStreak > 0 && freezesHeld > 0) {
      freezesHeld -= 1;
      coveredDays.push(day);
      mostRecentCompletedDay = day;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
      mostRecentCompletedDay = day;
    }
  }

  const atRisk = currentStreak > 0 && !playedToday;
  const lastCoveredDay = coveredDays[coveredDays.length - 1] ?? null;
  return {
    currentStreak,
    longestStreak,
    atRisk,
    playedToday,
    freezesHeld,
    freezeWillCoverToday: atRisk && freezesHeld > 0,
    frosted: lastCoveredDay !== null && lastCoveredDay === mostRecentCompletedDay,
    coveredDays,
    freezesEarnedTotal,
  };
}