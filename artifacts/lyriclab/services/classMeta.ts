/**
 * Compact class metadata for surfaces that need the identity but not the
 * full pitch. `app/class-selection.tsx` owns the long-form copy; this is the
 * short form the profile tab and any future header uses.
 *
 * "metamorpher" is dormant rather than removed — the PlayerClass type still
 * includes it, so a lookup must not be able to return undefined.
 */
import type { ImageSourcePropType } from "react-native";
import type { PlayerClass } from "@/context/OnboardingContext";

export interface ClassMeta {
  name: string;
  emoji: string;
  accentColor: string;
  currency: string;
  portrait: ImageSourcePropType | null;
}

export const CLASS_META: Record<PlayerClass, ClassMeta> = {
  assassin: {
    name: "Lyrical Assassin",
    emoji: "🗡️",
    accentColor: "#F5C518",
    currency: "Barz",
    portrait: require("../assets/characters/assassin.png"),
  },
  rider: {
    name: "Flow Rider",
    emoji: "🌊",
    accentColor: "#00F5D4",
    currency: "Flow",
    portrait: require("../assets/characters/flow-rider.png"),
  },
  trickster: {
    name: "Trickster",
    emoji: "🎭",
    accentColor: "#FF2D78",
    currency: "Wordplay",
    portrait: require("../assets/characters/trickster.png"),
  },
  metamorpher: {
    name: "Shapeshifter",
    emoji: "🔮",
    accentColor: "#9B5DE5",
    currency: "Versatility",
    portrait: null,
  },
};
