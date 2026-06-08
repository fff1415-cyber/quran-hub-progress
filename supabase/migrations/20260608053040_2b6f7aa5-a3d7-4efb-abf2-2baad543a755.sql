CREATE POLICY "No direct app_state access"
ON public.app_state
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct role_accounts access"
ON public.role_accounts
FOR ALL
USING (false)
WITH CHECK (false);