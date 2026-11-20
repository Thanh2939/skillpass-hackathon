-- In demo mode Auth auto-confirms email addresses without proving mailbox
-- ownership. Restricted links must not treat that flag as proof.
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || '{"mailbox_unverified":true}'::jsonb
WHERE coalesce(raw_app_meta_data ->> 'mailbox_unverified', '') <> 'false';

CREATE OR REPLACE FUNCTION public.mark_new_mailbox_unverified()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT coalesce(NEW.raw_app_meta_data, '{}'::jsonb) ? 'mailbox_unverified' THEN
        NEW.raw_app_meta_data := coalesce(NEW.raw_app_meta_data, '{}'::jsonb)
            || '{"mailbox_unverified":true}'::jsonb;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_new_mailbox_unverified ON auth.users;
CREATE TRIGGER mark_new_mailbox_unverified
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.mark_new_mailbox_unverified();
