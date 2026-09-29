create table public.apparel_vendor_line_mappings (
  id uuid primary key default gen_random_uuid(),
  printavo_order_id bigint not null check (printavo_order_id > 0),
  printavo_line_item_id bigint not null check (printavo_line_item_id > 0),
  source_system text not null default 'printavo' check (btrim(source_system) <> ''),
  source_style_number text not null check (btrim(source_style_number) <> ''),
  source_color text not null check (btrim(source_color) <> ''),
  vendor_key text not null check (btrim(vendor_key) <> ''),
  vendor_style_id text not null check (btrim(vendor_style_id) <> ''),
  vendor_part_number text not null check (btrim(vendor_part_number) <> ''),
  vendor_brand_name text not null check (btrim(vendor_brand_name) <> ''),
  vendor_style_name text not null check (btrim(vendor_style_name) <> ''),
  vendor_color text not null check (btrim(vendor_color) <> ''),
  vendor_variants jsonb not null default '[]'::jsonb
    check (jsonb_typeof(vendor_variants) = 'array'),
  match_source text not null
    check (
      match_source in (
        'historical_confirmation',
        'vendor_catalog',
        'vendor_crossref'
      )
    ),
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (printavo_order_id, printavo_line_item_id, vendor_key)
);

create index apparel_vendor_line_mappings_historical_idx
  on public.apparel_vendor_line_mappings (
    source_system,
    vendor_key,
    lower(source_style_number),
    lower(source_color),
    confirmed_at desc
  );

create index apparel_vendor_line_mappings_order_idx
  on public.apparel_vendor_line_mappings (printavo_order_id, vendor_key);

create trigger apparel_vendor_line_mappings_set_updated_at
before update on public.apparel_vendor_line_mappings
for each row execute function public.set_updated_at();

alter table public.apparel_vendor_line_mappings enable row level security;

revoke all on table public.apparel_vendor_line_mappings from anon, authenticated;
grant select, insert, update on table public.apparel_vendor_line_mappings
  to authenticated;

create policy "Owners and admins can read apparel vendor mappings"
on public.apparel_vendor_line_mappings for select
to authenticated
using (public.current_app_role() in ('owner', 'admin'));

create policy "Owners and admins can create apparel vendor mappings"
on public.apparel_vendor_line_mappings for insert
to authenticated
with check (
  public.current_app_role() in ('owner', 'admin')
  and confirmed_by = auth.uid()
);

create policy "Owners and admins can update apparel vendor mappings"
on public.apparel_vendor_line_mappings for update
to authenticated
using (public.current_app_role() in ('owner', 'admin'))
with check (
  public.current_app_role() in ('owner', 'admin')
  and confirmed_by = auth.uid()
);

comment on table public.apparel_vendor_line_mappings is
  'Human-confirmed, order-line-specific mappings from Printavo apparel data to supplier styles, colors, and size SKUs. Confirmed rows also provide reusable evidence for later orders and additional vendors.';

comment on column public.apparel_vendor_line_mappings.vendor_variants is
  'Confirmed size-level supplier SKUs, requested quantities, prices, and observed availability for this order line.';
