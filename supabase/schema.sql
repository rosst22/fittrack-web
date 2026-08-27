-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query)

-- ---------- PROFILE ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  height_in numeric,
  age integer,
  weight_lb numeric,
  sex text,                        -- 'male' | 'female' | null
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "users manage own profile" on profiles;
create policy "users manage own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- WHOOP ----------
create table if not exists whoop_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text,
  updated_at timestamptz not null default now()
);

-- Cached snapshot of the last explicit sync, so pages can show Whoop stats
-- without hitting Whoop's API (and without silently refreshing the token)
-- on every page load.
alter table whoop_connections add column if not exists last_recovery_score numeric;
alter table whoop_connections add column if not exists last_resting_hr numeric;
alter table whoop_connections add column if not exists last_hrv_ms numeric;
alter table whoop_connections add column if not exists last_sleep_performance numeric;
alter table whoop_connections add column if not exists last_sleep_efficiency numeric;
alter table whoop_connections add column if not exists last_sleep_json jsonb not null default '[]'::jsonb;
alter table whoop_connections add column if not exists last_strain numeric;
alter table whoop_connections add column if not exists last_avg_hr numeric;
alter table whoop_connections add column if not exists last_synced_at timestamptz;

alter table whoop_connections enable row level security;

drop policy if exists "users manage own whoop connection" on whoop_connections;
create policy "users manage own whoop connection" on whoop_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- GOALS ----------
create table if not exists goals (
  id uuid primary key references auth.users(id) on delete cascade,
  calorie_target numeric,
  protein_target_g numeric,
  carbs_target_g numeric,
  fat_target_g numeric,
  workouts_per_week integer,
  water_target_oz numeric,
  notes text,
  updated_at timestamptz not null default now()
);
-- Add water goal to existing goals tables.
alter table goals add column if not exists water_target_oz numeric;

alter table goals enable row level security;

drop policy if exists "users manage own goals" on goals;
create policy "users manage own goals" on goals
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- HYDRATION ----------
create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_oz numeric not null,
  logged_at timestamptz not null default now()
);
create index if not exists water_logs_user_id_logged_at_idx on water_logs(user_id, logged_at);
alter table water_logs enable row level security;
drop policy if exists "users manage own water logs" on water_logs;
create policy "users manage own water logs" on water_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- SUPPLEMENTS / MEDICATIONS ----------
create table if not exists supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose text,
  category text not null default 'supplement',  -- 'supplement' | 'medication'
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table supplements enable row level security;
drop policy if exists "users manage own supplements" on supplements;
create policy "users manage own supplements" on supplements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists supplement_logs (
  id uuid primary key default gen_random_uuid(),
  supplement_id uuid not null references supplements(id) on delete cascade,
  taken_at timestamptz not null default now()
);
create index if not exists supplement_logs_supplement_id_taken_at_idx on supplement_logs(supplement_id, taken_at);
alter table supplement_logs enable row level security;
drop policy if exists "users manage own supplement logs" on supplement_logs;
create policy "users manage own supplement logs" on supplement_logs
  for all using (
    exists (select 1 from supplements where supplements.id = supplement_logs.supplement_id and supplements.user_id = auth.uid())
  ) with check (
    exists (select 1 from supplements where supplements.id = supplement_logs.supplement_id and supplements.user_id = auth.uid())
  );

-- ---------- HABITS ----------
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table habits enable row level security;
drop policy if exists "users manage own habits" on habits;
create policy "users manage own habits" on habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  done_at timestamptz not null default now()
);
create index if not exists habit_logs_habit_id_done_at_idx on habit_logs(habit_id, done_at);
alter table habit_logs enable row level security;
drop policy if exists "users manage own habit logs" on habit_logs;
create policy "users manage own habit logs" on habit_logs
  for all using (
    exists (select 1 from habits where habits.id = habit_logs.habit_id and habits.user_id = auth.uid())
  ) with check (
    exists (select 1 from habits where habits.id = habit_logs.habit_id and habits.user_id = auth.uid())
  );

-- ---------- MEALS ----------
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  eaten_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  photo_path text
);
alter table meals add column if not exists photo_path text;
-- Starred meals sort to the top of the "Past meals" tab for one-click re-logging.
alter table meals add column if not exists is_favorite boolean not null default false;
create index if not exists meals_user_id_favorite_idx on meals(user_id, is_favorite, eaten_at desc);

