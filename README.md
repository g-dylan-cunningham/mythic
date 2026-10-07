# Mythic Operations

Internal operations layer for Mythic Press.

The first milestone is a Next.js app backed by Supabase Auth, Postgres, RLS,
and local migrations. The current product surface includes login, role-aware
dashboard access, and foundational database tables for profiles, audit logs,
sync runs, and raw integration payloads.

## Project Structure

```txt
.
├── apps/
│   └── web/          # Next.js app
├── supabase/         # Local Supabase config, migrations, and seed data
├── package.json      # Repo-level tooling scripts
└── README.md
```

## Development

Start the web app:

```bash
cd apps/web
npm run dev
```

Configure the Supabase target in `apps/web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_TARGET=development
```

Use `development` for the hosted Supabase dev project and `local` for the
Docker-based local stack. See `apps/web/.env.local.example` for the full shape.

The initial rollout uses local, server-side feature flags. Production workflow
and nonessential reporting remain compiled but hidden by default. Set
`MYTHIC_ENABLE_RETAINED_FEATURES=true` in a local or staging environment to
regression-test those retained tools; do not use this setting as a substitute
for role and department authorization.

Use `npm --prefix apps/web run build:retained` to compile the application with
the retained feature set explicitly enabled.

The apparel-ordering rollout is fail closed. Set
`MYTHIC_APPAREL_ORDERING_MODE=review` to expose read-only Printavo and S&amp;S
matching to active owners and admins. Missing or invalid values hide the tool.
`live` mode permits internal mapping confirmations, but external S&amp;S order
submission and Printavo status changes still require their own explicit
server-only switches. Keep both of these `false` during the protected pilot:

```bash
MYTHIC_ENABLE_SS_ORDER_SUBMISSION=false
MYTHIC_ENABLE_PRINTAVO_STATUS_UPDATES=false
```

Start the local Supabase stack:

```bash
npm run supabase:start
```

Local Supabase requires Docker Desktop or another Docker-compatible runtime.

## Database

Schema changes should be made as SQL migrations under `supabase/migrations`.
The local seed file is `supabase/seed.sql`.

Useful commands:

```bash
npm run supabase:status
npm run supabase:reset
npm run supabase:types
```

## Security

Do not commit `.env` files or service-role keys. Supabase API keys used by the
browser must be publishable keys only. Server-only integration secrets, such as
supplier API keys, should stay in local or deployment environment variables.
