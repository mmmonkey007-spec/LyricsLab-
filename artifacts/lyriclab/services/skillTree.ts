import type { ComponentProps } from "react";
import { Feather } from "@expo/vector-icons";

export type SkillTreeClass = "assassin" | "rider" | "trickster";
export type SkillType = "Active" | "Passive";
export type SkillIconName = ComponentProps<typeof Feather>["name"];

export interface SkillDefinition {
  id: string;
  name: string;
  type: SkillType;
  unlockLevel: number;
  effect: string;
  icon: SkillIconName;
  alwaysLocked?: boolean;
}

export interface SkillUnlockPair {
  level: number;
  skills: [SkillDefinition, SkillDefinition];
}

export const SKILL_TREE_TABS: Array<{ id: SkillTreeClass; label: string; comingSoon: boolean }> = [
  { id: "assassin", label: "Lyrical Assassin", comingSoon: false },
  { id: "rider", label: "Flow Rider", comingSoon: true },
  { id: "trickster", label: "Trickster", comingSoon: true },
];

export const ASSASSIN_SKILL_TREE: SkillUnlockPair[] = [
  {
    level: 5,
    skills: [
      {
        id: "killshot",
        name: "Killshot",
        type: "Active",
        unlockLevel: 5,
        effect: "Tag one bar before submitting; if it is your best-scored bar, Barz +20% this battle.",
        icon: "crosshair",
      },
      {
        id: "scout",
        name: "Scout",
        type: "Active",
        unlockLevel: 5,
        effect: "Read the bot's verse before you write yours.",
        icon: "eye",
      },
    ],
  },
  {
    level: 15,
    skills: [
      {
        id: "heavy-hitter",
        name: "Heavy Hitter",
        type: "Passive",
        unlockLevel: 15,
        effect: "Barz +25%.",
        icon: "zap",
      },
      {
        id: "short-and-sharp",
        name: "Short & Sharp",
        type: "Passive",
        unlockLevel: 15,
        effect: "Verses of 4 bars or fewer score +5% overall.",
        icon: "scissors",
      },
    ],
  },
  {
    level: 20,
    skills: [
      {
        id: "wildcard",
        name: "Wildcard",
        type: "Passive",
        unlockLevel: 20,
        effect: "One extra topic re-roll per battle. Shared: every class can take this skill.",
        icon: "shuffle",
      },
      {
        id: "on-fire-hunter",
        name: "On-Fire Hunter",
        type: "Passive",
        unlockLevel: 20,
        effect: "Your on-fire bonus rises from ×1.25 to ×1.5.",
        icon: "sun",
      },
    ],
  },
  {
    level: 25,
    skills: [
      {
        id: "momentum",
        name: "Momentum",
        type: "Passive",
        unlockLevel: 25,
        effect: "Each consecutive win adds +5% Barz, up to +25%; a loss resets the bonus.",
        icon: "trending-up",
      },
      {
        id: "comeback",
        name: "Comeback",
        type: "Passive",
        unlockLevel: 25,
        effect: "After a loss, your next battle scores Barz +25%.",
        icon: "rotate-ccw",
      },
    ],
  },
  {
    level: 30,
    skills: [
      {
        id: "heavy-hitter-ii",
        name: "Heavy Hitter II",
        type: "Passive",
        unlockLevel: 30,
        effect: "Upgrades Heavy Hitter to Barz +50%.",
        icon: "award",
      },
      {
        id: "new-skill-coming",
        name: "New skill coming",
        type: "Passive",
        unlockLevel: 30,
        effect: "Details will be revealed in a future update.",
        icon: "help-circle",
        alwaysLocked: true,
      },
    ],
  },
];