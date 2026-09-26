import AsyncStorage from "@react-native-async-storage/async-storage";

export const LOCAL_DATA_KEYS = [
  "lyriclab_sessions",
  "lyriclab_energy_v1",
  "lyriclab_onboarding_v1",
  "lyriclab_wc_ever_unlocked",
  "lyriclab_og_walkthrough_seen",
  "lyriclab_username",
  "lyriclab_install_id",
  "lyriclab_streak_flame_last_seen_v1",
  "lyriclab_competition_days_v1",
  "lyriclab_streak_freeze_reward_shown_v1",
  "lyriclab_class_xp_v1",
  "lyriclab_level_reward_shown_v1",
] as const;

export async function clearLocalAppData(): Promise<void> {
  await AsyncStorage.multiRemove([...LOCAL_DATA_KEYS]);
}