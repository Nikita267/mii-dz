-- 0003: усиление целостности RLS для check_ins (по замечанию аудита ДЗ5).
--
-- Политики 0002 проверяли только совпадение check_ins.user_id с auth.uid(),
-- но не сверяли владельца привычки: аутентифицированный пользователь мог
-- рукотворным запросом вставить отметку на ЧУЖУЮ привычку (FK удовлетворён,
-- WITH CHECK проходил). UI так не делал (toggleCheckIn проверяет владельца),
-- но защита обязана жить в базе, а не в клиенте.
--
-- Заменяем insert/update-политики check_ins на версии с дополнительным
-- условием: отметка допустима, только если привычка принадлежит тому же
-- пользователю. Идемпотентно: drop policy if exists перед create.

drop policy if exists check_ins_insert_own on check_ins;
drop policy if exists check_ins_update_own on check_ins;

-- Вставка: свой user_id И своя привычка.
create policy check_ins_insert_own
  on check_ins
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from habits h
      where h.id = check_ins.habit_id
        and h.user_id = auth.uid()
    )
  );

-- Изменение: строка своя И привычка остаётся своей.
create policy check_ins_update_own
  on check_ins
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from habits h
      where h.id = check_ins.habit_id
        and h.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from habits h
      where h.id = check_ins.habit_id
        and h.user_id = auth.uid()
    )
  );

-- Select/delete-политики не меняются: чтение/удаление своей отметки чужой
-- привычки после этого усиления невозможно в принципе (вставка закрыта),
-- а существующие строки легитимны.
