# Supabase — схема БД «Трекера привычек» (ДЗ5)

Миграции схемы, RLS-политики и инструкции по применению. Никаких ключей и
service-ролей в файлах нет: клиент работает под анонимным/авторизованным
доступом Supabase Auth, `user_id` строкам проставляет сервер через
`default auth.uid()`.

## Состав

| Файл | Что делает |
|---|---|
| `migrations/0001_init.sql` | Таблицы `habits` и `check_ins`, ограничения, PK, каскады, индексы |
| `migrations/0002_rls_policies.sql` | RLS и 8 именованных политик «только своё» |
| `migrations/0003_checkin_habit_ownership.sql` | Усиление insert/update-политик `check_ins`: отметка — только на свою привычку |

Все три миграции идемпотентны — повторный запуск не падает и не дублирует объекты.

## Маппинг к модели фронтенда (`src/data/api.js`)

| Фронтенд | БД | Тип / примечание |
|---|---|---|
| `Habit.id` | `habits.id` | uuid, `gen_random_uuid()` |
| `Habit.title` | `habits.title` | text, 1–40 символов после trim |
| `Habit.emoji` | `habits.emoji` | text, default `'💪'` |
| `Habit.color` | `habits.color` | text, формат `#RRGGBB`, default `'#7C9883'` |
| `Habit.createdAt` | `habits.created_at` | date, `current_date` |
| `Habit.archivedAt` | `habits.archived_at` | date или null |
| `CheckIn.habitId` | `check_ins.habit_id` | uuid, FK → habits |
| `CheckIn.date` | `check_ins.date` | date, ≤ сегодня |
| — | `*.user_id` | uuid, сервер: `default auth.uid()` — клиент не передаёт |
| — | `check_ins.created_at` | timestamptz, `now()` — техническое поле |

Даты приходят из Postgres строками `'YYYY-MM-DD'` — формат уже совпадает
с моделью фронтенда, конвертация не нужна.

## Применение

### Способ 1 — SQL Editor в дашборде Supabase

1. Открыть проект → **SQL Editor** → **New query**.
2. Вставить целиком содержимое `migrations/0001_init.sql` → **Run**.
3. Создать новый запрос, вставить `migrations/0002_rls_policies.sql` → **Run**.
4. Новым запросом применить `migrations/0003_checkin_habit_ownership.sql` → **Run**.

Порядок обязателен: 0002 ссылается на таблицы 0001, а 0003 заменяет
insert/update-политики `check_ins` из 0002 усиленными версиями.

### Способ 2 — Supabase CLI

```bash
npx supabase login                                    # один раз
npx supabase init                                     # создаст supabase/config.toml
npx supabase link --project-ref <PROJECT_REF>         # Reference ID: Settings → General
npx supabase db push                                  # применит все миграции из supabase/migrations
npx supabase migration list                           # проверить, что все три применены
```

Локальная проверка без облака (нужен Docker):

```bash
npx supabase start    # локальный стек Supabase
npx supabase db reset # пересоздаёт локальную БД и прогоняет все миграции
```

## Проверка применения

В SQL Editor (роль postgres обходит RLS — годится для служебных запросов):

```sql
-- Обе таблицы под RLS: rowsecurity = true
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('habits', 'check_ins');

-- Все 8 политик на месте: habits_*_own и check_ins_*_own (0003 пересоздаёт
-- insert/update check_ins с усиленным условием — полные условия видны
-- в колонках qual / with_check)
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Проверка RLS — пробы «чужое не читается и не пишется»

Создайте двух тестовых пользователей: **Authentication → Users → Add user**,
скопируйте их UID (это просто идентификаторы, не секреты — в файлы их
не сохраняем, подставляйте при выполнении).

SQL Editor выполняет скрипт одной транзакцией, поэтому клиентскую сессию
удобно имитировать подменой JWT-клеймов. Каждый блок ниже запускайте
отдельным запросом.

### 0. Каркас: работать «под пользователем A»

```sql
begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<UID-пользователя-A>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- ... здесь пробы 1–6 ...

rollback;
```

### 1. Чужие строки не читаются

```sql
select * from public.habits;          -- вернутся только привычки пользователя A
select * from public.check_ins;       -- то же для отметок
```

### 2. Запись «за другого» отклоняется

```sql
insert into public.habits (title, user_id)
values ('Взлом', '<UID-пользователя-B>');
-- ОЖИДАЕТСЯ: ERROR 42501 ... violates row-level security policy
```

### 3. Своя вставка проходит, user_id проставляется сервером

```sql
insert into public.habits (title) values ('Пробная') returning user_id;
-- вернётся строка, user_id = UID-A, хотя мы его не передавали
```

### 4. Будущая дата отметки отклоняется CHECK-ом

```sql
insert into public.check_ins (habit_id, date)
values ('<id-своей-привычки>', current_date + 1);
-- ОЖИДАЕТСЯ: ERROR 23514 ... check_ins_date_not_future
```

### 5. Каскад: удаление привычки удаляет её отметки

```sql
insert into public.habits (title) values ('На удаление') returning id;
insert into public.check_ins (habit_id, date)
  values ('<id-из-returning-выше>', current_date);
delete from public.habits where title = 'На удаление';
select count(*) from public.check_ins where habit_id = '<тот-же-id>';
-- ОЖИДАЕТСЯ: 0 — отметки удалились вместе с привычкой
```

### 6. Отметка на чужую привычку отклоняется (усиление 0003)

Политики 0003 проверяют не только `user_id` отметки, но и владельца
привычки: здесь `user_id` подставится свой (`default auth.uid()`), а
`habit_id` укажет на привычку пользователя B. Если у B ещё нет привычек,
создайте одну в его сессии (тот же каркас с UID-B) или через UI.

```sql
insert into public.check_ins (habit_id, date)
values ('<id-привычки-пользователя-B>', current_date);
-- ОЖИДАЕТСЯ: ERROR 42501 ... violates row-level security policy
-- (FK удовлетворён, но check_ins_insert_own требует свою привычку)

insert into public.check_ins (habit_id, date)
values ('<id-своей-привычки>', current_date);
-- ОЖИДАЕТСЯ: INSERT 0 1 — на свою привычку отметка проходит
```

Пробы 2, 4 и 6 (первая вставка) роняют транзакцию, поэтому запускайте их
в отдельных запросах (после ошибки делайте `rollback` и повторяйте каркас
для следующей пробы).

Альтернатива без SQL: те же проверки end-to-end из консоли браузера под
реальной сессией A — `supabase.from('habits').select()` возвращает только
своё, вставка с чужим `user_id` приходит с ошибкой 42501.

## Откат

В SQL Editor, в обратном порядке:

```sql
-- вниз по 0003: усиленные политики носят те же имена, что в 0002, —
-- отдельного отката нет, их убирает откат 0002 ниже

-- вниз по 0002: убрать политики и RLS
drop policy if exists habits_select_own   on public.habits;
drop policy if exists habits_insert_own   on public.habits;
drop policy if exists habits_update_own   on public.habits;
drop policy if exists habits_delete_own   on public.habits;
drop policy if exists check_ins_select_own on public.check_ins;
drop policy if exists check_ins_insert_own on public.check_ins;
drop policy if exists check_ins_update_own on public.check_ins;
drop policy if exists check_ins_delete_own on public.check_ins;
alter table public.habits disable row level security;
alter table public.check_ins disable row level security;

-- вниз по 0001: убрать таблицы (ДАННЫЕ БУДУТ УДАЛЕНЫ)
drop table if exists public.check_ins;
drop table if exists public.habits;
```
