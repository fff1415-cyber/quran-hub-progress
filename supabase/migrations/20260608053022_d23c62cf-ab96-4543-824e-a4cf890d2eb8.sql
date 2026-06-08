CREATE TABLE public.app_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.app_state TO service_role;

ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_app_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_app_state_updated_at
BEFORE UPDATE ON public.app_state
FOR EACH ROW
EXECUTE FUNCTION public.touch_app_state_updated_at();