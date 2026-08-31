import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, topicalWordsTable } from "@workspace/db";

const router: IRouter = Router();

const CREATIVE_PROMPTS = [
  "Write about waking up in a city that forgot your name",
  "The last phone call you never made",
  "Describe the color of nostalgia",
  "A conversation between the ocean and the shore",
  "The smell of rain on hot concrete",
  "What the moon sees when everyone's asleep",
  "A letter to your 10-year-old self from tomorrow",
  "The moment before a door opens",
  "Write about something that only exists in mirrors",
  "The last train out of nowhere",
  "Describe silence in a language no one speaks",
  "A day when gravity forgot to show up",
  "Write about the weight of an apology unsaid",
  "The space between lightning and thunder",
  "What your shadow does when you're not watching",
  "A conversation you've had a thousand times in your head",
  "The city at 4am and its confessions",
  "Write about chasing something that keeps moving",
  "The taste of a word you can't remember",
  "What gets left behind in empty rooms",
  "Write about a fire that never burned anything",
  "The sound of a name no one uses anymore",
  "What the streets know that the news won't say",
  "A crown with no kingdom underneath it",
  "Write about hunger that isn't about food",
  "Your main character arc — where it started, where it's going",
  "Write about someone living rent-free in your head",
  "The era you're stepping into — what it cost to get here",
  "Real talk: what you stopped pretending not to want",
  "The moment you realized you were built different",
  "Write about a ratio that flipped your whole perspective",
  "That one person who was cooked before they even knew it",
  "Your villain arc — why it made sense at the time",
  "Write about clout that turned to smoke overnight",
  "The drip that nobody ever saw but you felt every day",
  "What it looks like when aura runs out",
  "Write about the come-up nobody gave you credit for",
  "The version of you that didn't make it — what happened",
  "Standing in your bag when the world said you were mid",
  "What the grind looks like when nobody's watching the grind",
];

// Static fallback word pool — used when Urban Dictionary is unreachable
const STATIC_BATTLE_WORDS = [
  "bars", "drip", "flex", "grind", "hustle", "heat", "ice", "bread",
  "sauce", "wave", "vibe", "bag", "clout", "zone", "trill", "raw",
  "fire", "fresh", "crown", "throne", "flow", "cold", "ghost",
  "rizz", "aura", "mid", "sus", "bop", "slay", "era", "goat",
  "ratio", "glazed", "cooked", "based", "valid", "delulu",
  "bussin", "cap", "slept",
  "cipher", "phantom", "legacy", "karma", "titan", "apex",
  "reign", "chaos", "glory", "zenith", "oracle", "reckoning",
  "void", "ember", "catalyst", "sovereign", "blaze", "surge",
  "pulse", "storm", "nova", "fury", "grit",
  "blade", "smoke", "shine", "gold", "peak", "spark", "rush",
  "forge", "fuel", "rise", "weight", "truth", "proof", "code",
  "chain", "steel", "dust", "volt", "drive", "lock", "real",
];

// ── Urban Dictionary Integration ────────────────────────────────────────────

// Hard blocklist — slurs and explicit sexual content
const UD_BLOCKLIST = new Set([
  "nigger", "nigga", "faggot", "fag", "retard", "retarded", "tranny",
  "chink", "spic", "kike", "gook", "wetback", "cunt",
  "cock", "dick", "pussy", "penis", "vagina", "cum", "jizz", "anal",
  "rape", "blowjob", "handjob", "dildo",
]);

function isWordAllowed(word: string): boolean {
  const w = word.toLowerCase().trim();
  if (w.length < 3 || w.length > 14) return false;
  if (/\s/.test(w)) return false;         // no phrases
  if (/[^a-z0-9'_-]/.test(w)) return false; // only simple chars
  for (const bad of UD_BLOCKLIST) {
    if (w.includes(bad)) return false;
  }
  return true;
}

interface UDEntry { word: string; thumbs_up: number; }
interface UDResponse { list?: UDEntry[] }

let udWordCache: string[] = [];
let udCacheExpiry = 0;
const UD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

async function fetchUDRandomWords(): Promise<string[]> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch("https://api.urbandictionary.com/v0/random", {
      signal: controller.signal,
      headers: { "User-Agent": "LyricLab/1.0" },
    });
    clearTimeout(tid);
    if (!res.ok) return [];
    const data = (await res.json()) as UDResponse;
    return (data.list ?? [])
      .filter((e) => e.thumbs_up >= 50 && isWordAllowed(e.word))
      .map((e) => e.word.toLowerCase().trim());
  } catch {
    clearTimeout(tid);
    return [];
  }
}

async function getWordPool(): Promise<string[]> {
  const now = Date.now();
  if (udWordCache.length >= 4 && now < udCacheExpiry) {
    return udWordCache;
  }
  const fresh = await fetchUDRandomWords();
  if (fresh.length >= 2) {
    udWordCache = fresh;
    udCacheExpiry = now + UD_CACHE_TTL_MS;
    return fresh;
  }
  return STATIC_BATTLE_WORDS;
}

// ── Topical word pool (from DB) ───────────────────────────────────────────────
// NOTE: Season filtering is not yet implemented. All active words are returned
// regardless of season_tag. A future pass should filter by the current month
// (e.g. "summer" = Jun–Aug, "winter" = Dec–Feb in the Northern Hemisphere).

let topicalWordCache: string[] = [];
let topicalCacheExpiry = 0;
const TOPICAL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

async function fetchTopicalWords(): Promise<string[]> {
  const now = Date.now();
  if (topicalWordCache.length > 0 && now < topicalCacheExpiry) {
    return topicalWordCache;
  }
  try {
    const rows = await db
      .select({ word: topicalWordsTable.word })
      .from(topicalWordsTable)
      .where(eq(topicalWordsTable.active, true));
    const words = rows.map((r) => r.word);
    if (words.length > 0) {
      topicalWordCache = words;
      topicalCacheExpiry = now + TOPICAL_CACHE_TTL_MS;
    }
    return words;
  } catch {
    return topicalWordCache; // return stale cache on DB error
  }
}

// ── Battle word pair: one from hip-hop pool, one from topical pool ────────────
async function getBattleWordPair(): Promise<[string, string]> {
  const [hipHopPool, topicalPool] = await Promise.all([
    getWordPool(),
    fetchTopicalWords(),
  ]);

  const hipHopWord = hipHopPool[Math.floor(Math.random() * hipHopPool.length)] ?? "fire";

  if (topicalPool.length === 0) {
    // No topical words available — use two hip-hop words
    const remaining = hipHopPool.filter((w) => w !== hipHopWord);
    const second = remaining[Math.floor(Math.random() * remaining.length)] ?? "ice";
    return [hipHopWord, second];
  }

  const topicalWord = topicalPool[Math.floor(Math.random() * topicalPool.length)] ?? "Rent";

  // Randomise order so topical word isn't always second
  return Math.random() < 0.5
    ? [hipHopWord, topicalWord]
    : [topicalWord, hipHopWord];
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.get("/lyrics/prompt", (_req, res) => {
  const idx = Math.floor(Math.random() * CREATIVE_PROMPTS.length);
  res.json({ prompt: CREATIVE_PROMPTS[idx] ?? CREATIVE_PROMPTS[0] });
});

router.get("/lyrics/battle-words", (_req, res, next) => {
  getBattleWordPair()
    .then(([w1, w2]) => res.json({ words: [w1, w2] }))
    .catch((err: unknown) => next(err));
});

export default router;
