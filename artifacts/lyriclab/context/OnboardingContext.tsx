import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type OnboardingQuest = 1 | 2 | 3 | 4;
export type MainQuestNumber = 1 | 2 | 3 | 4;
export type PlayerClass = "assassin" | "rider" | "metamorpher" | "trickster";

export interface RewardItem {
  label: string;
  icon: string;
}

export interface QuestReward {
  questNumber: number;
  questTitle: string;
  items: RewardItem[];
  energyRefund: number;
  tutorialKey?: string;
  navigatesTo?: string;
}

export interface MainQuestDef {
  questNumber: MainQuestNumber;
  questTitle: string;
  task: string;
  icon: string;
  accentColor: string;
}

interface PersistedOnboarding {
  onboardingComplete: boolean;
  currentQuest: OnboardingQuest | null;
  skillz: number;
  chosenClass: PlayerClass | null;
  mainQuest: MainQuestNumber | null;
}

interface OnboardingContextType extends PersistedOnboarding {
  isOnboarding: boolean;
  rewardQueue: QuestReward[];
  ogEverUnlocked: boolean;
  ogWalkthroughSeen: boolean;
  setOgWalkthroughSeen: (seen: boolean) => void;
  completeQuest: (quest: OnboardingQuest) => void;
  shiftRewardQueue: () => void;
  chooseClass: (cls: PlayerClass) => void;
  completeMainQuest: (quest: MainQuestNumber) => void;
  devSetOnboardingState: (partial: Partial<PersistedOnboarding>) => void;
  devResetOnboarding: () => void;
  devForceOGUnlock: () => void;
}

const STORAGE_KEY              = "lyriclab_onboarding_v1";
const STORAGE_KEY_OG_UNLOCKED  = "lyriclab_wc_ever_unlocked";
const STORAGE_KEY_OG_WALKTHROUGH = "lyriclab_og_walkthrough_seen";

export const QUEST_REWARDS: Record<OnboardingQuest, QuestReward> = {
  1: {
    questNumber: 1,
    questTitle: "First Bars",
    energyRefund: 1,
    items: [
      { label: "+50 Versatility", icon: "star" },
      { label: "+1 Energy", icon: "zap" },
    ],
  },
  2: {
    questNumber: 2,
    questTitle: "Take the Mic",
    energyRefund: 1,
    tutorialKey: "weakness_coach",
    items: [
      { label: "+50 Versatility", icon: "star" },
      { label: "OG unlocked", icon: "shield" },
      { label: "+1 Energy", icon: "zap" },
    ],
  },
  3: {
    questNumber: 3,
    questTitle: "On the Clock",
    energyRefund: 1,
    items: [
      { label: "+100 Versatility", icon: "star" },
      { label: "+1 Energy", icon: "zap" },
    ],
  },
  4: {
    questNumber: 4,
    questTitle: "Face the Bot",
    energyRefund: 2,
    navigatesTo: "/class-selection",
    items: [
      { label: "+150 Versatility", icon: "star" },
      { label: "+2 Energy", icon: "zap" },
      { label: "Choose Your Class", icon: "shield" },
    ],
  },
};

export const MAIN_QUESTS: Record<MainQuestNumber, MainQuestDef> = {
  1: {
    questNumber: 1,
    questTitle: "Back in the Booth",
    task: "Drop a scored session",
    icon: "edit-3",
    accentColor: "#00F5D4",
  },
  2: {
    questNumber: 2,
    questTitle: "Know Your Weakness",
    task: "Run an OG drill",
    icon: "shield",
    accentColor: "#9B5DE5",
  },
  3: {
    questNumber: 3,
    questTitle: "Into the Ring",
    task: "Step to the bot in Battle Rap",
    icon: "crosshair",
    accentColor: "#FF4D6D",
  },
  4: {
    questNumber: 4,
    questTitle: "Level Up",
    task: "Score 75 or better — no excuses",
    icon: "trending-up",
    accentColor: "#F5C518",
  },
};

const MAIN_QUEST_REWARDS: Record<MainQuestNumber, QuestReward> = {
  1: {
    questNumber: 1,
    questTitle: "Back in the Booth",
    energyRefund: 0,
    items: [{ label: "+100 Versatility", icon: "star" }],
  },
  2: {
    questNumber: 2,
    questTitle: "Know Your Weakness",
    energyRefund: 0,
    items: [{ label: "+100 Versatility", icon: "star" }],
  },
  3: {
    questNumber: 3,
    questTitle: "Into the Ring",
    energyRefund: 0,
    items: [{ label: "+150 Versatility", icon: "star" }],
  },
  4: {
    questNumber: 4,
    questTitle: "Level Up",
    energyRefund: 0,
    items: [{ label: "+200 Versatility", icon: "star" }],
  },
};

const QUEST_SKILLZ: Record<OnboardingQuest, number> = { 1: 50, 2: 50, 3: 100, 4: 150 };
const MAIN_QUEST_SKILLZ: Record<MainQuestNumber, number> = { 1: 100, 2: 100, 3: 150, 4: 200 };

