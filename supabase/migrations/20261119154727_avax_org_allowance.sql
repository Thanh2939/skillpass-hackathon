alter table public.organizations
  add column if not exists avax_allowance numeric(18,8) not null default 0,
  add column if not exists avax_spent numeric(18,8) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_avax_budget_nonnegative'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_avax_budget_nonnegative
      check (avax_allowance >= 0 and avax_spent >= 0);
  end if;
end $$;

create table if not exists public.avax_topup_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  requested_by_user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(18,8) not null default 0.01 check (amount > 0 and amount <= 1),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_admin_id uuid references public.users(id) on delete set null,
  rejection_reason text
);

create index if not exists avax_topup_requests_org_status_idx
  on public.avax_topup_requests (org_id, status, requested_at desc);

alter table public.avax_topup_requests enable row level security;

create policy "org members read own AVAX requests"
on public.avax_topup_requests for select to authenticated
using (
  exists (
    select 1 from public.organizations o
    left join public.organization_members m
      on m.org_id = o.id and m.user_id = (select auth.uid()) and m.status = 'active'
    where o.id = avax_topup_requests.org_id
      and (o.owner_user_id = (select auth.uid()) or m.id is not null)
  )
  or exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.role = 'admin'
  )
);

create policy "org members request AVAX topup"
on public.avax_topup_requests for insert to authenticated
with check (
  requested_by_user_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1 from public.organizations o
    left join public.organization_members m
      on m.org_id = o.id and m.user_id = (select auth.uid()) and m.status = 'active'
    where o.id = avax_topup_requests.org_id
      and o.kyc_status = 'verified'
      and (o.owner_user_id = (select auth.uid()) or m.id is not null)
  )
);

create policy "admins manage AVAX requests"
on public.avax_topup_requests for all to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.role = 'admin'
  )
);

grant select, insert on public.avax_topup_requests to authenticated;
grant select, insert, update, delete on public.avax_topup_requests to service_role;

create or replace function public.consume_org_avax_budget(p_org_id uuid, p_cost numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining numeric;
begin
  if p_cost <= 0 then
    raise exception 'invalid AVAX cost';
  end if;

  update public.organizations
  set avax_spent = avax_spent + p_cost,
      updated_at = now()
  where id = p_org_id
    and kyc_status = 'verified'
    and avax_allowance - avax_spent >= p_cost
  returning avax_allowance - avax_spent into remaining;

  if remaining is null then
    raise exception 'insufficient AVAX allowance';
  end if;
  return remaining;
end;
$$;

revoke all on function public.consume_org_avax_budget(uuid, numeric) from public, anon, authenticated;
grant execute on function public.consume_org_avax_budget(uuid, numeric) to service_role;
