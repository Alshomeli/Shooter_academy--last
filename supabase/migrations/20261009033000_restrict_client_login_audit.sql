-- Client-origin audit events are telemetry, NOT authoritative evidence of login.
-- Only the existing client action 'login' is accepted. Do not trust details sent
-- by the browser; the server uses a fixed description. A malicious authenticated
-- user could still invoke this RPC and generate a client-reported login entry.
-- Authentication-grade login evidence must come from trusted Auth server logs.
CREATE OR REPLACE FUNCTION public.record_login_audit_log(p_action text, p_details text)
RETURNS public.login_audit_logs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
  IF p_action IS DISTINCT FROM 'login' THEN
    RAISE EXCEPTION 'Unsupported client audit action' USING ERRCODE = '22023';
  END IF;
  RETURN internal.record_client_login_audit('login', 'Client-reported sign-in');
END;
$$;
REVOKE ALL ON FUNCTION public.record_login_audit_log(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_login_audit_log(text,text) TO authenticated;
