
-- Halaqat (circles)
CREATE TABLE public.halaqat (
  id integer PRIMARY KEY,
  name text NOT NULL,
  is_talqeen boolean NOT NULL DEFAULT false,
  teacher_name text NOT NULL DEFAULT '—',
  teacher_code text NOT NULL DEFAULT '',
  assistant_name text NOT NULL DEFAULT '—',
  assistant_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Students
CREATE TABLE public.students (
  id text PRIMARY KEY,
  name text NOT NULL,
  halaqa_id integer NOT NULL,
  national_id text NOT NULL UNIQUE,
  parent_phone text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT '1',
  level_type text NOT NULL DEFAULT 'gold',
  assigned_to text,
  memorized text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_students_halaqa ON public.students(halaqa_id);
CREATE INDEX idx_students_nid ON public.students(national_id);

-- Role accounts (managers, supervisors, etc.)
CREATE TABLE public.role_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS — open access since auth is via membership code (no Supabase Auth)
ALTER TABLE public.halaqat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read halaqat" ON public.halaqat FOR SELECT USING (true);
CREATE POLICY "public write halaqat" ON public.halaqat FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "public read students" ON public.students FOR SELECT USING (true);
CREATE POLICY "public write students" ON public.students FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "public read role_accounts" ON public.role_accounts FOR SELECT USING (true);
CREATE POLICY "public write role_accounts" ON public.role_accounts FOR ALL USING (true) WITH CHECK (true);
