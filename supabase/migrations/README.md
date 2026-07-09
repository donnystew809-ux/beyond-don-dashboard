# Migrations

Applied manually via the Supabase SQL editor, in filename order.

## ⚠️ 0006_organizations.sql is intentionally SKIPPED — do not apply

It introduces multi-tenant orgs (`organizations`, `organization_members`,
`organization_id` NOT NULL on every tenant table + org-based RLS), but **no
app code supplies `organization_id` on writes** — applying it would break
every insert in production.

Decision (2026-07, automation roadmap): stay single-tenant on `user_roles`
(extended with new roles + `property_access` scoping in 0008). Orgs are
deferred until the SaaS multi-tenant phase, at which point 0006 will need a
matching app-code refactor before it can ship.

Numbering resumes at `0007_messaging_automation.sql`.
