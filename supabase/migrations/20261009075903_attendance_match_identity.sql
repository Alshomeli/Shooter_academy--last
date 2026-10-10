-- Preserve all attendance rows. Match identity must include match_id.
DROP INDEX IF EXISTS public.attendance_unique_player_session;
CREATE UNIQUE INDEX attendance_unique_player_session
ON public.attendance (player_id, session_date, session_type, coalesce(training_id, ''), coalesce(match_id, ''));