const DEFAULT_PERSISTED: PersistedOnboarding = {
  onboardingComplete: false,
  currentQuest: 1,
  skillz: 0,
  chosenClass: null,
  mainQuest: null,
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [persisted, setPersisted] = useState<PersistedOnboarding>(DEFAULT_PERSISTED);
  const [rewardQueue, setRewardQueue] = useState<QuestReward[]>([]);
  const [ogEverUnlocked, setOgEverUnlocked]       = useState(false);
  const [ogWalkthroughSeen, setOgWalkthroughSeenState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedOnboarding;
          if (parsed.onboardingComplete && parsed.mainQuest === undefined) {
            parsed.mainQuest = 1;
          }
          setPersisted(parsed);
        }
      })
      .catch(() => {});
    AsyncStorage.getItem(STORAGE_KEY_OG_UNLOCKED)
      .then((v) => { if (v === "true") setOgEverUnlocked(true); })
      .catch(() => {});
    AsyncStorage.getItem(STORAGE_KEY_OG_WALKTHROUGH)
      .then((v) => { if (v === "true") setOgWalkthroughSeenState(true); })
      .catch(() => {});
  }, []);

  const savePersisted = useCallback((updater: (prev: PersistedOnboarding) => PersistedOnboarding) => {
    setPersisted((prev) => {
      const next = updater(prev);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const completeQuest = useCallback(
    (quest: OnboardingQuest) => {
      const nextQuest: OnboardingQuest | null = quest < 4 ? ((quest + 1) as OnboardingQuest) : null;
      setRewardQueue((q) => [...q, QUEST_REWARDS[quest]]);
      savePersisted((prev) => ({
        ...prev,
        currentQuest: nextQuest,
        skillz: prev.skillz + QUEST_SKILLZ[quest],
      }));
      // Quest 2 unlocks Coach — persist so it survives quest-state edge cases
      if (quest >= 2 && !ogEverUnlocked) {
        setOgEverUnlocked(true);
        AsyncStorage.setItem(STORAGE_KEY_OG_UNLOCKED, "true").catch(() => {});
      }
    },
    [savePersisted, ogEverUnlocked]
  );

  const shiftRewardQueue = useCallback(() => {
    setRewardQueue((q) => q.slice(1));
  }, []);

  const chooseClass = useCallback(
    (cls: PlayerClass) => {
      savePersisted((prev) => ({
        ...prev,
        chosenClass: cls,
        onboardingComplete: true,
        currentQuest: null,
        mainQuest: prev.mainQuest ?? 1,
      }));
    },
    [savePersisted]
  );

  const devSetOnboardingState = useCallback(
    (partial: Partial<PersistedOnboarding>) => {
      savePersisted((prev) => ({ ...prev, ...partial }));
      setRewardQueue([]);
    },
    [savePersisted]
  );

  const setOgWalkthroughSeen = useCallback((seen: boolean) => {
    setOgWalkthroughSeenState(seen);
    AsyncStorage.setItem(STORAGE_KEY_OG_WALKTHROUGH, seen ? "true" : "false").catch(() => {});
  }, []);

  const devResetOnboarding = useCallback(() => {
    setPersisted(DEFAULT_PERSISTED);
    setRewardQueue([]);
    setOgEverUnlocked(false);
    setOgWalkthroughSeenState(false);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PERSISTED)).catch(() => {});
    AsyncStorage.removeItem(STORAGE_KEY_OG_UNLOCKED).catch(() => {});
    AsyncStorage.removeItem(STORAGE_KEY_OG_WALKTHROUGH).catch(() => {});
  }, []);

  const devForceOGUnlock = useCallback(() => {
    setOgEverUnlocked(true);
    AsyncStorage.setItem(STORAGE_KEY_OG_UNLOCKED, "true").catch(() => {});
  }, []);

  const completeMainQuest = useCallback(
    (quest: MainQuestNumber) => {
      const nextQuest: MainQuestNumber | null = quest < 4 ? ((quest + 1) as MainQuestNumber) : null;
      setRewardQueue((q) => [...q, MAIN_QUEST_REWARDS[quest]]);
      savePersisted((prev) => ({
        ...prev,
        mainQuest: nextQuest,
        skillz: prev.skillz + MAIN_QUEST_SKILLZ[quest],
      }));
    },
    [savePersisted]
  );

  return (
    <OnboardingContext.Provider
      value={{
        ...persisted,
        isOnboarding: !persisted.onboardingComplete && persisted.currentQuest !== null,
        rewardQueue,
        ogEverUnlocked,
        ogWalkthroughSeen,
        setOgWalkthroughSeen,
        completeQuest,
        shiftRewardQueue,
        chooseClass,
        completeMainQuest,
        devSetOnboardingState,
        devResetOnboarding,
        devForceOGUnlock,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
