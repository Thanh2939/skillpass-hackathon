-- One public bucket for immutable SBT metadata. Evidence remains in the private
-- certificates bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'badge-metadata',
  'badge-metadata',
  true,
  1048576,
  array['application/json']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.badge_issuance_locks (
  certificate_id uuid primary key references public.certificates(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete restrict,
  state text not null default 'claimed'
    check (state in ('claimed', 'broadcast', 'completed', 'failed')),
  tx_hash text,
  token_id bigint,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists badge_issuance_locks_requested_by_idx
  on public.badge_issuance_locks (requested_by);

alter table public.badge_issuance_locks enable row level security;
revoke all on table public.badge_issuance_locks from public, anon, authenticated;
grant select, insert, update, delete on table public.badge_issuance_locks to service_role;

create or replace function public.finalize_badge_issuance(
  p_certificate_id uuid,
  p_requested_by uuid,
  p_token_id bigint,
  p_contract_address text,
  p_chain_id integer,
  p_tx_hash text,
  p_metadata_uri text,
  p_proof_hash text,
  p_tier text,
  p_reviewer_label text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cert public.certificates%rowtype;
  existing_tx text;
begin
  if p_tier not in ('community', 'academic', 'enterprise') then
    raise exception 'Invalid badge tier';
  end if;

  select * into cert
  from public.certificates
  where id = p_certificate_id
  for update;

  if not found then
    raise exception 'Certificate not found';
  end if;

  if not exists (
    select 1
    from public.badge_issuance_locks
    where certificate_id = p_certificate_id
      and requested_by = p_requested_by
      and state in ('claimed', 'broadcast')
  ) then
    raise exception 'Badge issuance lock not found';
  end if;

  insert into public.badges (
    certificate_id,
    student_id,
    org_id,
    token_id,
    contract_address,
    chain_id,
    tx_hash,
    metadata_uri,
    proof_hash,
    tier,
    is_revoked,
    issued_at
  ) values (
    cert.id,
    cert.student_id,
    cert.org_id,
    p_token_id,
    p_contract_address,
    p_chain_id,
    p_tx_hash,
    p_metadata_uri,
    p_proof_hash,
    p_tier,
    false,
    now()
  )
  on conflict (certificate_id) do nothing;

  select tx_hash into existing_tx
  from public.badges
  where certificate_id = p_certificate_id;

  if existing_tx is distinct from p_tx_hash then
    raise exception 'Certificate already belongs to another transaction';
  end if;

  update public.certificates
  set status = 'approved',
      tx_hash = p_tx_hash,
      reviewer_id = p_requested_by,
      reviewer_label = p_reviewer_label,
      reviewed_at = now()
  where id = p_certificate_id
    and (
      status in ('submitted', 'under_review')
      or (status = 'approved' and tx_hash = p_tx_hash)
    );

  if not found then
    raise exception 'Certificate is no longer awaiting approval';
  end if;

  update public.badge_issuance_locks
  set state = 'completed',
      tx_hash = p_tx_hash,
      token_id = p_token_id,
      last_error = null,
      updated_at = now()
  where certificate_id = p_certificate_id;

  return true;
end;
$$;

revoke all on function public.finalize_badge_issuance(
  uuid, uuid, bigint, text, integer, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_badge_issuance(
  uuid, uuid, bigint, text, integer, text, text, text, text, text
) to service_role;
