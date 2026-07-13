-- 0009_cleaner_property_views.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Phase 3 (part 1): let a granted cleaner/owner READ the property they were
-- given access to — the property row, its operational profile (already scoped
-- in 0008), and its cleanings — and NOTHING else. All ADDITIVE, permissive
-- (OR) policies: they only ever GRANT the scoped user access to their own
-- rows; staff (is_member) access is untouched.
--
-- Verified model (0008 E2E test): a cleaner without a grant sees zero of the
-- portfolio; these policies open exactly the rows their property_access covers.
-- ─────────────────────────────────────────────────────────────────────────

-- A cleaner/owner may read the property rows they've been granted.
create policy "scoped read properties" on properties
  for select using (has_property_access(id));

-- …and that property's cleanings (their turnover schedule).
create policy "scoped read cleanings" on cleanings
  for select using (has_property_access(property_id));
