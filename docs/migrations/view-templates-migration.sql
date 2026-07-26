-- Versioned view-template storage for ADR-0001 composed views.
-- Templates are immutable presentation contracts. They control ordering,
-- visibility, and tone; all displayed numbers come from application aggregates.
-- This migration passed apply-twice and two-user RLS verification on a
-- disposable PostgreSQL 17.6 Supabase project, then was applied and verified in
-- production, on 2026-07-26.

BEGIN;

CREATE TABLE IF NOT EXISTS public.view_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  view_type TEXT NOT NULL CONSTRAINT view_templates_view_type_check
    CHECK (view_type IN ('dashboard')),
  version INTEGER NOT NULL CONSTRAINT view_templates_version_positive
    CHECK (version > 0),
  schema_version INTEGER NOT NULL DEFAULT 1
    CONSTRAINT view_templates_schema_version_check CHECK (schema_version = 1),
  template JSONB NOT NULL CONSTRAINT view_templates_template_object
    CHECK (jsonb_typeof(template) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_view_templates_user_version
  ON public.view_templates(user_id, view_type, version)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_view_templates_default_version
  ON public.view_templates(view_type, version)
  WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_view_templates_user_latest
  ON public.view_templates(user_id, view_type, version DESC);

-- Seed before FORCE RLS so this migration does not depend on the executing
-- role's RLS-bypass privileges. Runtime clients cannot create global defaults.
INSERT INTO public.view_templates (
  user_id,
  view_type,
  version,
  schema_version,
  template
)
SELECT
  NULL,
  'dashboard',
  1,
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'tone', 'concise',
    'showNarrative', true,
    'sections', jsonb_build_array(
      jsonb_build_object('id', 'personal_records', 'visible', true),
      jsonb_build_object('id', 'recovery', 'visible', true),
      jsonb_build_object('id', 'workout_summary', 'visible', true),
      jsonb_build_object('id', 'nutrition', 'visible', true),
      jsonb_build_object('id', 'leaderboard', 'visible', true)
    )
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM public.view_templates
  WHERE user_id IS NULL
    AND view_type = 'dashboard'
    AND version = 1
);

ALTER TABLE public.view_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.view_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their templates and defaults" ON public.view_templates;
CREATE POLICY "Users can view their templates and defaults"
  ON public.view_templates FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can create their own template versions" ON public.view_templates;
CREATE POLICY "Users can create their own template versions"
  ON public.view_templates FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.view_templates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.view_templates TO authenticated;
GRANT SELECT, INSERT ON TABLE public.view_templates TO service_role;

COMMENT ON TABLE public.view_templates IS 'Immutable, versioned presentation contracts for AI-composed views; never stores computed fitness data';
COMMENT ON COLUMN public.view_templates.template IS 'Validated ordering, visibility, narrative, and tone settings for one view type';

COMMIT;
