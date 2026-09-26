export type BattleTier = "bronze" | "silver" | "gold" | "master";

export const TOPIC_BANK: string[] = [
  "The first time you got told no",
  "A friend who changed after the money",
  "Growing up in a house full of noise",
  "The job you quit on a Monday",
  "Why the underdog always eats last",
  "A city that never learned your name",
  "The day the lights got cut off",
  "Social media fame versus real respect",
  "Your mother's hands after a double shift",
  "The last dollar in your pocket",
  "Winning with nobody watching",
  "The group chat that went silent",
  "A promise you broke to yourself",
  "Trading sleep for the dream",
  "The corner store that knows everybody",
  "Your phone at three percent",
  "A teacher who saw something in you",
  "The comeback nobody expected",
  "Loyalty that came with a price tag",
  "Rain on the day of the big move",
  "The first car you could not afford to fix",
  "Being the new kid again",
  "A beat that saved your whole week",
  "The rival who made you better",
  "Fake friends at the finish line",
  "Starting from the bottom of the playlist",
  "The night bus and its regulars",
  "A secret you carried for years",
  "Money talks but who is listening",
  "The family business you did not want",
  "Your hometown in the rearview",
  "The haters who became your fans",
  "A pair of shoes you saved months for",
  "The mirror before a big night",
  "Clout that disappeared overnight",
  "A letter to your younger self",
  "The streets versus the classroom",
  "Your first real heartbreak",
  "When the crowd went quiet",
  "The one who got away with it",
  "A borrowed mic and a packed room",
  "Why the weekend never lasts",
  "The price of saying yes to everything",
  "A grandparent's advice you ignored",
  "The overtime nobody paid for",
  "Fame through a stranger's screen",
  "The block party that got shut down",
  "A dream you were afraid to say out loud",
  "Being broke in an expensive city",
  "The trophy that meant nothing",
  "Pressure from people who love you",
  "A game you lost on purpose",
  "The rumor that followed you",
  "Keeping it real versus keeping it quiet",
  "A world without the internet",
  "The best meal you ever had for cheap",
  "Your worst haircut and the week after",
  "Moving on without an apology",
  "The alarm clock versus your ambition",
  "A lesson learned in the hospital waiting room",
  "The day you finally stood up for yourself",
  "Old friends in new money",
  "What the landlord never fixed",
  "A hustle that started in a bedroom",
  "The playlist that tells your life story",
  "Signing a contract without reading it",
  "The last day of summer",
  "A neighbourhood before the new coffee shops",
  "Trust issues in the age of screenshots",
  "Your name spelled wrong on the trophy",
  "The first time you heard your own voice recorded",
  "A dog that knew you better than people",
  "The late fee that ruined your month",
  "A crown that nobody handed you",
  "Working two jobs and one dream",
  "Being underestimated because of your age",
  "The friend who always owes you money",
  "A power cut on the hottest night of the year",
  "The difference between rich and wealthy",
  "A road trip with no destination",
  "Your city after midnight",
  "The talent show you almost skipped",
  "Starting over in a language you barely speak",
  "The one who taught you how to lose",
  "Chasing likes instead of goals",
  "A secret recipe nobody wrote down",
  "The price of a first-class seat",
  "Getting kicked out of the cypher",
  "A summer job that changed your mind",
  "The medal you gave away",
  "Defending your hometown's reputation",
  "A robot taking your job",
  "When your idol let you down",
  "Standing out in a school uniform",
  "The phone call that changed everything",
  "A friendship that ended over a game",
  "What your sneakers have walked through",
  "The first apartment with no furniture",
  "Sunday dinner with the whole family",
  "A shortcut that took three years",
  "Talking big with nothing in the bank",
  "The underground versus the mainstream",
  "A coach who pushed too hard",
  "The scar with the best story",
  "Being famous for the wrong thing",
  "A bus stop in the pouring rain",
  "The morning after the big loss",
  "Paying off your mother's bills",
  "A villain who thinks he is the hero",
  "The quiet kid in the back of the class",
  "Learning to cook from a video",
  "What the streetlights have seen",
  "The day your team finally won",
  "Trusting your gut over the money",
  "A holiday you spent alone",
  "The rent is due and so is the dream",
  "An argument you won too late",
  "The birthday nobody remembered",
  "Going viral for all the wrong reasons",
  "A map drawn from memory",
  "The last one picked for the team",
  "Running late for the most important meeting",
  "A city that sleeps in the daytime",
  "The difference between a hobby and a calling",
  "Selling your first beat",
  "Your grandmother's kitchen radio",
  "The fight you walked away from",
  "A promise made on a rooftop",
  "The loudest person in the room",
  "Faking confidence until it became real",
  "A snowstorm that trapped the whole town",
  "The ex who still watches your stories",
  "When the student becomes the teacher",
  "Winter coats and empty pockets",
  "A song that sounds like home",
  "The math of living paycheck to paycheck",
  "An empty stadium after the final",
  "Choosing between two dreams",
  "The corner you swore you would leave",
  "Keeping a plant alive in a small apartment",
  "A night at the arcade with ten dollars",
  "Your first time on a plane",
  "The small print on the big deal",
  "Being the oldest sibling",
  "A stranger who helped you for nothing",
  "Fame that came too early",
  "The quiet before a storm",
  "Borrowed time and borrowed money",
  "A barbershop argument that never ends",
  "The graduation you almost missed",
  "What money cannot fix",
  "A comeback after an injury",
  "Mistaken for someone else",
  "The last train of the night",
  "Your hood in twenty years",
  "A crew that started with three people",
  "The final round of a rap battle",
  "The best advice from the worst person",
  "Pride that cost you a friendship",
  "Cooking dinner on a hot plate",
  "A long walk home after a bad day",
  "Your favourite sound in the whole city",
  "The difference between a critic and a hater",
  "A deadline at midnight",
  "The weight of a family name",
  "A hometown hero who never left",
  "The moment you realised you were grown",
  "Buying back your time",
  "When the music stops at the party",
  "A stolen bike and a lesson",
  "The prize money split five ways",
  "Your first stage and your shaking hands",
  "Luck versus hard work",
  "Talking to your future self",
  "A soundtrack for the worst week of your life",
  "The kid next door who made it big",
  "A glitch in your perfect plan",
  "Friends you only see at funerals",
  "The first snow of the year",
  "A secret talent nobody believes",
  "Saying goodbye to your childhood home",
  "The rules of the cafeteria",
  "Carrying the team on your back",
  "What your parents never told you",
  "A night drive with the windows down",
  "The day the power came back",
  "Paying for a mistake you did not make",
  "A wall covered in rejection letters",
  "Following a dream across the ocean",
  "Arguing with your own reflection",
  "The cheapest restaurant with the best food",
  "Holding a grudge for too long",
  "The day you stopped caring what they think",
  "A crowd chanting your name",
  "Finding peace in a loud house",
  "The cost of never taking a day off",
  "An old notebook full of rhymes",
  "A city built on second chances",
  "Making something out of nothing",
  "The last verse before the curtain",
];

