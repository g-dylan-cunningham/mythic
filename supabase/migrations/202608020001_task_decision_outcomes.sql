alter table public.production_tasks
  add column if not exists outcome_key text,
  add column if not exists outcome_label_snapshot text,
  add column if not exists outcome_note text,
  add column if not exists outcome_recorded_at timestamptz,
  add column if not exists outcome_recorded_by uuid references auth.users(id) on delete set null;

create index if not exists production_tasks_outcome_key_idx
  on public.production_tasks(outcome_key)
  where outcome_key is not null;

comment on column public.production_tasks.outcome_key is
  'Structured result for decision-style tasks, such as artwork_needed or artwork_not_needed.';

comment on column public.production_tasks.outcome_label_snapshot is
  'Human-readable snapshot of the decision outcome at the time it was recorded.';

comment on column public.production_tasks.outcome_note is
  'Optional note captured when a decision outcome is recorded.';

comment on column public.production_tasks.outcome_recorded_at is
  'Timestamp when the decision outcome was recorded.';

comment on column public.production_tasks.outcome_recorded_by is
  'User who recorded the decision outcome.';
