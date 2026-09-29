create index if not exists api_raw_payloads_printavo_order_latest_idx
  on public.api_raw_payloads (source_entity_id, fetched_at desc)
  where source = 'printavo' and source_entity_type = 'order';

create or replace view public.latest_printavo_order_payloads
with (security_invoker = true)
as
select distinct on (raw.source_entity_id)
  raw.source_entity_id::bigint as printavo_order_id,
  raw.payload,
  raw.fetched_at,
  coalesce(
    nullif(raw.payload ->> 'updated_at', '')::timestamptz,
    raw.fetched_at
  ) as sort_at
from public.api_raw_payloads as raw
where raw.source = 'printavo'
  and raw.source_entity_type = 'order'
order by raw.source_entity_id, raw.fetched_at desc;

comment on view public.latest_printavo_order_payloads is
  'Newest stored Printavo payload for each order, protected by api_raw_payloads RLS.';

revoke all on table public.latest_printavo_order_payloads from public, anon;
grant select on table public.latest_printavo_order_payloads to authenticated;
