-- Academic calendar: semesters and generated academic weeks

CREATE TABLE public.semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  weeks_count integer NOT NULL CHECK (weeks_count > 0),
  working_days integer[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4],
  excluded_dates date[] NOT NULL DEFAULT ARRAY[]::date[],
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academic_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  week_number integer NOT NULL CHECK (week_number > 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (semester_id, week_number)
);

CREATE INDEX idx_academic_weeks_semester ON public.academic_weeks(semester_id);
CREATE INDEX idx_semesters_active ON public.semesters(is_active) WHERE is_active = true;

ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read semesters"
  ON public.semesters FOR SELECT
  USING (true);

CREATE POLICY "public write semesters"
  ON public.semesters FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public read academic_weeks"
  ON public.academic_weeks FOR SELECT
  USING (true);

CREATE POLICY "public write academic_weeks"
  ON public.academic_weeks FOR ALL
  USING (true)
  WITH CHECK (true);
