#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function confidenceFor(observations) {
  const scores = observations.map((observation) => {
    const comparison = observation.evidence.comparison;
    const printavoCoverage = Number(comparison?.printavoCoverage ?? 0.8);
    const supplierCoverage = Number(comparison?.supplierCoverage ?? 0);

    return Math.min(
      0.99,
      0.95 + 0.02 * printavoCoverage + 0.02 * supplierCoverage,
    );
  });

  return Math.min(...scores).toFixed(4);
}

function evidenceFor(relationship, scope) {
  return {
    algorithm: "unique_strong_order_and_exact_style_color_size",
    observations: relationship.observations.map((observation) => ({
      printavoLineItemId: observation.printavoLineItemId,
      printavoOrderId: observation.printavoOrderId,
      printavoVisualId: observation.evidence.printavoVisualId,
      score: observation.evidence.comparison,
      ssGuids: observation.evidence.ssGuids,
      ssOrderNumbers: observation.evidence.ssOrderNumbers,
      variants: observation.variants,
    })),
    scope,
  };
}

function valuesFor(relationship, scope) {
  const observation = relationship.observations[0];
  const evidence = evidenceFor(relationship, scope);

  return `(
    'printavo',
    ${sqlString(observation.sourceStyleNumber)},
    ${sqlString(observation.sourceColor)},
    'ss',
    ${sqlString(observation.vendorStyleId)},
    ${sqlString(observation.vendorPartNumber)},
    ${sqlString(observation.vendorBrandName)},
    ${sqlString(observation.vendorStyleName)},
    ${sqlString(observation.vendorColor)},
    'historical_reconciliation',
    ${confidenceFor(relationship.observations)},
    ${relationship.observationCount},
    ${sqlString(JSON.stringify(evidence))}::jsonb,
    'active'
  )`;
}

