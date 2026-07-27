-- User-scoped cache for ephemeral AI-composed views (ADR-0001).
-- The canonical numbers remain in domain tables; this stores presentation only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.view_compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  view_type TEXT NOT NULL CONSTRAINT view_compositions_view_type_check
    CHECK (view_type IN ('dashboard')),
  local_date DATE NOT NULL,
  template_version INTEGER NOT NULL CHECK (template_version > 0),
  template_fingerprint TEXT NOT NULL CHECK (length(template_fingerprint) = 64),
  facts_fingerprint TEXT NOT NULL CHECK (length(facts_fingerprint) = 64),
  composition JSONB NOT NULL CHECK (jsonb_typeof(composition) = 'object'),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, view_type, local_date, template_version, template_fingerprint, facts_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_view_compositions_user_day
  ON public.view_compositions(user_id, view_type, local_date DESC);

ALTER TABLE public.view_compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.view_compositions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own view compositions" ON public.view_compositions;
CREATE POLICY "Users read own view compositions"
  ON public.view_compositions FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users insert own view compositions" ON public.view_compositions;
CREATE POLICY "Users insert own view compositions"
  ON public.view_compositions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.view_compositions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.view_compositions TO authenticated;
GRANT SELECT, INSERT ON TABLE public.view_compositions TO service_role;

COMMENT ON TABLE public.view_compositions IS
  'Ephemeral user-scoped presentation cache for AI-composed views; never canonical fitness data';

COMMIT;
