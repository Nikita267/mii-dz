-- =============================================================================
-- 0001_init.sql — базовая схема БД «Трекера привычек» (ДЗ5, шаг 1)
--
-- Таблицы public.habits и public.check_ins: колонки, ограничения, индексы.
-- RLS и политики доступа — отдельной миграцией 0002_rls_policies.sql,
-- чтобы структуру и права можно было ревьюить и откатывать независимо.
--
-- Идемпотентно: повторный запуск безопасен (create table/index if not exists).
-- Команды отката — в разделе «Откат» supabase/README.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Таблица habits — привычки пользователя.
-- user_id сервер проставляет сам: default auth.uid() подставляет id текущей
-- клиентской сессии, поэтому клиент не передаёт user_id при вставке.
-- -----------------------------------------------------------------------------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- Название: 1–40 символов после trim — та же валидация, что и в UI
  title text not null
    constraint habits_title_length check (char_length(trim(title)) between 1 and 40),
  emoji text not null default '💪',
  -- Цвет строго '#RRGGBB' — формат токенов палитры Концепции 1
  color text not null default '#7C9883'
    constraint habits_color_format check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at date not null default current_date,
  -- null — активная привычка; дата — день архивации
  archived_at date
);

-- -----------------------------------------------------------------------------
-- Таблица check_ins — отметки выполнения.
-- Составной PK (habit_id, date): максимум одна отметка на привычку в день,
-- повторная вставка существующей пары отклоняется — «тумблер» клиента
-- реализуется парой insert/delete.
-- -----------------------------------------------------------------------------
create table if not exists public.check_ins (
  -- Удаление привычки каскадом стирает и её отметки
  habit_id uuid not null
    references public.habits (id) on delete cascade,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- Отметка «из будущего» запрещена: нельзя отметить завтрашний день
  date date not null
    constraint check_ins_date_not_future check (date <= current_date),
  created_at timestamptz not null default now(),
  primary key (habit_id, date)
);

-- -----------------------------------------------------------------------------
-- Индексы под запросы клиента:
--   habits(user_id)          — список привычек пользователя;
--   check_ins(user_id, date) — выборка отметок по диапазону дат (неделя/месяц).
-- -----------------------------------------------------------------------------
create index if not exists idx_habits_user_id on public.habits (user_id);

create index if not exists idx_check_ins_user_id_date on public.check_ins (user_id, date);
