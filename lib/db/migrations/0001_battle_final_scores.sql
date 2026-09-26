ALTER TABLE bot_battle_sessions
  ADD COLUMN IF NOT EXISTS player_final_score integer,
  ADD COLUMN IF NOT EXISTS opponent_final_score integer,
  ADD COLUMN IF NOT EXISTS player_class text,
  ADD COLUMN IF NOT EXISTS player_multiplier real NOT NULL DEFAULT 1;