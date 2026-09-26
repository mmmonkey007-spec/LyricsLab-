export type ChapterStep =
  | "scene_1"
  | "battle_1"
  | "scene_2"
  | "battle_2"
  | "scene_3"
  | "boss_battle"
  | "hook";

export type ChapterOutcome = "win" | "loss" | "draw";

export type ChapterCharacter = "BUZZ" | "RICO" | "CHILL" | "BEEF";
export type ChapterEmotion = "neutral" | "hyped" | "angry" | "serious" | "smug" | "laughing";

export type ChapterLine = {
  speaker: ChapterCharacter;
  text: string;
  emotion: ChapterEmotion;
};

export type ChapterOutcomeVariant = {
  text: string;
  emotion: ChapterEmotion;
};

/**
 * Every emotion slot is intentionally empty for now. The comic renderer resolves
 * an empty slot to CHARACTER_PORTRAITS, so art can be added one emotion at a time
 * without changing the script or scene layout.
 */
export const CHAPTER_PORTRAIT_SLOTS: Record<
  ChapterCharacter,
  Record<ChapterEmotion, import("react-native").ImageSourcePropType | null>
> = {
  BUZZ: { neutral: null, hyped: null, angry: null, serious: null, smug: null, laughing: null },
  RICO: { neutral: null, hyped: null, angry: null, serious: null, smug: null, laughing: null },
  CHILL: { neutral: null, hyped: null, angry: null, serious: null, smug: null, laughing: null },
  BEEF: { neutral: null, hyped: null, angry: null, serious: null, smug: null, laughing: null },
};

export const CHARACTER_PORTRAITS: Record<
  ChapterCharacter,
  import("react-native").ImageSourcePropType
> = {
  BUZZ: require("../assets/characters/buzz-idle.png"),
  RICO: require("../assets/characters/snap-idle.png"),
  CHILL: require("../assets/characters/chill-idle.png"),
  BEEF: require("../assets/characters/beef-idle.png"),
};

export function getChapterPortrait(
  character: ChapterCharacter,
  emotion: ChapterEmotion,
) {
  return CHAPTER_PORTRAIT_SLOTS[character][emotion] ?? CHARACTER_PORTRAITS[character];
}

// Chapter 1 is data-driven so the same comic renderer can preview every beat.
export const CHAPTER_ONE = {
  title: "The court, after dark",
  steps: {
    scene_1: {
      heading: "Scene 1",
      lines: [
        { speaker: "BUZZ", emotion: "hyped", text: "Yo, new face! You write? You gotta write. Everybody here writes. I'm Buzz. I'm fast. Wanna go?" },
        { speaker: "RICO", emotion: "smug", text: "Easy, rookie. Let the people see who walked in. ...Notebook in the back pocket, pen behind the ear. An assassin. You don't talk much, you just aim." },
        { speaker: "BEEF", emotion: "angry", text: "Assassins miss too." },
      ] satisfies ChapterLine[],
    },
    battle_1: {
      character: "BUZZ",
      tier: "bronze",
      win: { emotion: "laughing", text: "Okay okay okay, that last line? Cold. Again tomorrow." },
      loss: { emotion: "smug", text: "Ha! Speed kills. Yours just took the long way." },
    },
    scene_2: {
      heading: "Scene 2",
      lines: [
        { speaker: "CHILL", emotion: "serious", text: "Keep this: when you landed, you landed clean. That's the assassin in you. Fix this: you went quiet between the hits. A verse is more than its best bar." },
      ] satisfies ChapterLine[],
    },
    battle_2: {
      character: "RICO",
      tier: "silver",
      before: { emotion: "smug", text: "Topic's mine, crowd's mine. You just bring the bars. Deal?" },
      win: { emotion: "laughing", text: "The crowd went 'ooh' twice. I only counted once. Respect." },
      loss: { emotion: "serious", text: "Good show. Wrong ending. Come back when you've got one." },
    },
    scene_3: {
      heading: "Scene 3",
      lines: [
        { speaker: "BEEF", emotion: "serious", text: "You hit hard on paper. Assassins always do. Paper don't bleed. Me and you. Now." },
      ] satisfies ChapterLine[],
    },
    boss_battle: {
      character: "BEEF",
      tier: "gold",
      win: { emotion: "neutral", text: "One bar landed. One. That's one more than most." },
      loss: { emotion: "angry", text: "Your {weakestAxis} let you down. Go to Chill, run a drill on it, come back." },
    },
    hook: {
      lines: [
        { speaker: "BEEF", emotion: "neutral", text: "One bar landed. One. That's one more than most." },
        { speaker: "BEEF", emotion: "serious", text: "Don't get comfortable. There's a court across the river. They don't score you out of a thousand. They score you out of respect. And they already heard your name." },
      ] satisfies ChapterLine[],
    },
  },
  chapterTwo: {
    number: "Chapter 2",
    title: "Across the River",
    status: "coming soon",
  },
} as const;

export function outcomeCopy(
  win: ChapterOutcomeVariant,
  loss: ChapterOutcomeVariant,
  outcome: ChapterOutcome | null | undefined,
): ChapterOutcomeVariant | null {
  if (!outcome) return null;
  return outcome === "win" ? win : loss;
}

export function bossLossCopy(weakestAxis: string | null | undefined): ChapterOutcomeVariant {
  return {
    ...CHAPTER_ONE.steps.boss_battle.loss,
    text: CHAPTER_ONE.steps.boss_battle.loss.text.replace("{weakestAxis}", weakestAxis ?? "flow"),
  };
}