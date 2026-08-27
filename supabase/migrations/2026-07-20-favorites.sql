-- Favorites for the food library + past-meal reuse.
-- Run this in Supabase → SQL Editor → New query, then hit Run.
-- Safe to run more than once (every statement is idempotent).

-- Star an ingredient so it shows in the library's "★ Favorites" tab.
alter table food_library add column if not exists is_favorite boolean not null default false;
create index if not exists food_library_user_id_favorite_idx
  on food_library(user_id, is_favorite, last_used_at desc);

-- Star a meal so it sorts to the top of the "Past meals" tab for re-logging.
alter table meals add column if not exists is_favorite boolean not null default false;
create index if not exists meals_user_id_favorite_idx
  on meals(user_id, is_favorite, eaten_at desc);
