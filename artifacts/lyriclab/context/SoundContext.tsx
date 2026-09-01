import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SFX_MUTED_KEY   = "lyriclab_sfx_muted";
const MUSIC_MUTED_KEY = "lyriclab_music_muted";

/** How many seconds before a track ends we begin the DJ crossfade. */
const CROSSFADE_SECS = 5;
/** How often (ms) we check playback position to detect the blend window. */
const POLL_MS        = 500;
/** Max volume for background music — leaves headroom for SFX on top. */
const BG_VOLUME      = 0.85;

// ─────────────────────────────────────────────────────────────────────────────
// SFX assets
// ─────────────────────────────────────────────────────────────────────────────

const SCRATCH_TAP_FILE =
  require("../assets/sounds/scratch-tap_1783057363620.mp3") as number;

// Three tap slots all point at the same file. The round-robin rotation
// prevents a player from cutting itself off when tapped rapidly.
const TAP_FILES = [
  SCRATCH_TAP_FILE,
  SCRATCH_TAP_FILE,
  SCRATCH_TAP_FILE,
] as const;

const NAMED_FILES = {
  scratch:       SCRATCH_TAP_FILE,
  success:       require("../assets/sounds/success-beatbox_1783057363764.mp3") as number,
  miss:          require("../assets/sounds/miss-scratch_1783057363837.mp3") as number,
  questComplete: require("../assets/sounds/quest_complete.wav") as number,
} as const;

type NamedSound = keyof typeof NAMED_FILES;

// ─────────────────────────────────────────────────────────────────────────────
// Background music — dual-player DJ crossfade
// ─────────────────────────────────────────────────────────────────────────────
//
// Each mode gets TWO pre-loaded AudioPlayer instances (slot 0 and slot 1).
// Since createAudioPlayer() binds a source at creation, the intro and battle
// channels each use two instances of the same file for seamless loop
// crossfades. The calm channel alternates Stars and Dreamer.
//
// Rotation: Intro A → Intro B → Intro A → … (seamless looped blend)
//           Stars → Dreamer → Stars → Dreamer → …
//           Blunt A → Blunt B → Blunt A → … (seamless looped blend)
//
// The poll fires every POLL_MS and checks (duration - currentTime). When
// that falls within CROSSFADE_SECS, the crossfade interval starts:
//   outgoing: volume BG_VOLUME → 0  over the remaining window
//   incoming: volume 0 → BG_VOLUME  over the same window
// After the window the outgoing player pauses + resets to 0, active slot flips.

export type BgMode = "intro" | "calm" | "battle";

const BG_TRACKS: Record<BgMode, [number, number]> = {
  intro: [
    require("../assets/sounds/intro-loop_1783057363927.mp3") as number,
    require("../assets/sounds/intro-loop_1783057363927.mp3") as number,
  ],
  calm: [
    require("../assets/sounds/menu_calm_stars.m4a")     as number,
    require("../assets/sounds/menu_calm_dreamer.m4a")   as number,
  ],
  battle: [
    require("../assets/sounds/battle_punchy_blunt.wav") as number,
    require("../assets/sounds/battle_punchy_blunt.wav") as number,
  ],
};

interface BgChannel {
  p:        [AudioPlayer, AudioPlayer];
  active:   0 | 1;     // which slot is currently audible
  crossing: boolean;   // crossfade in progress — don't trigger another
}

// ─────────────────────────────────────────────────────────────────────────────
// Context interface
// ─────────────────────────────────────────────────────────────────────────────

interface SoundContextValue {
  playTap:           () => void;
  playScratch:       () => void;
  playSuccess:       () => void;
  playMiss:          () => void;
  playQuestComplete: () => void;
  sfxMuted:          boolean;
  setSfxMuted:       (muted: boolean) => void;
  musicMuted:        boolean;
  setMusicMuted:     (muted: boolean) => void;
  /** Fade background music in for the given mode. Defaults to "intro".
   *  If the same mode is already audible (volume > 0) the call is a no-op
   *  so calm music continues seamlessly across home → Freestyle/Prompted/Blitz. */
  playBgMusic:     (fadeInMs?: number, mode?: BgMode) => void;
  stopBgMusicFade: (durationMs?: number) => void;
}

