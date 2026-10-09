-- Persist the verified live login-audit wrapper access model.
-- Do not grant direct INSERT on public.login_audit_logs.
-- The internal implementation checks auth.uid() and an active academy identity.
-- Preserve public-wrapper invocation while preventing anonymous execution.
BEGIN;
GRANT USAGE ON SCHEMA internal TO authenticated;
GRANT EXECUTE ON FUNCTION internal.record_client_login_audit(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.record_login_audit_log(p_action text, p_details text)
RETURNS public.login_audit_logs
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT internal.record_client_login_audit(p_action, p_details);
$$;
REVOKE ALL ON FUNCTION public.record_login_audit_log(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_login_audit_log(text,text) TO authenticated;
REVOKE INSERT ON TABLE public.login_audit_logs FROM anon, authenticated;
COMMIT;
