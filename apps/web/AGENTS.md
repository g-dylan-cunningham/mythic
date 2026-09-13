<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Mythic Integration Security

- Keep vendor credentials server-side only. Never put Printavo, S&S, or other vendor secrets in `NEXT_PUBLIC_` variables, client components, browser code, or rendered HTML.
- If a vendor requires credentials in URL query parameters, make the request only from server-side code over HTTPS.
- Do not log, display, persist, or return full vendor URLs that include secret query parameters such as `token`, `api_key`, `key`, `secret`, or credentials.
- When showing integration diagnostics, strip query strings and redact sensitive fields before rendering or logging.
- Prefer header-based authentication over query-param secrets whenever a vendor supports it.

## Rollout Feature Flags And Retained Features

- Use code-level, server-side feature flags for the initial rollout. Flag evaluation must be a local configuration lookup with no remote provider or runtime network request.
- Centralize feature availability in one feature catalog. Do not scatter environment-variable checks or one-off booleans throughout pages and actions.
- Keep feature availability separate from authorization. A feature must be enabled for the rollout and the current profile must have the required role, department, and authority level.
- Enforce disabled features at every entry point: dashboard and navigation visibility, direct routes, route handlers, and Server Actions. Hiding a link is not an access-control boundary.
- Do not use `NEXT_PUBLIC_` feature variables as security controls. Resolve access on the server and pass only the resulting presentation state to client components.
- Treat disabled features as retained, not deprecated. Do not delete, rename, broadly refactor, or change the behavior of their routes, actions, workflow services, tables, migrations, or stored data unless the task explicitly includes that feature.
- Keep retained features buildable. Shared-infrastructure changes must continue to pass TypeScript, lint, build, and relevant tests with the retained feature enabled.
- Prefer additive shared interfaces or adapters when active work touches code also used by a disabled feature. Avoid coupling new tools directly to production-task behavior.
- Do not drop or rewrite database objects merely because their UI is disabled. Schema changes affecting retained features require an explicit compatibility and reactivation plan.
- Disable background side effects separately from UI visibility. Printavo ingestion may remain enabled while production-job materialization is disabled.
- Preserve a local or staging configuration where retained features can be enabled for regression verification.

The initial active surface is authentication, profiles/user accounts, roles,
departments, the dashboard shell, neutral Printavo fetching, and the existing
read-only S&S inventory tool. The production workflow suite and nonessential
reports should remain retained behind feature flags until explicitly
reactivated.