const FIRE_WORDS: Record<BattleTier, string[]> = {
  bronze: ["back", "beat", "bright", "call", "change", "chase", "clean", "close", "cool", "day", "dream", "drop", "face", "fast", "free", "friend", "game", "glow", "goal", "gold", "home", "hope", "jump", "keep", "kind", "light", "line", "make", "move", "name", "night", "open", "place", "play", "real", "rise", "road", "side", "time", "turn"],
  silver: ["amber", "anchor", "answer", "artist", "balance", "banner", "battle", "better", "center", "chance", "circle", "clever", "danger", "distant", "echo", "effort", "engine", "famous", "future", "gather", "honest", "impact", "lesson", "matter", "mentor", "moment", "motion", "pattern", "people", "reason", "signal", "silver", "steady", "story", "talent", "travel", "trust", "winner", "wonder", "worthy"],
  gold: ["alloy", "apex", "arcade", "atlas", "cipher", "cinder", "comet", "complex", "current", "default", "delta", "dynamic", "elastic", "element", "factor", "fractal", "gravity", "harbor", "kinetic", "lattice", "lucid", "matrix", "method", "narrative", "orbit", "paradox", "plasma", "precise", "quantum", "radius", "random", "rebel", "subtext", "syntax", "tactic", "theory", "vector", "vivid", "volume", "zenith"],
  master: ["algorithm", "amplitude", "anomaly", "aphelion", "axiomatic", "bifurcate", "catalyst", "convergence", "dialectic", "diffusion", "dimension", "duality", "entropy", "ephemeral", "frequency", "harmonic", "infinite", "intrinsic", "isotope", "kinematic", "liminal", "magnitude", "meridian", "momentum", "nuance", "paradigm", "perimeter", "resonance", "spectrum", "stochastic", "sublime", "theorem", "topology", "transient", "trajectory", "velocity", "verbatim", "vortex", "wavelength", "xenolith"],
};

function seedFor(date: string): number {
  return [...date].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
}

