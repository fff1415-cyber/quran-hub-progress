
-- 1) Drop existing permissive policies
DROP POLICY IF EXISTS "public read halaqat" ON public.halaqat;
DROP POLICY IF EXISTS "public write halaqat" ON public.halaqat;
DROP POLICY IF EXISTS "public read students" ON public.students;
DROP POLICY IF EXISTS "public write students" ON public.students;
DROP POLICY IF EXISTS "public read role_accounts" ON public.role_accounts;
DROP POLICY IF EXISTS "public write role_accounts" ON public.role_accounts;

-- 2) HALAQAT: allow public SELECT (rows), restrict sensitive columns via grants. No writes from clients.
CREATE POLICY "anon read halaqat rows"
  ON public.halaqat FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.halaqat FROM anon, authenticated;
REVOKE SELECT ON public.halaqat FROM anon, authenticated;
GRANT SELECT (id, name, is_talqeen, teacher_name, assistant_name, created_at)
  ON public.halaqat TO anon, authenticated;

-- 3) STUDENTS: allow public SELECT (rows), restrict sensitive columns. No writes from clients.
CREATE POLICY "anon read students rows"
  ON public.students FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.students FROM anon, authenticated;
REVOKE SELECT ON public.students FROM anon, authenticated;
GRANT SELECT (id, name, halaqa_id, level, level_type, assigned_to, memorized, created_at)
  ON public.students TO anon, authenticated;

-- 4) ROLE_ACCOUNTS: completely closed to clients. Only server (service_role) can touch it.
REVOKE ALL ON public.role_accounts FROM anon, authenticated;
-- (No SELECT policy means no rows visible even if grants existed.)

-- service_role keeps full access (already granted previously).
