import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
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

export const insertTopicalWordSchema = createInsertSchema(topicalWordsTable).omit({ id: true, added_date: true });
export type InsertTopicalWord = z.infer<typeof insertTopicalWordSchema>;
export type TopicalWord = typeof topicalWordsTable.$inferSelect;

// ── Bot battle sessions ─────────────────────────────────────────────────────
// These are deliberately verse records only. Judging, scores, damage, and winners
// must not be introduced here until the separate dialect-fairness audit is complete.
export const botBattleSessionsTable = pgTable("bot_battle_sessions", {
  id: serial("id").primaryKey(),
  topical_word: text("topical_word").notNull(),
  tier: text("tier").notNull().default("bronze"),
  bot_name: text("bot_name").notNull().default("Beef"),
  player_verse: text("player_verse"),
  bot_response: text("bot_response"),
  status: text("status").notNull().default("started"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  ended_at: timestamp("ended_at"),
});

export const insertBotBattleSessionSchema = createInsertSchema(botBattleSessionsTable).omit({
  id: true,
  created_at: true,
  ended_at: true,
});
export type InsertBotBattleSession = z.infer<typeof insertBotBattleSessionSchema>;
export type BotBattleSession = typeof botBattleSessionsTable.$inferSelect;
