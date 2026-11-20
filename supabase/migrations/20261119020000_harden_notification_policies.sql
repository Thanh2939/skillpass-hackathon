-- Remove prototype-wide notification access. Notifications may be read or
-- marked as read only by their recipient; authenticated app users may create
-- notifications for workflow participants.
DROP POLICY IF EXISTS "App read all notifications" ON public.notifications;
DROP POLICY IF EXISTS "App update notifications" ON public.notifications;
DROP POLICY IF EXISTS "App insert notifications" ON public.notifications;

CREATE POLICY "Authenticated users create notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- Remove superseded duplicate policies left by early prototype migrations.
DROP POLICY IF EXISTS "Reviewers or Admin insert badges" ON public.badges;
DROP POLICY IF EXISTS "Users read evidence for visible certs" ON public.evidence_documents;

-- These functions intentionally expose only an active share's allow-listed
-- fields. Their anonymous EXECUTE grants are required by the public verifier.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
