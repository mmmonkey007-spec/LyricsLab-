-- Protected game state is written only by trusted server-side functions.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'battle_results',
        'class_progress',
        'currencies',
        'leaderboard',
        'quests',
        'sessions',
        'users'
      ])
      AND (cmd <> 'SELECT' OR tablename = 'leaderboard')
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.battle_results, public.class_progress, public.currencies,
    public.leaderboard, public.quests, public.sessions, public.users
  FROM PUBLIC, anon, authenticated;

REVOKE SELECT ON TABLE public.leaderboard FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.leaderboard TO service_role;

ALTER TABLE public.quests
  DROP CONSTRAINT IF EXISTS quests_quest_type_check;
ALTER TABLE public.quests
  ADD CONSTRAINT quests_quest_type_check
  CHECK (quest_type IN ('daily', 'weekly', 'onboarding', 'main'));

CREATE OR REPLACE FUNCTION public.record_scored_session_v2(
  p_user uuid,
  p_mode text,
  p_final_score integer,
  p_rhyme integer,
  p_flow integer,
  p_wordplay integer,
  p_originality integer,
  p_storytelling integer,
  p_humor integer,
  p_multiplier numeric,
  p_best_line text,
  p_coach_note text,
  p_weakness text,
  p_word_count integer,
  p_line_count integer,
  p_season_id text DEFAULT NULL::text,
  p_topic text DEFAULT NULL::text,
  p_tier text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_class_name text;
  v_xp_earned integer;
  v_total_xp integer;
  v_level integer := 1;
  v_skillz_reward integer := 0;
  v_changed_rows integer;
  v_event record;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('free', 'prompted', 'blitz', 'battle', 'drill') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode;
  END IF;
  IF p_final_score IS NULL OR p_final_score < 0 OR p_final_score > 1500 THEN
    RAISE EXCEPTION 'final score out of range: %', p_final_score;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = p_user
      AND COALESCE(is_anonymous, false)
  ) THEN
    RETURN;
  END IF;

  SELECT CASE u.class
    WHEN 'assassin' THEN 'lyrical_assassin'
    WHEN 'lyrical_assassin' THEN 'lyrical_assassin'
    WHEN 'rider' THEN 'flow_rider'
    WHEN 'flow_rider' THEN 'flow_rider'
    WHEN 'trickster' THEN 'trickster'
    ELSE 'lyrical_assassin'
  END
  INTO v_class_name
  FROM public.users AS u
  WHERE u.id = p_user;

  IF v_class_name IS NULL THEN
    RAISE EXCEPTION 'user profile not found: %', p_user;
  END IF;

  IF p_mode <> 'drill' THEN
    INSERT INTO public.sessions (
      user_id, mode, final_score, rhyme_score, flow_score, wordplay_score,
      originality_score, technique_score, storytelling_score, humor_score,
      multiplier, best_line, coach_note, weakness_dimension, word_count, line_count,
      season_id, topic, tier
    ) VALUES (
      p_user, p_mode, p_final_score, p_rhyme, p_flow, p_wordplay,
      p_originality, NULL, p_storytelling, p_humor,
      p_multiplier, left(p_best_line, 500), left(p_coach_note, 2000), left(p_weakness, 64),
      p_word_count, p_line_count, left(p_season_id, 32), left(p_topic, 200), left(p_tier, 16)
    );
  END IF;

  v_xp_earned := pg_catalog.floor(p_final_score::numeric / 10)::integer;
  IF p_mode = 'drill' THEN
    v_xp_earned := pg_catalog.floor(v_xp_earned::numeric / 2)::integer;
  END IF;

  INSERT INTO public.class_progress (user_id, class_name, level, xp)
  VALUES (p_user, v_class_name, 1, v_xp_earned)
  ON CONFLICT (user_id, class_name) DO UPDATE
    SET xp = COALESCE(public.class_progress.xp, 0) + EXCLUDED.xp
  RETURNING xp INTO v_total_xp;

  v_level := 1;
  WHILE v_level < 14 AND v_total_xp >= 50 * (v_level + 1) * v_level LOOP
    v_level := v_level + 1;
  END LOOP;

  UPDATE public.class_progress
  SET level = v_level
  WHERE user_id = p_user
    AND class_name = v_class_name;

  FOR v_event IN
    SELECT quest_id, quest_type, reward
    FROM (VALUES
      ('onboarding_1', 'onboarding',  50, p_mode = 'free' AND p_line_count >= 4),
      ('onboarding_2', 'onboarding',  50, p_mode = 'prompted'),
      ('onboarding_3', 'onboarding', 100, p_mode = 'blitz'),
      ('onboarding_4', 'onboarding', 150, p_mode = 'battle'),
      ('main_1',       'main',       100, p_mode <> 'drill'),
      ('main_2',       'main',       100, p_mode = 'drill'),
      ('main_3',       'main',       150, p_mode = 'battle'),
      ('main_4',       'main',       200, p_mode <> 'drill' AND p_final_score >= 75)
    ) AS events(quest_id, quest_type, reward, eligible)
    WHERE eligible
  LOOP
    INSERT INTO public.quests (
      user_id, quest_id, quest_type, completed, reward_claimed, expires_at
    ) VALUES (
      p_user,
      v_event.quest_id,
      v_event.quest_type,
      true,
      true,
      '9999-12-31 23:59:59+00'::timestamptz
    )
    ON CONFLICT (user_id, quest_id) DO UPDATE
      SET completed = true,
          reward_claimed = true
      WHERE COALESCE(public.quests.completed, false) = false
         OR COALESCE(public.quests.reward_claimed, false) = false;

    GET DIAGNOSTICS v_changed_rows = ROW_COUNT;
    IF v_changed_rows > 0 THEN
      v_skillz_reward := v_skillz_reward + v_event.reward;
    END IF;
  END LOOP;

  IF v_skillz_reward > 0 THEN
    INSERT INTO public.currencies (user_id, skillz, updated_at)
    VALUES (p_user, v_skillz_reward, now())
    ON CONFLICT (user_id) DO UPDATE
      SET skillz = COALESCE(public.currencies.skillz, 0) + EXCLUDED.skillz,
          updated_at = now();
  END IF;

  IF p_mode = 'drill' THEN
    RETURN;
  END IF;

  INSERT INTO public.leaderboard (
    user_id, username, class, best_score, total_sessions, updated_at
  )
  SELECT u.id, u.username, v_class_name, p_final_score, 1, now()
  FROM public.users AS u
  WHERE u.id = p_user
  ON CONFLICT (user_id) DO UPDATE
    SET best_score = GREATEST(COALESCE(public.leaderboard.best_score, 0), EXCLUDED.best_score),
        total_sessions = COALESCE(public.leaderboard.total_sessions, 0) + 1,
        class = EXCLUDED.class,
        updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.record_scored_session_v2(
  uuid, text, integer, integer, integer, integer, integer, integer, integer,
  numeric, text, text, text, integer, integer, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_scored_session_v2(
  uuid, text, integer, integer, integer, integer, integer, integer, integer,
  numeric, text, text, text, integer, integer, text, text, text
) TO service_role;