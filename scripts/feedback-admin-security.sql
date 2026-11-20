-- Admin access and valid partner revocation states.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.users where id=auth.uid() and role='admin');
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;
create or replace function private.protect_account_role() returns trigger language plpgsql set search_path = '' as $$
begin
 if current_user in ('anon','authenticated') and (TG_OP='INSERT' or new.role is distinct from old.role or new.id is distinct from old.id or new.email is distinct from old.email) then
   raise exception 'Account identity and roles are managed by the server';
 end if;
 return new;
end $$;
drop trigger if exists protect_account_role on public.users;
create trigger protect_account_role before insert or update on public.users for each row execute function private.protect_account_role();
do $$
declare definition text;
begin
 select pg_get_functiondef('public.handle_new_user()'::regprocedure) into definition;
 definition := replace(definition, '''student'',''business'',''admin''', '''student'',''business''');
 execute definition;
end $$;
alter table public.organizations drop constraint organizations_kyc_status_check;
alter table public.organizations add constraint organizations_kyc_status_check check (kyc_status in ('pending','verified','rejected','revoked'));
do $$
declare item record;
begin
 for item in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('admin_audit_logs','system_settings') loop
 execute format('drop policy %I on %I.%I', item.policyname,item.schemaname,item.tablename);
 end loop;
end $$;
create policy admin_logs_read on public.admin_audit_logs for select to authenticated using ((select private.is_admin()));
create policy admin_logs_insert on public.admin_audit_logs for insert to authenticated with check ((select private.is_admin()));
create policy admin_settings on public.system_settings for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
