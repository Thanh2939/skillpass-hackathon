-- ============================================================
-- SkillPass · Khôi phục hiển thị tổ chức MẪU (UPDATE-ONLY)
-- File: supabase/scripts/restore-sample-organizations.sql
--
-- Bối cảnh: seed production đặt is_demo = true cho các tổ chức mẫu,
-- trong khi app lọc .eq('is_demo', false) (mobile/src/services/supabase.ts)
-- => tổ chức mẫu biến mất khỏi dropdown/UI.
--
-- Thiết kế fail-closed:
--   * CHỈ UPDATE, tuyệt đối KHÔNG INSERT.
--   * CHỈ đúng 3 domain giả đang tồn tại:
--       - congtymaauc.vn   (Công ty Mẫu C)
--       - tapdoanmaub.vn   (Tập đoàn Mẫu B)
--       - demo.edu.vn      (Trường Demo)
--   * Kiểm tra trước khi ghi: số lượng = 3, domain khớp, name hợp lệ,
--     is_demo, kyc_status, owner_user_id, organization_members.
--   * ABORT (raise exception) nếu:
--       - không đủ/không đúng 3 org, hoặc có domain lạ trong tập mục tiêu;
--       - name rỗng hoặc không chứa "Mẫu"/"Demo";
--       - is_demo = false nhưng name chưa có nhãn mẫu (trạng thái bất thường);
--       - kyc_status khác 'verified' (cần lead xem xét trước khi đổi hiển thị);
--       - bất kỳ org nào có owner_user_id;
--       - bất kỳ organization_members nào trỏ tới 3 org này.
--   * KHÔNG đổi kyc_status / verification_tier / wallet_address / whitelist_tx_hash.
--   * Chỉ đổi name (gắn nhãn "(DỮ LIỆU MẪU)") và is_demo = false.
--   * Idempotent: chạy lại không nhân đôi nhãn, không đổi thêm cột nào.
--
-- Cách chạy: Supabase Dashboard → SQL Editor, role postgres/service_role.
-- KHÔNG chạy tự động trên remote. Review trước khi apply.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0) Fail-closed: schema/phiên bản phải đủ cột & bảng cần kiểm tra
-- ------------------------------------------------------------
do $$
declare
  missing text[] := array[]::text[];
begin
  if to_regclass('public.organizations') is null then
    raise exception '[restore-sample-orgs] Không tìm thấy bảng public.organizations';
  end if;

  if to_regclass('public.organization_members') is null then
    raise exception '[restore-sample-orgs] Không tìm thấy bảng public.organization_members';
  end if;

  select array_agg(c)
    into missing
  from unnest(array['is_demo', 'kyc_status', 'verification_tier', 'owner_user_id']) as c
  where not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = c
  );

  if missing is not null and array_length(missing, 1) > 0 then
    raise exception '[restore-sample-orgs] Thiếu cột organizations.% — hãy chạy migration mới nhất trước', array_to_string(missing, ', ');
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 1) PRE-WRITE: báo cáo ví / tx hash / owner / member TRƯỚC khi ghi.
--    (Kết quả hiển thị ở result grid để người vận hành đối chiếu.)
-- ------------------------------------------------------------
select
  o.id,
  o.domain,
  o.name,
  o.org_type,
  o.verification_tier,
  o.kyc_status,
  o.is_demo,
  o.wallet_address,
  o.whitelist_tx_hash,
  o.owner_user_id,
  (select count(*) from public.organization_members om where om.org_id = o.id) as member_count
from public.organizations o
where o.domain in ('congtymaauc.vn', 'tapdoanmaub.vn', 'demo.edu.vn')
order by o.domain;

-- ------------------------------------------------------------
-- 2) Preflight assertions (fail-closed). Không ghi gì ở bước này.
-- ------------------------------------------------------------
do $$
declare
  expected_domains constant text[] := array['congtymaauc.vn', 'tapdoanmaub.vn', 'demo.edu.vn'];
  expected_count   constant integer := 3;
  actual_count     integer;
  r                record;
  member_total     integer;
