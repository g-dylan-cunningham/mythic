# Database Environment Strategy

Last updated: 2026-07-14

Purpose: define how Mythic should work between the local Supabase database and
the hosted Supabase development database while keeping both sources of record
coherent.

## Short Version

- Schema source of truth: SQL migrations in `supabase/migrations`.
- Local database: disposable development/testing database.
- Hosted Supabase development database: shared integration source of record.
- Production database: future gated deploy target, not touched casually.
- Seed data: local/dev fixtures only unless explicitly promoted.
- Live business data: do not copy into git.

## Existing Repo Setup

Current scripts:

```txt
npm run supabase:start
npm run supabase:stop
npm run supabase:status
npm run supabase:reset
npm run supabase:types
```

Current app target switch:

```txt
NEXT_PUBLIC_SUPABASE_TARGET=local
NEXT_PUBLIC_SUPABASE_TARGET=development
```

Use `local` for the Docker-based Supabase stack. Use `development` for the
hosted Supabase dev project.

## Source Of Record Rules

### Schema

The source of record for schema is the migration directory:

```txt
supabase/migrations
```

All table/type/index/RLS changes should be represented as migrations and
committed to git.

Do not make schema changes only in Supabase Studio. If a change is explored in
Studio, convert it into a migration before treating it as real.

### Local Data

Local data is disposable. It is useful for:

- Fast iteration.
- Resetting from seeds.
- Testing migrations.
- Demo fixtures.
- Workflow engine development.

Local data should be recreated with:

```txt
npm run supabase:reset
```

### Hosted Development Data

Hosted Supabase development is the shared integration database. It is useful for:

- Testing with real credentials and hosted environment variables.
- Reviewing with another person.
- Verifying migrations against a non-local database.
- Testing scheduled jobs/webhooks later.

Hosted dev should receive the same migrations that were validated locally.

### Production Data

Production should eventually be gated by:

- Reviewed migration files.
- Backup/rollback plan.
- Deployment checklist.
- No direct untracked schema editing.

Production is out of scope for the POC.

## Recommended Workflow For Phase 2

### 1. Design Schema In Docs

Update:

- [Data Model](/Users/gdylanc/workspace/mythic/mythic/docs/prd/data-model.md)
- [Workflow Config](/Users/gdylanc/workspace/mythic/mythic/docs/prd/workflow-config.md)

### 2. Create A Migration

Add a new SQL migration under:

```txt
supabase/migrations
```

Use a timestamped descriptive name, for example:

```txt
202607140001_production_workflow_foundation.sql
```

### 3. Reset Local DB

Run:

```txt
npm run supabase:reset
```

This applies migrations and `supabase/seed.sql` to the local stack.

### 4. Validate Locally

Validate:

- Tables exist.
- RLS is enabled.
- Policies allow expected reads/writes.
- Seed data loads.
- App can run with `NEXT_PUBLIC_SUPABASE_TARGET=local`.

### 5. Generate Types

Run:

```txt
npm run supabase:types
```

Commit the generated types if the project tracks them.

### 6. Apply To Hosted Development

After local validation, apply the same migration files to hosted development.

Preferred command depends on linking/auth setup, but the target behavior is:

```txt
supabase db push
```

Only push migrations that have been validated locally.

### 7. Smoke Test Hosted Development

Switch:

```txt
NEXT_PUBLIC_SUPABASE_TARGET=development
```

Validate:

- Hosted app can query new tables.
- RLS behaves correctly.
- No local-only seed assumptions are required.

## Phase 2 Database Objects

The first production workflow migration should likely include:

- `product_categories`
- `workflow_definitions`
- `workflow_steps`
- `workflow_dependencies`
- `workflow_transitions`
- `production_jobs`
- `production_tasks`
- `production_job_events`
- `printavo_status_mappings`

Existing tables to reuse:

- `sync_runs`
- `api_raw_payloads`
- `audit_logs`
- `profiles`

## Seed Strategy

Local seed should include:

- Demo users.
- `screen_printing` product category.
- `screen_printing_v1` workflow definition.
- First-pass workflow steps and dependencies.
- A realistic demo production job.
- Demo tasks generated from the workflow.

Do not seed:

- Real Printavo tokens.
- Real customer-sensitive payloads.
- Large raw API exports.

JSON API exports under `docs/business-docs/**/*.json` are ignored by git.

## Hosted Development Data Strategy

Hosted development should get schema migrations. It does not need all local
demo fixtures.

Options:

1. Minimal hosted seed: product category, workflow definition, workflow steps.
2. Manual setup through admin tools later.
3. Controlled seed script run only against hosted dev.

Recommended for POC: use migrations for baseline workflow config if the app
needs it to run, and keep demo jobs local-only until review needs hosted data.

## RLS And Grants

Every new public table should have:

- RLS enabled.
- Explicit policies.
- Explicit grants where needed.

Initial policy direction:

- Owner/admin can read and manage workflow config.
- Owner/admin/production lead can read production jobs/tasks/events.
- Production workers can read assigned or visible production tasks.
- Events are append-only through controlled server actions where possible.

For POC, it is acceptable to start slightly conservative and use server-side
operations for writes.

## Avoiding Drift

Common drift risks:

- Editing hosted dev schema in Supabase Studio.
- Forgetting to reset local after migration changes.
- Changing seed data and assuming hosted dev has it.
- Updating hosted dev but not committing migration files.

Rules:

- Migrations first.
- Local reset before hosted push.
- Hosted schema changes must be reproduced in migrations.
- Seeds are not schema.
- Workflow config changes that affect behavior should be versioned.

## Practical Phase 2 Checklist

Before writing migration:

- Confirm table list.
- Confirm roles/policies.
- Confirm seeded workflow steps.

After writing migration:

- Run local reset.
- Inspect local DB.
- Generate types.
- Run app against local.
- Apply to hosted development.
- Run app against hosted development.
- Record any manual hosted-dev data steps in this doc or a migration.

## Open Questions

- Is the hosted Supabase dev project already linked with the CLI?
- Should baseline workflow config be inserted through migrations or seed?
- Which production role names should be added to `app_role`?
- Should POC writes go directly through Supabase client policies or through
  server actions with stricter authorization?