const SoundContext = createContext<SoundContextValue>({
  playTap:           () => {},
  playScratch:       () => {},
  playSuccess:       () => {},
  playMiss:          () => {},
  playQuestComplete: () => {},
  sfxMuted:          false,
  setSfxMuted:       () => {},
  musicMuted:        true,
  setMusicMuted:     () => {},
  playBgMusic:       () => {},
  stopBgMusicFade:   () => {},
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function SoundProvider({ children }: { children: React.ReactNode }) {
  // ── SFX refs ──────────────────────────────────────────────────────────────
  const tapPlayers   = useRef<(AudioPlayer | null)[]>([null, null, null]);
  const tapIndex     = useRef(0);
  const tapLastMs    = useRef(0);
  const namedPlayers = useRef<Partial<Record<NamedSound, AudioPlayer>>>({});

  // ── BG refs ───────────────────────────────────────────────────────────────
  const channels    = useRef<Partial<Record<BgMode, BgChannel>>>({});
  const activeMode  = useRef<BgMode>("intro");
  const pollTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const xfadeTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopFadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ready       = useRef(false);

  // ── Mute state ────────────────────────────────────────────────────────────
  const [sfxMuted, setSfxMutedState]     = useState(false);
  const [musicMuted, setMusicMutedState] = useState(true);
  const sfxMutedRef   = useRef(false);
  const musicMutedRef = useRef(true);

  useEffect(() => {
    AsyncStorage.getItem(SFX_MUTED_KEY).then((v) => {
      const m = v === "true";
      setSfxMutedState(m);
      sfxMutedRef.current = m;
    });
    AsyncStorage.getItem(MUSIC_MUTED_KEY).then((v) => {
      const m = v === null ? true : v === "true";
      setMusicMutedState(m);
      musicMutedRef.current = m;
    });
  }, []);

  const setSfxMuted = useCallback((muted: boolean) => {
    setSfxMutedState(muted);
    sfxMutedRef.current = muted;
    void AsyncStorage.setItem(SFX_MUTED_KEY, muted ? "true" : "false");
  }, []);

  const setMusicMuted = useCallback((muted: boolean) => {
    setMusicMutedState(muted);
    musicMutedRef.current = muted;
    void AsyncStorage.setItem(MUSIC_MUTED_KEY, muted ? "true" : "false");
    if (muted) {
      // Pause all bg players immediately
      const modes = Object.keys(channels.current) as BgMode[];
      for (const m of modes) {
        const ch = channels.current[m];
        if (!ch) continue;
        try { ch.p[0].pause(); ch.p[0].volume = 0; } catch { /* ignore */ }
        try { ch.p[1].pause(); ch.p[1].volume = 0; } catch { /* ignore */ }
      }
      if (pollTimer.current)  { clearInterval(pollTimer.current);  pollTimer.current  = null; }
      if (xfadeTimer.current) { clearInterval(xfadeTimer.current); xfadeTimer.current = null; }
    }
  }, []);

  // ── Initialise all players ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    function init() {
      try {
        // Fire audio-mode setup in the background — do NOT await it.
        // Awaiting it suspends this function and yields to the event loop,
        // so useFocusEffect fires playBgMusic() while channels are still
        // empty and the call silently no-ops. By keeping player creation
        // synchronous, channels are populated before any screen gets focus.
        setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

        // SFX tap players
        for (let i = 0; i < TAP_FILES.length; i++) {
          if (cancelled) break;
          tapPlayers.current[i] = createAudioPlayer(TAP_FILES[i]!);
        }
        // SFX named players
        const names = Object.keys(NAMED_FILES) as NamedSound[];
        for (const name of names) {
          if (cancelled) break;
          namedPlayers.current[name] = createAudioPlayer(NAMED_FILES[name]);
        }

        // BG channels — two players per mode, loop=false (manual crossfade)
        const modes = Object.keys(BG_TRACKS) as BgMode[];
        for (const mode of modes) {
          if (cancelled) break;
          const [src0, src1] = BG_TRACKS[mode];
          const p0 = createAudioPlayer(src0);
          const p1 = createAudioPlayer(src1);
          p0.loop = false; p0.volume = 0;
          p1.loop = false; p1.volume = 0;
          channels.current[mode] = { p: [p0, p1], active: 0, crossing: false };
        }

        if (!cancelled) ready.current = true;
      } catch {
        // Audio is non-critical — silently degrade
      }
    }

    init();

    return () => {
      cancelled = true;
      if (pollTimer.current)    { clearInterval(pollTimer.current);    pollTimer.current    = null; }
      if (xfadeTimer.current)   { clearInterval(xfadeTimer.current);   xfadeTimer.current   = null; }
      if (stopFadeTimer.current){ clearInterval(stopFadeTimer.current); stopFadeTimer.current = null; }
      tapPlayers.current.forEach((p) => { try { p?.remove(); } catch { /* ignore */ } });
      tapPlayers.current = [null, null, null];
      Object.values(namedPlayers.current).forEach((p) => { try { p?.remove(); } catch { /* ignore */ } });
      namedPlayers.current = {};
      const modes = Object.keys(channels.current) as BgMode[];
      for (const m of modes) {
        const ch = channels.current[m];
        if (!ch) continue;
        try { ch.p[0].remove(); } catch { /* ignore */ }
        try { ch.p[1].remove(); } catch { /* ignore */ }
      }
      channels.current = {};
      ready.current = false;
    };
  }, []);

  // ── Internal: start crossfade between slots ───────────────────────────────
  const startCrossfade = useCallback((ch: BgChannel, windowMs: number) => {
    ch.crossing = true;
    const outSlot = ch.active;
    const inSlot  = outSlot === 0 ? 1 : 0;
    const outP    = ch.p[outSlot];
    const inP     = ch.p[inSlot];

    // Kick the incoming player from the start
    try { inP.seekTo(0); inP.volume = 0; inP.play(); } catch { /* ignore */ }

    const duration = Math.max(windowMs, 500);  // never shorter than 0.5s
    const startVol = typeof outP.volume === "number" ? outP.volume : BG_VOLUME;
    const steps    = Math.max(1, Math.round(duration / 16));
    const interval = duration / steps;
    let   step     = 0;

    if (xfadeTimer.current) { clearInterval(xfadeTimer.current); xfadeTimer.current = null; }
    xfadeTimer.current = setInterval(() => {
      step++;
      const t = Math.min(1, step / steps);
      try { outP.volume = startVol * (1 - t); } catch { /* ignore */ }
      try { inP.volume  = BG_VOLUME * t;       } catch { /* ignore */ }

      if (step >= steps) {
        clearInterval(xfadeTimer.current!);
        xfadeTimer.current = null;
        try { outP.pause(); outP.volume = 0; outP.seekTo(0); } catch { /* ignore */ }
        ch.active   = inSlot as 0 | 1;
        ch.crossing = false;
      }
    }, interval);
  }, []);

  // ── Internal: polling loop that watches playback position ─────────────────
  const startPoll = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    pollTimer.current = setInterval(() => {
      if (musicMutedRef.current) return;
      const ch = channels.current[activeMode.current];
      if (!ch || ch.crossing) return;

      const activePlayer = ch.p[ch.active];
      let dur: number;
      let cur: number;
      try {
        dur = activePlayer.duration  as number;
        cur = activePlayer.currentTime as number;
      } catch { return; }

      if (!dur || isNaN(dur) || dur <= 0)   return;
      if (isNaN(cur) || cur < 0)            return;
      // Guard: track must be longer than 2× the crossfade window
      if (dur <= CROSSFADE_SECS * 2)        return;

      const remaining = dur - cur;

      if (remaining <= CROSSFADE_SECS && remaining > 0) {
        startCrossfade(ch, remaining * 1000);
      } else if (remaining <= 0) {
        // Track ended before poll caught it — hard-switch instantly
        startCrossfade(ch, 50);
      }
    }, POLL_MS);
  }, [startCrossfade]);

  // ── playBgMusic ───────────────────────────────────────────────────────────
  const playBgMusic = useCallback((fadeInMs = 900, mode: BgMode = "intro") => {
    if (musicMutedRef.current) return;

    const ch = channels.current[mode];
    if (!ch) return;

    // ── Cancel same-mode stop-fade BEFORE the early-return check ──────────
    // When a screen's useFocusEffect cleanup fires stopBgMusicFade(400) and
    // the next screen immediately calls playBgMusic for the SAME mode, the
    // stop-fade timer would otherwise complete after our early-return and
    // silently kill the player. Cancel it here so the music keeps playing.
    // For MODE SWITCHES (e.g. battle→calm) we intentionally leave the
    // outgoing stop-fade running so the tracks overlap — natural DJ cross.
    if (stopFadeTimer.current && mode === activeMode.current) {
      clearInterval(stopFadeTimer.current);
      stopFadeTimer.current = null;
    }

    // ── Seamless continuation: same mode at or near full volume ───────────
    const activeP = ch.p[ch.active];
    const curVol  = typeof activeP.volume === "number" ? activeP.volume : 0;
    if (mode === activeMode.current && curVol >= BG_VOLUME - 0.05) {
      startPoll();
      return;
    }

    // ── Switching modes or starting/resuming from silence/dip ─────────────
    // If a stop-fade is running (outgoing channel fading out), let it finish
    // naturally — this gives a smooth overlap when switching battle→calm.
    // Only hard-pause other channels when no fade is in progress.
    if (!stopFadeTimer.current) {
      const allModes = Object.keys(channels.current) as BgMode[];
      for (const m of allModes) {
        if (m === mode) continue;
        const other = channels.current[m];
        if (!other) continue;
        try { other.p[0].pause(); other.p[0].volume = 0; } catch { /* ignore */ }
        try { other.p[1].pause(); other.p[1].volume = 0; } catch { /* ignore */ }
      }
    }

    activeMode.current = mode;

    // Cancel any in-flight crossfade on the incoming channel
    if (xfadeTimer.current) { clearInterval(xfadeTimer.current); xfadeTimer.current = null; }

    // Fade in the active slot from its current volume (allows resume from dip)
    const fromVol = Math.min(curVol, BG_VOLUME);
    try { activeP.volume = fromVol; activeP.play(); } catch { return; }

    const steps    = Math.max(1, Math.round(fadeInMs / 16));
    const interval = fadeInMs / steps;
    let   step     = 0;
    xfadeTimer.current = setInterval(() => {
      step++;
      try { activeP.volume = fromVol + (BG_VOLUME - fromVol) * Math.min(1, step / steps); } catch { /* ignore */ }
      if (step >= steps) {
        clearInterval(xfadeTimer.current!);
        xfadeTimer.current = null;
      }
    }, interval);

    startPoll();
  }, [startPoll]);

  // Turning music on from Audio Settings should take effect immediately.
  // Focus handlers still select the appropriate mode during navigation.
  useEffect(() => {
    if (!musicMuted) {
      playBgMusic(900, activeMode.current);
    }
  }, [musicMuted, playBgMusic]);

  // ── stopBgMusicFade ───────────────────────────────────────────────────────
  const stopBgMusicFade = useCallback((durationMs = 400) => {
    // Stop the poll so no crossfade is triggered while fading out
    if (pollTimer.current)  { clearInterval(pollTimer.current);  pollTimer.current  = null; }
    if (xfadeTimer.current) { clearInterval(xfadeTimer.current); xfadeTimer.current = null; }

    const ch = channels.current[activeMode.current];
    if (!ch) return;

    // Capture current volumes of BOTH slots (crossfade may have both non-zero)
    const vols: [number, number] = [
      typeof ch.p[0].volume === "number" ? ch.p[0].volume : 0,
      typeof ch.p[1].volume === "number" ? ch.p[1].volume : 0,
    ];
    if (vols[0] <= 0 && vols[1] <= 0) return;  // already silent

    const steps    = Math.max(1, Math.round(durationMs / 16));
    const interval = durationMs / steps;
    let   step     = 0;

    if (stopFadeTimer.current) { clearInterval(stopFadeTimer.current); stopFadeTimer.current = null; }
    stopFadeTimer.current = setInterval(() => {
      step++;
      const t = Math.min(1, step / steps);
      for (let i = 0 as 0 | 1; i <= 1; i++) {
        const newVol = vols[i] * (1 - t);
        try { ch.p[i].volume = Math.max(0, newVol); } catch { /* ignore */ }
      }
      if (step >= steps) {
        clearInterval(stopFadeTimer.current!);
        stopFadeTimer.current = null;
        try { ch.p[0].pause(); ch.p[0].volume = 0; } catch { /* ignore */ }
        try { ch.p[1].pause(); ch.p[1].volume = 0; } catch { /* ignore */ }
        ch.crossing = false;
      }
    }, interval);
  }, []);

  // ── SFX ───────────────────────────────────────────────────────────────────
  const playTap = useCallback(() => {
    if (sfxMutedRef.current) return;
    const now = Date.now();
    if (now - tapLastMs.current < 180) return;
    tapLastMs.current = now;
    const idx = tapIndex.current;
    tapIndex.current = (tapIndex.current + 1) % TAP_FILES.length;
    const player = tapPlayers.current[idx];
    if (!player) return;
    try { player.seekTo(0); player.play(); } catch { /* ignore */ }
  }, []);

  const playNamed = useCallback((name: NamedSound) => {
    if (sfxMutedRef.current) return;
    const player = namedPlayers.current[name];
    if (!player) return;
    try { player.seekTo(0); player.play(); } catch { /* ignore */ }
  }, []);

  const playScratch       = useCallback(() => playNamed("scratch"),       [playNamed]);
  const playSuccess       = useCallback(() => playNamed("success"),       [playNamed]);
  const playMiss          = useCallback(() => playNamed("miss"),          [playNamed]);
  const playQuestComplete = useCallback(() => playNamed("questComplete"), [playNamed]);

  return (
    <SoundContext.Provider value={{
      playTap, playScratch, playSuccess, playMiss, playQuestComplete,
      sfxMuted, setSfxMuted,
      musicMuted, setMusicMuted,
      playBgMusic, stopBgMusicFade,
    }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  return useContext(SoundContext);
}
