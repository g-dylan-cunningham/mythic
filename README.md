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
