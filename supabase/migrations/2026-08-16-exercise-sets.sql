-- Per-set strength logging.
-- Run this in Supabase → SQL Editor → New query, then hit Run.
-- Safe to run more than once (every statement is idempotent, including the backfill).
--
-- Why: workout_exercises stored ONE sets / reps / weight_lb per exercise, so a
-- real working set progression (135x10, 155x8, 175x5) could not be recorded.
-- exercise_sets holds one row per set and is now the source of truth for
-- strength work. The old flat columns are left in place but deprecated — the
-- app no longer writes them.

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

-- Ownership is two joins away (set → exercise → workout → user), so the policy
-- walks that chain rather than storing a duplicate user_id.
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

-- ---------- BACKFILL ----------
-- Expand each legacy row's "3 sets of 8 at 135" into 3 identical set rows.
-- Only touches exercises that have a sets count and no exercise_sets yet, so
-- re-running this never duplicates.
insert into exercise_sets (workout_exercise_id, set_index, weight_lb, reps)
select we.id, gs.i, we.weight_lb, we.reps
from workout_exercises we
cross join lateral generate_series(1, we.sets) as gs(i)
where we.sets is not null
  and we.sets > 0
  and not exists (
    select 1 from exercise_sets es where es.workout_exercise_id = we.id
  );

-- The legacy columns are intentionally NOT dropped: they keep old rows
-- readable if this migration ever needs to be reverted. Nothing writes them.
comment on column workout_exercises.sets is 'DEPRECATED — use exercise_sets. Kept for rollback only.';
comment on column workout_exercises.reps is 'DEPRECATED — use exercise_sets. Kept for rollback only.';
comment on column workout_exercises.weight_lb is 'DEPRECATED — use exercise_sets. Kept for rollback only.';