begin
  select count(*) into actual_count
  from public.organizations
  where domain = any(expected_domains);

  if actual_count <> expected_count then
    raise exception '[restore-sample-orgs] Dừng: cần đúng % org mục tiêu nhưng tìm thấy %. Không ghi gì.', expected_count, actual_count;
  end if;

  -- Bảo đảm không có org nào mang domain lạ lọt vào tập mục tiêu
  -- (domain là UNIQUE nên 3 dòng phải là 3 domain khác nhau).
  if (select count(distinct domain) from public.organizations where domain = any(expected_domains)) <> expected_count then
    raise exception '[restore-sample-orgs] Dừng: tập domain mục tiêu không phân biệt đủ %. Không ghi gì.', expected_count;
  end if;

  for r in
    select
      o.id,
      o.domain,
      o.name,
      o.is_demo,
      o.kyc_status,
      o.verification_tier,
      o.wallet_address,
      o.whitelist_tx_hash,
      o.owner_user_id,
      (select count(*) from public.organization_members om where om.org_id = o.id) as member_count
    from public.organizations o
    where o.domain = any(expected_domains)
    order by o.domain
  loop
    if r.name is null or btrim(r.name) = '' then
      raise exception '[restore-sample-orgs] Dừng: % có name rỗng. Không ghi gì.', r.domain;
    end if;

    -- Tên phải mang dấu hiệu dữ liệu mẫu để tránh nhầm với thương hiệu thật.
    if lower(r.name) !~ '(mẫu|demo)' and r.name not like '%(DỮ LIỆU MẪU)%' then
      raise exception '[restore-sample-orgs] Dừng: % có name "%" không giống tổ chức mẫu. Không ghi gì.', r.domain, r.name;
    end if;

    -- Trạng thái bất thường: đã ẩn nhưng chưa có nhãn mẫu.
    if r.is_demo is distinct from true and r.name not like '%(DỮ LIỆU MẪU)%' then
      raise exception '[restore-sample-orgs] Dừng: % đang is_demo=% nhưng chưa có nhãn mẫu. Cần lead xem xét. Không ghi gì.', r.domain, r.is_demo;
    end if;

    if r.kyc_status <> 'verified' then
      raise exception '[restore-sample-orgs] Dừng: % có kyc_status=% (không phải verified). Cần lead xem xét trước khi đổi hiển thị. Không ghi gì.', r.domain, r.kyc_status;
    end if;

    -- Báo ví/tx TRƯỚC khi ghi (notice hiển thị ngay trong SQL Editor).
    raise notice '[restore-sample-orgs] PRE-WRITE % | id=% | is_demo=% | kyc=% | tier=% | wallet=% | whitelist_tx=% | owner=% | members=%',
      r.domain, r.id, r.is_demo, r.kyc_status, r.verification_tier,
      coalesce(r.wallet_address, '<null>'),
      coalesce(r.whitelist_tx_hash, '<null>'),
      coalesce(r.owner_user_id::text, '<null>'),
      r.member_count;

    if r.owner_user_id is not null then
      raise exception '[restore-sample-orgs] Dừng: % có owner_user_id=%. Cần lead xem xét quyền sở hữu. Không ghi gì.', r.domain, r.owner_user_id;
    end if;

    if r.member_count > 0 then
      raise exception '[restore-sample-orgs] Dừng: % có % organization_members. Cần lead xem xét membership. Không ghi gì.', r.domain, r.member_count;
    end if;
  end loop;

  select count(*) into member_total
  from public.organization_members om
  join public.organizations o on o.id = om.org_id
  where o.domain = any(expected_domains);

  if member_total > 0 then
    raise exception '[restore-sample-orgs] Dừng: phát hiện % membership gắn với tổ chức mẫu. Cần lead xem xét. Không ghi gì.', member_total;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3) UPDATE-ONLY: bật lại hiển thị + gắn nhãn mẫu.
--    Không đổi kyc_status, verification_tier, wallet, whitelist_tx, owner.
-- ------------------------------------------------------------
update public.organizations o
set name = case
             when o.name like '%(DỮ LIỆU MẪU)%' then o.name
             else o.name || ' (DỮ LIỆU MẪU)'
           end,
    is_demo = false,
    updated_at = now()
where o.domain in ('congtymaauc.vn', 'tapdoanmaub.vn', 'demo.edu.vn')
  and (
    o.is_demo is distinct from false
    or o.name not like '%(DỮ LIỆU MẪU)%'
  );

-- ------------------------------------------------------------
-- 4) Kiểm chứng sau khi chạy (không đổi thêm dữ liệu)
-- ------------------------------------------------------------
select
  o.id,
  o.name,
  o.domain,
  o.org_type,
  o.verification_tier,
  o.kyc_status,
  o.is_demo,
  o.wallet_address,
  o.whitelist_tx_hash,
  o.owner_user_id,
  (select count(*) from public.organization_members om where om.org_id = o.id) as member_count,
  o.updated_at
from public.organizations o
where o.domain in ('congtymaauc.vn', 'tapdoanmaub.vn', 'demo.edu.vn')
order by o.domain;

commit;
