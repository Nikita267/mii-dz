-- =============================================================================
-- 0002_rls_policies.sql — RLS и политики доступа (ДЗ5, шаг 3)
--
-- Обе таблицы под Row Level Security: без подходящей политики строка
-- недоступна клиентским ролям. Каждая операция (select / insert / update /
-- delete) на каждой таблице покрыта именованной политикой с условием
-- auth.uid() = user_id — «владелец видит и меняет только своё».
--
-- Замечания:
--   * Политики Postgres действуют построчно (row-level) по определению,
--     отдельной секции FOR EACH в CREATE POLICY нет.
--   * REVOKE не используется — RLS достаточно: гранты остаются, но строки
--     чужих пользователей отфильтровываются.
--   * to authenticated: политика действует только для залогиненных
--     клиентов; anon-сессии не проходят условие auth.uid() = user_id.
--
-- Идемпотентно: drop policy if exists перед каждым create — повторный
-- запуск пересоздаёт политики без ошибок.
-- =============================================================================

-- Включаем RLS (повторное выполнение — безвредный no-op)
alter table public.habits enable row level security;
alter table public.check_ins enable row level security;

-- -----------------------------------------------------------------------------
-- Политики habits — 4 операции
-- -----------------------------------------------------------------------------

-- Чтение — только свои привычки
drop policy if exists habits_select_own on public.habits;
create policy habits_select_own
  on public.habits
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Вставка: user_id обычно не передаётся и берётся из default auth.uid();
-- with check не даёт создать строку «за другого» пользователя
drop policy if exists habits_insert_own on public.habits;
create policy habits_insert_own
  on public.habits
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Обновление: using фильтрует изменяемые строки, with check не даёт
-- «подарить» привычку другому пользователю через update
drop policy if exists habits_update_own on public.habits;
create policy habits_update_own
  on public.habits
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Удаление — только своих
drop policy if exists habits_delete_own on public.habits;
create policy habits_delete_own
  on public.habits
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Политики check_ins — те же 4 операции
-- -----------------------------------------------------------------------------

drop policy if exists check_ins_select_own on public.check_ins;
create policy check_ins_select_own
  on public.check_ins
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists check_ins_insert_own on public.check_ins;
create policy check_ins_insert_own
  on public.check_ins
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists check_ins_update_own on public.check_ins;
create policy check_ins_update_own
  on public.check_ins
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists check_ins_delete_own on public.check_ins;
create policy check_ins_delete_own
  on public.check_ins
  for delete
  to authenticated
  using (auth.uid() = user_id);