function shuffle<T>(values: T[], seed: number): T[] {
  const result = [...values];
  let state = seed || 1;
  for (let i = result.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function activeTopicsForDate(utcDate: string): string[] {
  return shuffle(TOPIC_BANK, seedFor(utcDate)).slice(0, 12);
}

export function battleTopicPairForDate(utcDate: string, battleSeed: string): string[] {
  return shuffle(activeTopicsForDate(utcDate), seedFor(`${utcDate}:battle:${battleSeed}`)).slice(0, 2);
}

export function onFireWordsForDate(utcDate: string, tier: BattleTier): string[] {
  const words = FIRE_WORDS[tier];
  return shuffle(words, seedFor(`${utcDate}:${tier}`)).slice(0, 3);
}

export function onFireWordMatches(line: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}(?:s|es|ed|ing|'s)?\\b`, "i").test(line);
}

export function applyOnFireMultiplier(score: number, line: string, words: string[]): { score: number; onFire: boolean } {
  const onFire = words.some((word) => onFireWordMatches(line, word));
  return { score: onFire ? Math.round(score * 1.25) : score, onFire };
}

export type BattleScoreDimensions = {
  rhyme_score: number;
  flow_score: number;
  wordplay_score: number;
  originality_score: number;
  storytelling_score: number;
  humor_score: number;
};

export type BattleClass =
  | "assassin"
  | "lyrical_assassin"
  | "rider"
  | "flow_rider"
  | "trickster"
  | "metamorpher";
export type BattleWinner = "player" | "opponent" | "draw";
export const CLASS_SCORE_AXIS: Partial<Record<BattleClass, keyof BattleScoreDimensions>> = {
  assassin: "rhyme_score",
  lyrical_assassin: "rhyme_score",
  rider: "flow_score",
  flow_rider: "flow_score",
  trickster: "wordplay_score",
};

export function calculateClassAxisMultiplier(bonusIncrements: readonly number[] = []): number {
  const totalBonus = bonusIncrements.reduce(
    (sum, bonus) => sum + (Number.isFinite(bonus) ? Math.max(0, bonus) : 0),
    0,
  );
  return Math.min(2, 1 + totalBonus);
}

export function determineBattleWinner(playerScore: number, opponentScore: number): BattleWinner {
  return playerScore === opponentScore ? "draw" : playerScore > opponentScore ? "player" : "opponent";
}

/**
 * Deterministic battle score formula.
 *
 * Humor is intentionally excluded. Each five-axis score is 0..100 and the
 * resulting score is 0..1000. On-fire words affect every matching bar,
 * including bars below 70: adjustedLineSum = baseLineSum + 0.25 * fireLineSum.
 * A class skill hook is retained here so future active bonuses can be applied
 * only to the player's mapped axis; no active bonuses currently pass in.
 */
export function calculateBattleFinalScore(
  dimensions: BattleScoreDimensions,
  lines: Array<{ line_score: number; matchesOnFire: boolean }>,
  classMultiplier = 1,
  playerClass?: BattleClass,
): number {
  const boundedClassMultiplier = playerClass
    ? Math.min(2, Math.max(1, Number.isFinite(classMultiplier) ? classMultiplier : 1))
    : 1;
  const axisMultiplier = (axis: keyof BattleScoreDimensions) =>
    playerClass && CLASS_SCORE_AXIS[playerClass] === axis ? boundedClassMultiplier : 1;
  const axisSum =
    clampAxis(dimensions.rhyme_score) * axisMultiplier("rhyme_score") +
    clampAxis(dimensions.flow_score) * axisMultiplier("flow_score") +
    clampAxis(dimensions.wordplay_score) * axisMultiplier("wordplay_score") +
    clampAxis(dimensions.storytelling_score) * axisMultiplier("storytelling_score") +
    clampAxis(dimensions.originality_score) * axisMultiplier("originality_score");
  const baseLineSum = lines.reduce((sum, line) => sum + clampLine(line.line_score), 0);
  const fireLineSum = lines.reduce((sum, line) => sum + (line.matchesOnFire ? clampLine(line.line_score) : 0), 0);
  const fireMultiplier = baseLineSum === 0 ? 1 : (baseLineSum + 0.25 * fireLineSum) / baseLineSum;
  // The current skill hook has no active bonuses, so it is 1.0. When bonuses
  // are added, only the player's mapped class axis is multiplied above.
  return Math.round(Math.min(1000, 2 * axisSum * fireMultiplier));
}

function clampAxis(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function clampLine(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

export function rerollTopics(utcDate: string, used: number, currentTopics: string[] = []): string[] | null {
  if (used >= 1) return null;
  return shuffle(activeTopicsForDate(utcDate).filter((topic) => !currentTopics.includes(topic)), seedFor(`${utcDate}:reroll:${currentTopics.join("|")}`)).slice(0, 2);
}