BEGIN;

CREATE TABLE public.coach_daily_checkins (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  stress TEXT NOT NULL CHECK (stress IN ('lower', 'usual', 'higher')),
  fatigue TEXT NOT NULL CHECK (fatigue IN ('lower', 'usual', 'higher')),
  sleep TEXT NOT NULL CHECK (sleep IN ('worse', 'usual', 'better')),
  soreness TEXT NOT NULL CHECK (soreness IN ('lower', 'usual', 'higher')),
  motivation TEXT NOT NULL CHECK (motivation IN ('lower', 'usual', 'higher')),
  PRIMARY KEY (user_id, local_date)
);

ALTER TABLE public.coach_daily_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_daily_checkins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coach_daily_checkins FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.coach_daily_checkins TO authenticated;

CREATE POLICY daily_checkins_select_owner ON public.coach_daily_checkins
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY daily_checkins_insert_owner ON public.coach_daily_checkins
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY daily_checkins_update_owner ON public.coach_daily_checkins
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

COMMIT;
