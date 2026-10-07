# S&S / Printavo Historical Reconciliation Pilot

## Scope

- S&S invoice dates: September 1 through October 4, 2026.
- October is month-to-date.
- All vendor access was read-only.
- No S&S, Printavo, or application database records were modified.

## Source volume

| Source measure | Result |
| --- | ---: |
| S&S warehouse orders | 85 |
| Normalized S&S PO groups | 47 |
| S&S order lines | 922 |
| S&S pieces | 8,664 |
| September S&S orders | 80 |
| October month-to-date S&S orders | 5 |
| September PO groups | 45 |
| October month-to-date PO groups | 4 |

Two PO groups include invoices from both months, so the monthly PO-group counts
overlap and should not be added together.

## PO-number finding

A numeric-only comparison initially appeared to match 42 of 47 S&S PO groups
to a Printavo visual order number. That result was a false-positive pattern:

- 41 of the 42 numeric matches pointed to Printavo production windows more
  than 365 days away from the S&S purchase.
- Only one numeric match fell inside the corresponding Printavo production
  window.
- Only one numeric match had any garment-line overlap.

Therefore, S&S `poNumber` must not be treated as a reliable Printavo foreign
key. Numeric equality can collide with older Printavo visual order numbers.

After requiring date plausibility and garment evidence, the PO-search-only
classification was:

| Classification | PO groups |
| --- | ---: |
| Trusted exact identifier with product evidence | 1 |
| Trusted product/date match found through search | 1 |
| Requires review | 44 |
| Unmatched | 1 |

## Broad date-and-product comparison

The second pass did not depend on the S&S PO number. It loaded 25 pages of
recent Printavo orders and compared plausible production-window candidates by
style, color, size, and quantity.

| Printavo candidate measure | Result |
| --- | ---: |
| Orders loaded | 2,500 |
| Orders with comparable apparel data | 1,561 |
| Newest custom-created date | October 2, 2026 |
| Oldest custom-created date | December 17, 2025 |

### Corrected pilot result

| Classification | PO groups | Share |
| --- | ---: | ---: |
| Unique strong candidate | 20 | 42.6% |
| Multiple strong candidates | 7 | 14.9% |
| Partial product evidence | 17 | 36.2% |
| No product candidate | 3 | 6.4% |

Additional observations:

- 44 of 47 groups had at least one date-plausible product candidate.
- 17 groups had a best candidate covering at least 75% of the S&S pieces.
- 23 groups had a Printavo candidate at least 80% contained within the S&S
  garment set. This supports a one-S&S-order-to-multiple-Printavo-orders model.
- Across each group's best candidate, 5,560 of 8,613 comparable S&S pieces
  matched, for 64.6% weighted coverage.

### Monthly view

| Month | Unique strong | Multiple strong | Partial evidence | No candidate |
| --- | ---: | ---: | ---: | ---: |
| September 2026 | 20 | 6 | 16 | 3 |
| October 2026 month-to-date | 0 | 1 | 3 | 0 |

October contains only five S&S warehouse orders, so it is too small and too
recent to use as a stable quality benchmark.

## Interpretation

Historical reconciliation is feasible, but it should be modeled as a
confidence-scored line allocation rather than a PO-number join.

The safe automation boundary from this pilot is:

1. Automatically propose the 20 unique strong candidates.
2. Require human confirmation before using them as reusable supplier mappings.
3. Present the 7 multiple-candidate groups as a focused choice rather than
   selecting one automatically.
4. Keep the 17 partial groups in a line-level allocation queue because one S&S
   purchase may combine several Printavo jobs, stock purchases, or other work.
5. Leave the 3 no-candidate groups unresolved until broader catalog aliases or
   older Printavo candidates are available.

## Limitations

- Style and color comparison used conservative text normalization. It did not
  yet resolve every Printavo garment through the S&S catalog and SKU endpoints.
- The candidate pool covered 2,500 Printavo orders back to December 17, 2025.
  An unusually long-running order created earlier could be missed.
- Product overlap alone can be ambiguous for common garments. Dates, complete
  size runs, quantities, supplier SKU resolution, and human confirmation are
  still required.
- S&S PO groups can contain more than one Printavo job, so the eventual schema
  must support many-to-many order and line relationships.

## Recommended implementation

1. Ingest S&S order headers and lines idempotently using the immutable S&S
   order GUID.
2. Preserve raw S&S responses alongside the existing raw Printavo snapshots.
3. Normalize Printavo style/color/size entries through the S&S catalog to a
   supplier SKU before scoring.
4. Add explicit supplier-order and supplier-line link tables with match method,
   confidence, evidence, and confirmation state.
5. Build a review queue for unique, multiple, partial, and unresolved matches.
6. Promote confirmed line links into `apparel_vendor_line_mappings` with
   `match_source = 'historical_confirmation'`.

## Implemented high-confidence mapping set

The September/October data was rerun through a stricter reusable-mapping pass.
The pass required:

- one uniquely strong Printavo order candidate for the S&S PO group;
- exact normalized style, color, and size agreement;
- enough S&S quantity to cover every mapped Printavo size quantity;
- one unambiguous S&S SKU for each mapped size;
- an exact S&S catalog identity; and
- the S&S brand name to appear in the Printavo item description.

This produced:

| Mapping measure | Result |
| --- | ---: |
| Unique strong S&S PO groups used | 14 |
| Exact Printavo line observations | 99 |
| Reusable Printavo style/color relationships | 98 |
| Conflicting reusable relationships | 0 |
| Stored confidence range | 0.9700–0.9900 |

The reusable relationships are seeded as active historical evidence in
`apparel_vendor_catalog_mappings`. Human-confirmed mappings remain higher
priority and replace the reusable catalog relationship when staff confirms a
different supplier identity.
