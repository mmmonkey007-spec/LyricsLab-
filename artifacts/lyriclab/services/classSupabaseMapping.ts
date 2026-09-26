import type { PlayerClass } from "@/context/OnboardingContext";

export type SupabaseClass = "lyrical_assassin" | "flow_rider" | "trickster";

const PLAYER_TO_SUPABASE: Partial<Record<PlayerClass, SupabaseClass>> = {
  assassin: "lyrical_assassin",
  rider: "flow_rider",
  trickster: "trickster",
};

const SUPABASE_TO_PLAYER: Record<SupabaseClass, Exclude<PlayerClass, "metamorpher">> = {
  lyrical_assassin: "assassin",
  flow_rider: "rider",
  trickster: "trickster",
};

export function toSupabaseClass(playerClass: PlayerClass): SupabaseClass | null {
  const mapped = PLAYER_TO_SUPABASE[playerClass];
  if (mapped) return mapped;

  if (__DEV__) {
    console.warn(
      `[LyricLab] Skipping Supabase class sync for dormant class "${playerClass}".`,
    );
  }
  return null;
}

export function toPlayerClass(value: string | null | undefined): PlayerClass | null {
  if (!value) return null;
  return SUPABASE_TO_PLAYER[value as SupabaseClass] ?? null;
}