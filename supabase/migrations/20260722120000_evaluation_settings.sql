-- Evaluation settings singleton (Supabase mirror of MySQL migrate-evaluation-settings.sql)
CREATE TABLE IF NOT EXISTS public.evaluation_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hifz_max_score INT NOT NULL DEFAULT 45,
  review_max_score INT NOT NULL DEFAULT 50,
  error_deduction INT NOT NULL DEFAULT 5,
  warning_deduction INT NOT NULL DEFAULT 2,
  review_error_deduction INT NOT NULL DEFAULT 2,
  review_warning_deduction INT NOT NULL DEFAULT 1,
  hifz_max_errors INT NOT NULL DEFAULT 3,
  hifz_max_warnings INT NOT NULL DEFAULT 5,
  review_max_errors_per_segment INT NOT NULL DEFAULT 3,
  review_max_warnings_per_segment INT NOT NULL DEFAULT 5,
  pass_percent INT NOT NULL DEFAULT 80,
  max_minutes_per_face NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  review_segments_under_10 INT NOT NULL DEFAULT 3,
  review_segments_10_to_20 INT NOT NULL DEFAULT 4,
  review_segments_over_20 INT NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.evaluation_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.evaluation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct evaluation_settings access"
ON public.evaluation_settings FOR ALL USING (false);
