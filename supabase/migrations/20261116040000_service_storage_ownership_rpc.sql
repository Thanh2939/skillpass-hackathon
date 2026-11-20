-- Storage is intentionally NOT exposed through PostgREST.
-- This tightly scoped helper is callable only with the server-side service role.
CREATE OR REPLACE FUNCTION public.storage_object_owned_by(p_path text, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'certificates' AND o.name = p_path
      AND (o.owner = p_user_id OR o.owner_id = p_user_id::text)
  );
$$;
REVOKE ALL ON FUNCTION public.storage_object_owned_by(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_object_owned_by(text, uuid) TO service_role;
