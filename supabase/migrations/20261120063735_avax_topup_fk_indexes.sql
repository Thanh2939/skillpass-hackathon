create index if not exists avax_topup_requests_requested_by_user_idx
  on public.avax_topup_requests (requested_by_user_id);

create index if not exists avax_topup_requests_reviewed_by_admin_idx
  on public.avax_topup_requests (reviewed_by_admin_id);
