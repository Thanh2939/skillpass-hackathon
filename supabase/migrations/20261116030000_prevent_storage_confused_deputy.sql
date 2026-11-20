-- ============================================================
-- SkillPass — Prevent Confused-Deputy Storage & Validate Ownership
-- ============================================================

CREATE OR REPLACE FUNCTION public.certificates_storage_path(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT nullif(regexp_replace(
    split_part(coalesce(p_value, ''), '?', 1),
    '^https?://[^/]+/storage/v1/object/(public|sign|authenticated)/certificates/', ''
  ), '');
$$;

CREATE OR REPLACE FUNCTION public.validate_evidence_storage_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
    v_student_id uuid;
    v_path text;
    v_obj_owner uuid;
    v_obj_owner_id text;
BEGIN
    -- Trusted bypass: Admin hoặc service_role hoặc migration script nội bộ (không có JWT auth.uid)
    IF public.is_admin()
       OR (auth.jwt() ->> 'role') = 'service_role'
       OR auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    -- Lấy student_id từ chứng chỉ được liên kết
    SELECT student_id INTO v_student_id
    FROM public.certificates
    WHERE id = NEW.certificate_id;

    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'Associated certificate not found for evidence document';
    END IF;

    v_path := public.certificates_storage_path(NEW.storage_path);
    IF v_path IS NULL THEN
        RETURN NEW;
    END IF;

    -- Chuẩn hóa đường dẫn: loại bỏ leading slash nếu có
    v_path := regexp_replace(v_path, '^/+', '');

    -- Tra cứu object trong storage.objects thuộc bucket 'certificates'
    SELECT owner, owner_id INTO v_obj_owner, v_obj_owner_id
    FROM storage.objects
    WHERE bucket_id = 'certificates' AND name = v_path
    LIMIT 1;

    -- Fail-closed: Nếu không tìm thấy storage object trong storage.objects
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Referenced storage object not found in certificates bucket: %', v_path;
    END IF;

    -- Kiểm tra quyền sở hữu thực sự:
    -- Bắt buộc owner/owner_id phải khớp với student_id của chứng chỉ
    -- Unknown ownership (owner và owner_id đều NULL) KHÔNG được tự trust -> fail-closed
    IF (v_obj_owner IS NOT NULL AND v_obj_owner = v_student_id)
       OR (v_obj_owner_id IS NOT NULL AND v_obj_owner_id = v_student_id::text) THEN
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'Security violation: storage object % does not belong to student %', v_path, v_student_id;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_evidence_storage_ownership ON public.evidence_documents;
CREATE TRIGGER trg_validate_evidence_storage_ownership
    BEFORE INSERT OR UPDATE OF storage_path, certificate_id
    ON public.evidence_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_evidence_storage_ownership();

CREATE OR REPLACE FUNCTION public.validate_certificate_evidence_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
    v_path text;
    v_obj_owner uuid;
    v_obj_owner_id text;
BEGIN
    -- Trusted bypass: Admin hoặc service_role hoặc migration script nội bộ (không có JWT auth.uid)
    IF public.is_admin()
       OR (auth.jwt() ->> 'role') = 'service_role'
       OR auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_path := public.certificates_storage_path(NEW.evidence_url);
    IF v_path IS NULL THEN
        RETURN NEW;
    END IF;

    -- Bóc tách path nếu là URL đầy đủ
    IF v_path ~* '^https?://' THEN
        IF v_path ~* '/certificates/' THEN
            v_path := substring(v_path from '/certificates/([^?#]+)');
            v_path := replace(v_path, '%20', ' ');
        ELSE
            -- External URL ngoài bucket certificates -> bỏ qua kiểm tra storage nội bộ
            RETURN NEW;
        END IF;
    END IF;

    v_path := regexp_replace(v_path, '^/+', '');

    -- Tra cứu trong storage.objects
    SELECT owner, owner_id INTO v_obj_owner, v_obj_owner_id
    FROM storage.objects
    WHERE bucket_id = 'certificates' AND name = v_path
    LIMIT 1;

    IF FOUND THEN
        IF (v_obj_owner IS NOT NULL AND v_obj_owner = NEW.student_id)
           OR (v_obj_owner_id IS NOT NULL AND v_obj_owner_id = NEW.student_id::text) THEN
            RETURN NEW;
        ELSE
            RAISE EXCEPTION 'Security violation: certificate evidence object % does not belong to student %', v_path, NEW.student_id;
        END IF;
    END IF;

    -- Fail-closed nếu đường dẫn là internal path dạng 'evidence/' hoặc 'certs/' nhưng không có trong storage
    IF v_path LIKE 'evidence/%' OR v_path LIKE 'certs/%' THEN
        RAISE EXCEPTION 'Referenced storage object not found: %', v_path;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_certificate_evidence_ownership ON public.certificates;
CREATE TRIGGER trg_validate_certificate_evidence_ownership
    BEFORE INSERT OR UPDATE OF evidence_url, student_id
    ON public.certificates
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_certificate_evidence_ownership();

-- Siết chặt Storage RLS: Loại bỏ broad reference-only route
DROP POLICY IF EXISTS "Authorized users read certificates storage" ON storage.objects;
CREATE POLICY "Authorized users read certificates storage" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'certificates'
        AND (
            public.is_admin()
            -- Sinh viên CHỈ đọc được object do chính mình sở hữu
            OR owner = auth.uid()
            OR owner_id = auth.uid()::text
            -- Reviewer tổ chức CHỈ đọc được khi file thuộc về sinh viên của chứng chỉ nộp cho tổ chức đó
            OR EXISTS (
                SELECT 1
                FROM public.evidence_documents ed
                JOIN public.certificates c ON c.id = ed.certificate_id
                JOIN public.organizations org ON org.id = c.org_id
                WHERE public.certificates_storage_path(ed.storage_path) = storage.objects.name
                  AND (org.owner_user_id = auth.uid() OR EXISTS (
                    SELECT 1 FROM public.organization_members m
                    WHERE m.org_id = c.org_id AND m.user_id = auth.uid() AND m.status = 'active'
                      AND m.member_role IN ('owner', 'reviewer')
                  ))
                  AND (storage.objects.owner = c.student_id OR storage.objects.owner_id = c.student_id::text)
            )
            OR EXISTS (
                SELECT 1 FROM public.certificates c
                JOIN public.organizations org ON org.id = c.org_id
                WHERE public.certificates_storage_path(c.evidence_url) = storage.objects.name
                  AND org.owner_user_id = auth.uid()
                  AND (storage.objects.owner = c.student_id OR storage.objects.owner_id = c.student_id::text)
            )
        )
    );
