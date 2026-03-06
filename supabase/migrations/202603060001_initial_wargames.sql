create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  slug text unique,
  classification text not null default 'TRAINING // UNCLASSIFIED',
  theater text,
  briefing text not null default '',
  default_view jsonb not null default '{"center":[-97.5164,38.8],"zoom":4.2,"bearing":0,"pitch":0}'::jsonb,
  grid_settings jsonb not null default '{"visible":true,"spacingKm":5}'::jsonb,
  presentation_settings jsonb not null default '{"theme":"tech-spec","aspectRatio":"16:9"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenario_layers (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  name text not null,
  color text not null default '#77d1ff',
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenario_features (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  layer_id uuid references public.scenario_layers(id) on delete set null,
  kind text not null check (kind in ('point', 'line', 'polygon', 'annotation', 'unit')),
  label text not null default '',
  geometry jsonb not null,
  properties jsonb not null default '{}'::jsonb,
  measurement_km numeric(12, 3),
  area_sq_km numeric(14, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  status text not null default 'draft',
  summary text,
  parameters jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.presentation_briefs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  title text not null,
  theme text not null default 'tech-spec',
  outline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_scenarios_updated_at
before update on public.scenarios
for each row
execute function public.set_updated_at();

create trigger set_scenario_layers_updated_at
before update on public.scenario_layers
for each row
execute function public.set_updated_at();

create trigger set_scenario_features_updated_at
before update on public.scenario_features
for each row
execute function public.set_updated_at();

create trigger set_simulation_runs_updated_at
before update on public.simulation_runs
for each row
execute function public.set_updated_at();

create trigger set_presentation_briefs_updated_at
before update on public.presentation_briefs
for each row
execute function public.set_updated_at();

alter table public.scenarios enable row level security;
alter table public.scenario_layers enable row level security;
alter table public.scenario_features enable row level security;
alter table public.simulation_runs enable row level security;
alter table public.presentation_briefs enable row level security;

create policy "owners manage scenarios"
on public.scenarios
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "owners manage layers"
on public.scenario_layers
for all
using (
  exists (
    select 1
    from public.scenarios
    where public.scenarios.id = public.scenario_layers.scenario_id
      and public.scenarios.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.scenarios
    where public.scenarios.id = public.scenario_layers.scenario_id
      and public.scenarios.owner_id = auth.uid()
  )
);

create policy "owners manage features"
on public.scenario_features
for all
using (
  exists (
    select 1
    from public.scenarios
    where public.scenarios.id = public.scenario_features.scenario_id
      and public.scenarios.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.scenarios
    where public.scenarios.id = public.scenario_features.scenario_id
      and public.scenarios.owner_id = auth.uid()
  )
);

create policy "owners manage simulation runs"
on public.simulation_runs
for all
using (
  exists (
    select 1
    from public.scenarios
    where public.scenarios.id = public.simulation_runs.scenario_id
      and public.scenarios.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.scenarios
    where public.scenarios.id = public.simulation_runs.scenario_id
      and public.scenarios.owner_id = auth.uid()
  )
);

create policy "owners manage presentation briefs"
on public.presentation_briefs
for all
using (
  exists (
    select 1
    from public.scenarios
    where public.scenarios.id = public.presentation_briefs.scenario_id
      and public.scenarios.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.scenarios
    where public.scenarios.id = public.presentation_briefs.scenario_id
      and public.scenarios.owner_id = auth.uid()
  )
);
