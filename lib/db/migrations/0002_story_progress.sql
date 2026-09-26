ALTER TABLE bot_battle_sessions
  ADD COLUMN IF NOT EXISTS player_weakest_axis text;

CREATE TABLE IF NOT EXISTS story_progress (
  user_id text PRIMARY KEY,
  chapter integer NOT NULL DEFAULT 1,
  step text NOT NULL DEFAULT 'scene_1',
  active_battle_id integer REFERENCES bot_battle_sessions(id) ON DELETE SET NULL,
  last_battle_outcome text,
  boss_weakest_axis text,
  updated_at timestamp NOT NULL DEFAULT now()
);