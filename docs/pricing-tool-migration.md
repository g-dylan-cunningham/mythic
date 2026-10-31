# Pricing tool migration

Pricing is available at `/tool/pricing`. The shared `/tool/[toolName]` route
resolves known tools from `apps/web/lib/tools/catalog.ts`; unknown names return
404. Add future migrated tools to that catalog, the feature catalog, and the
route's component switch. Dashboard cards and the global Tools menu read the
same feature-filtered catalog.

## Access

Every active authenticated role (owner, admin, staff, customer) can use pricing,
regardless of department or authority. This audience is intentional. Inactive
accounts and anonymous visitors cannot use the route. Pricing availability is
the local `pricing` entry in the central feature catalog; disabling it removes
the dashboard/menu entries and denies the direct route. Existing tools retain
their current permissions.

## Source and behavior

The implementation was reconstructed from the supplied `LOGIC-AND-DATA.md`,
`MIGRATION.md`, `VALIDATION.md`, migration/validation briefs,
`pricing-tables.json`, and `calculation-fixtures.json`. The archive source was
not accessible to the coding environment, so this is a native Mythic UI using
the supplied formulas and rates, rather than a byte-for-byte component port.
It uses the app's dark/emerald styling and a text Mythic Press wordmark in
exports. The original portal's raster logo and CSS are not included.

Unlike the original reference snapshot, the imported pricing tables are the
runtime source of rates for this implementation. Update the tables, tests,
and reference fixtures together when approving future pricing changes.

- Screen print: setup allocated at tier minimum, turnover colors for added
  locations, and separate $40 specialty ink fees unaffected by rush.
- Embroidery: three order modes, 200+ garment basis adjustment, stitch
  overages, add-ons, digitizing below 50 pieces, $50 project minimum, rush on
  the entire subtotal. Units intentionally exclude project fees/minimum.
- DTG/DTF: method-specific location rates, DTF hats, DTG preparation, and
  review below 12 pieces.
- Shared finishing: tier boundaries at 25/100/250/500, review below 25 with
  matrix fees pending, steaming still charged. No embroidery inside tags.
- Rush ranges and approval states are preserved in live and exported quotes.
  No currency rounding occurs before presentation.

## Quote options and exports

Three formatted snapshot options per service can be renamed, duplicated,
removed, or cleared with confirmation. Reset inputs does not clear options.
Session keys are `mythic-quote-options-{service}:{userId}` to isolate accounts
in shared browsers. Storage is tab-scoped, not a durable quote database.
Original-origin browser data is not automatically transferred. Storage errors
show a message and leave options usable in memory for the current page.

Single quotes and comparisons support escaped HTML/plain-text email copy,
PNG clipboard with download fallback, and explicit text download. Exports use
a text wordmark, so they have no public-image-host dependency. Browser
clipboard permissions and secure-context restrictions still apply.

## Verification

Run from `apps/web` with Node 26 (or the project's compatible Node version):

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run build:retained
```

The automated suite includes all nine supplied calculation fixtures and
additional boundary, fee, approval, escaping, snapshot validation, and
all-role access checks. Interactive browser checks still required:

- Authenticate as customer and staff, open Tools → Pricing Calculator, and
  confirm the same route is denied when signed out or inactive.
- Adjust all three services; save, rename, duplicate, remove, and confirm
  clear; switch services and reload to check independent tab persistence.
- Verify clipboard email paste, image copy/download, long project names,
  keyboard access, and mobile layout on the destination host.

No live Sites deployment or production database changes are required.