function migrationSql(data) {
  const rows = data.relationships.map((relationship) =>
    valuesFor(relationship, data.scope),
  );

  return `alter table public.apparel_vendor_line_mappings
  add column if not exists source_style_key text
    generated always as (
      lower(regexp_replace(source_style_number, '[^[:alnum:]]', '', 'g'))
    ) stored,
  add column if not exists source_color_key text
    generated always as (
      lower(regexp_replace(source_color, '[^[:alnum:]]', '', 'g'))
    ) stored;

create index if not exists apparel_vendor_line_mappings_source_key_idx
  on public.apparel_vendor_line_mappings (
    source_system,
    vendor_key,
    source_style_key,
    source_color_key,
    confirmed_at desc
  );

create table public.apparel_vendor_catalog_mappings (
  id bigint generated always as identity primary key,
  source_system text not null default 'printavo'
    check (btrim(source_system) <> ''),
  source_style_number text not null check (btrim(source_style_number) <> ''),
  source_color text not null check (btrim(source_color) <> ''),
  source_style_key text generated always as (
    lower(regexp_replace(source_style_number, '[^[:alnum:]]', '', 'g'))
  ) stored,
  source_color_key text generated always as (
    lower(regexp_replace(source_color, '[^[:alnum:]]', '', 'g'))
  ) stored,
  vendor_key text not null check (btrim(vendor_key) <> ''),
  vendor_style_id text not null check (btrim(vendor_style_id) <> ''),
  vendor_part_number text not null check (btrim(vendor_part_number) <> ''),
  vendor_brand_name text not null check (btrim(vendor_brand_name) <> ''),
  vendor_style_name text not null check (btrim(vendor_style_name) <> ''),
  vendor_color text not null check (btrim(vendor_color) <> ''),
  mapping_source text not null
    check (
      mapping_source in (
        'historical_reconciliation',
        'human_confirmation',
        'vendor_catalog',
        'vendor_crossref'
      )
    ),
  confidence_score numeric(5, 4) not null
    check (confidence_score >= 0 and confidence_score <= 1),
  evidence_count integer not null default 1 check (evidence_count > 0),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  review_status text not null default 'proposed'
    check (review_status in ('active', 'proposed', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apparel_vendor_catalog_mappings_source_unique unique (
    source_system,
    vendor_key,
    source_style_key,
    source_color_key
  )
);

create index apparel_vendor_catalog_mappings_lookup_idx
  on public.apparel_vendor_catalog_mappings (
    source_system,
    vendor_key,
    source_style_key,
    source_color_key,
    review_status,
    confidence_score desc
  );

create index apparel_vendor_catalog_mappings_reviewer_idx
  on public.apparel_vendor_catalog_mappings (reviewed_by)
  where reviewed_by is not null;

create trigger apparel_vendor_catalog_mappings_set_updated_at
before update on public.apparel_vendor_catalog_mappings
for each row execute function public.set_updated_at();

alter table public.apparel_vendor_catalog_mappings enable row level security;

revoke all on table public.apparel_vendor_catalog_mappings
  from anon, authenticated;
grant select, insert, update on table public.apparel_vendor_catalog_mappings
  to authenticated;
grant usage, select on sequence public.apparel_vendor_catalog_mappings_id_seq
  to authenticated;

create policy "Owners and admins can read apparel catalog mappings"
on public.apparel_vendor_catalog_mappings for select
to authenticated
using (public.current_app_role() in ('owner', 'admin'));

create policy "Owners and admins can create apparel catalog mappings"
on public.apparel_vendor_catalog_mappings for insert
to authenticated
with check (
  public.current_app_role() in ('owner', 'admin')
  and (reviewed_by is null or reviewed_by = (select auth.uid()))
);

create policy "Owners and admins can update apparel catalog mappings"
on public.apparel_vendor_catalog_mappings for update
to authenticated
using (public.current_app_role() in ('owner', 'admin'))
with check (
  public.current_app_role() in ('owner', 'admin')
  and (reviewed_by is null or reviewed_by = (select auth.uid()))
);

comment on table public.apparel_vendor_catalog_mappings is
  'Reusable, evidence-backed mappings from Printavo style/color values to supplier catalog identities. Order-specific human confirmations remain in apparel_vendor_line_mappings.';

comment on column public.apparel_vendor_catalog_mappings.evidence is
  'Historical evidence supporting the mapping, including source order IDs, supplier order IDs, comparison scores, and observed size SKUs. Legacy free-form PO values are intentionally excluded.';

insert into public.apparel_vendor_catalog_mappings (
  source_system,
  source_style_number,
  source_color,
  vendor_key,
  vendor_style_id,
  vendor_part_number,
  vendor_brand_name,
  vendor_style_name,
  vendor_color,
  mapping_source,
  confidence_score,
  evidence_count,
  evidence,
  review_status
)
values
${rows.join(",\n")}
on conflict on constraint apparel_vendor_catalog_mappings_source_unique
do update set
  vendor_style_id = excluded.vendor_style_id,
  vendor_part_number = excluded.vendor_part_number,
  vendor_brand_name = excluded.vendor_brand_name,
  vendor_style_name = excluded.vendor_style_name,
  vendor_color = excluded.vendor_color,
  mapping_source = excluded.mapping_source,
  confidence_score = excluded.confidence_score,
  evidence_count = excluded.evidence_count,
  evidence = excluded.evidence,
  review_status = excluded.review_status,
  updated_at = now();
`;
}

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error(
    "Usage: generate-historical-mapping-migration.mjs <evidence.json> <migration.sql>",
  );
}

const data = JSON.parse(await readFile(inputPath, "utf8"));

if (!Array.isArray(data.relationships) || data.relationships.length === 0) {
  throw new Error("The evidence file does not contain reusable relationships.");
}

await writeFile(outputPath, migrationSql(data), "utf8");
console.log(
  `Wrote ${data.relationships.length} catalog mappings to ${outputPath}.`,
);
