-- 0013_expenses_rls_fix.sql
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY FIX (found in audit): 0005 created
--   "Authenticated users can manage expenses" for all using (auth.role() =
--   'authenticated')
-- and it was never dropped. RLS policies are OR-permissive, so ANY signed-in
-- user (cleaner/owner/partner) could read AND write every expense in the
-- portfolio. Replace with the standard model: staff read, admin write,
-- owner-scoped read (owner read policy already added in 0010).
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists "Authenticated users can manage expenses" on expenses;

create policy "members read expenses" on expenses
  for select using (is_member());
create policy "admins write expenses" on expenses
  for all using (is_admin()) with check (is_admin());
-- "owner read expenses" (has_owner_access) exists from 0010 — unchanged.