create table if not exists meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  fdc_id integer,
  name text not null,
  weight_g numeric not null,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  micronutrients jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists meal_ingredients_meal_id_idx on meal_ingredients(meal_id);
create index if not exists meals_user_id_eaten_at_idx on meals(user_id, eaten_at);

alter table meals enable row level security;
alter table meal_ingredients enable row level security;

drop policy if exists "users manage own meals" on meals;
create policy "users manage own meals" on meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own meal ingredients" on meal_ingredients;
create policy "users manage own meal ingredients" on meal_ingredients
  for all using (
    exists (select 1 from meals where meals.id = meal_ingredients.meal_id and meals.user_id = auth.uid())
  ) with check (
    exists (select 1 from meals where meals.id = meal_ingredients.meal_id and meals.user_id = auth.uid())
  );

-- ---------- WORKOUTS ----------
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  bodyweight_lb numeric,
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  source text not null default 'manual',        -- 'manual' | 'whoop'
  whoop_workout_id text unique                  -- Whoop activity id, for idempotent sync
);
alter table workouts add column if not exists source text not null default 'manual';
alter table workouts add column if not exists whoop_workout_id text unique;

create table if not exists workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  name text not null,
  category text not null,           -- MET category key (see src/lib/exercises.ts)
  met numeric not null default 0,
  duration_min numeric not null default 0,
  sets integer,
  reps integer,
  weight_lb numeric,
  calories numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists workout_exercises_workout_id_idx on workout_exercises(workout_id);
create index if not exists workouts_user_id_performed_at_idx on workouts(user_id, performed_at);

alter table workouts enable row level security;
alter table workout_exercises enable row level security;

drop policy if exists "users manage own workouts" on workouts;
create policy "users manage own workouts" on workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own workout exercises" on workout_exercises;
create policy "users manage own workout exercises" on workout_exercises
  for all using (
    exists (select 1 from workouts where workouts.id = workout_exercises.workout_id and workouts.user_id = auth.uid())
  ) with check (
    exists (select 1 from workouts where workouts.id = workout_exercises.workout_id and workouts.user_id = auth.uid())
  );

-- One row per working set. Source of truth for strength work; the flat
-- sets/reps/weight_lb columns on workout_exercises above are DEPRECATED and no
-- longer written (see supabase/migrations/2026-08-16-exercise-sets.sql).
create table if not exists exercise_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  set_index integer not null,          -- 1-based display order within the exercise
  weight_lb numeric,                   -- null = bodyweight (pull-ups, dips, ...)
  reps integer,
  created_at timestamptz not null default now(),
  unique (workout_exercise_id, set_index)
);

create index if not exists exercise_sets_workout_exercise_id_idx
  on exercise_sets(workout_exercise_id, set_index);

alter table exercise_sets enable row level security;

drop policy if exists "users manage own exercise sets" on exercise_sets;
create policy "users manage own exercise sets" on exercise_sets
  for all using (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = exercise_sets.workout_exercise_id and w.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = exercise_sets.workout_exercise_id and w.user_id = auth.uid()
    )
  );

-- ---------- MEAL PHOTOS (storage bucket for AI-analyzed meal photos) ----------
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

drop policy if exists "users manage own meal photos" on storage.objects;
create policy "users manage own meal photos" on storage.objects
  for all using (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------- FOOD LIBRARY (recently-used foods, per-100g, for quick re-add) ----------
create table if not exists food_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  fdc_id integer,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  micronutrients jsonb not null default '{}'::jsonb,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
-- Starred foods surface in the "Favorites" tab of the library picker.
alter table food_library add column if not exists is_favorite boolean not null default false;

create index if not exists food_library_user_id_last_used_at_idx on food_library(user_id, last_used_at desc);
create index if not exists food_library_user_id_favorite_idx on food_library(user_id, is_favorite, last_used_at desc);
alter table food_library enable row level security;
drop policy if exists "users manage own food library" on food_library;
create policy "users manage own food library" on food_library
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- AI USAGE (coach cost tracking / daily spend cap) ----------
create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,            -- e.g. 'photo_meal'
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_id_created_at_idx on ai_usage(user_id, created_at);

alter table ai_usage enable row level security;

drop policy if exists "users manage own ai usage" on ai_usage;
create policy "users manage own ai usage" on ai_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
