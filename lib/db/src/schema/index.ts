import { boolean, customType, date, integer, jsonb, pgTable, primaryKey, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Topical battle words ────────────────────────────────────────────────────
// Mainstream/evergreen words surfaced as one source in the battle-mode
// word-picker, blended with the Urban Dictionary / static hip-hop pool.
// season_tag: "summer" | "winter" | null (null = evergreen, always active).
export const topicalWordsTable = pgTable("topical_words", {
  id:          serial("id").primaryKey(),
  word:        text("word").notNull(),
  season_tag:  text("season_tag"),           // null = evergreen
  active:      boolean("active").notNull().default(true),
  added_date:  timestamp("added_date").notNull().defaultNow(),
});

export const battleTopicsTable = pgTable("battle_topics", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull().unique(),
  active: boolean("active").notNull().default(true),
});

export const dailyBattleTopicsTable = pgTable("daily_battle_topics", {
  utc_date: date("utc_date").primaryKey(),
  topics: jsonb("topics").$type<string[]>().notNull(),
});

export const dailyOnFireWordsTable = pgTable("daily_on_fire_words", {
  utc_date: date("utc_date").notNull(),
  tier: text("tier").notNull(),
  words: jsonb("words").$type<string[]>().notNull(),
  source: text("source").notNull().default("fallback"),
  last_attempt_at: timestamp("last_attempt_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.utc_date, table.tier] })]);

export const insertTopicalWordSchema = createInsertSchema(topicalWordsTable).omit({ id: true, added_date: true });
export type InsertTopicalWord = z.infer<typeof insertTopicalWordSchema>;
export type TopicalWord = typeof topicalWordsTable.$inferSelect;

// ── Bot battle sessions ─────────────────────────────────────────────────────
// Completed battle scores are written by the server judge. Never accept score,
// winner, or tier values from a client when rendering or persisting a share result.
export const botBattleSessionsTable = pgTable("bot_battle_sessions", {
  id: serial("id").primaryKey(),
  user_id: text("user_id"),
  topical_word: text("topical_word").notNull(),
  tier: text("tier").notNull().default("bronze"),
  bot_name: text("bot_name").notNull().default("Beef"),
  player_verse: text("player_verse"),
  bot_response: text("bot_response"),
  status: text("status").notNull().default("started"),
  season_id: text("season_id").notNull().default("S0"),
  topic: text("topic"),
  topic_choices: jsonb("topic_choices").$type<string[]>().notNull().default([]),
  on_fire_words: jsonb("on_fire_words").$type<string[]>().notNull().default([]),
  rerolls_used: integer("rerolls_used").notNull().default(0),
  ai_cost_usd: real("ai_cost_usd").notNull().default(0),
  player_relative_score: integer("player_relative_score"),
  opponent_relative_score: integer("opponent_relative_score"),
  player_final_score: integer("player_final_score"),
  opponent_final_score: integer("opponent_final_score"),
  player_class: text("player_class"),
  player_multiplier: real("player_multiplier").notNull().default(1),
  player_weakest_axis: text("player_weakest_axis"),
  winner: text("winner"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  ended_at: timestamp("ended_at"),
});

export const storyProgressTable = pgTable("story_progress", {
  user_id: text("user_id").primaryKey(),
  chapter: integer("chapter").notNull().default(1),
  step: text("step").notNull().default("scene_1"),
  active_battle_id: integer("active_battle_id").references(() => botBattleSessionsTable.id, { onDelete: "set null" }),
  last_battle_outcome: text("last_battle_outcome"),
  boss_weakest_axis: text("boss_weakest_axis"),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBotBattleSessionSchema = createInsertSchema(botBattleSessionsTable).omit({
  id: true,
  created_at: true,
  ended_at: true,
});
export type InsertBotBattleSession = z.infer<typeof insertBotBattleSessionSchema>;
export type BotBattleSession = typeof botBattleSessionsTable.$inferSelect;

// ── AI usage quotas ───────────────────────────────────────────────────────────
export const aiUsageTable = pgTable(
  "ai_usage",
  {
    user_id: text("user_id").notNull(),
    usage_day: date("usage_day").notNull(),
    call_count: integer("call_count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.usage_day] })],
);

// ── API rate limits ───────────────────────────────────────────────────────────
export const rateLimitsTable = pgTable(
  "rate_limits",
  {
    client_ip: text("client_ip").notNull(),
    window_started_at: timestamp("window_started_at").notNull(),
    request_count: integer("request_count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.client_ip, table.window_started_at] })],
);

// Audio is kept with the passing performance record so replay does not call ElevenLabs again.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

type PersistedAudioBeatManifest = {
  version: 1;
  outputId: string;
  sources: Array<{
    id: string;
    provenance: "original" | "generated" | "other" | "splice" | "unknown";
  }>;
};

export const lyricPerformancesTable = pgTable("lyric_performances", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull(),
  battle_id: integer("battle_id").references(() => botBattleSessionsTable.id, { onDelete: "set null" }),
  performance_date: date("performance_date").notNull(),
  verse: text("verse").notNull(),
  intro: boolean("intro").notNull().default(true),
  echo_out: boolean("echo_out").notNull().default(false),
  audio_data: bytea("audio_data").notNull(),
  audio_content_type: text("audio_content_type").notNull().default("audio/mpeg"),
  audio_provenance: text("audio_provenance")
    .$type<"original" | "generated" | "other" | "splice" | "unknown" | "composite">()
    .notNull()
    .default("unknown"),
  audio_manifest: jsonb("audio_manifest").$type<PersistedAudioBeatManifest | null>(),
  audio_size_bytes: integer("audio_size_bytes").notNull(),
  duration_ms: integer("duration_ms").notNull(),
  generation_cost_usd: real("generation_cost_usd"),
  transcription_cost_usd: real("transcription_cost_usd"),
  fidelity_passed: boolean("fidelity_passed").notNull().default(true),
  transcript: text("transcript").notNull(),
  expected_word_count: integer("expected_word_count").notNull(),
  delivered_word_count: integer("delivered_word_count").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export type LyricPerformance = typeof lyricPerformancesTable.$inferSelect;
