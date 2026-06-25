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
