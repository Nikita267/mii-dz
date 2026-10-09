# Трекер привычек

Веб-приложение для ежедневного отслеживания привычек: список привычек с отметками в один тап, серии (streaks) и статистика. Учебный сквозной проект курса «Методы искусственного интеллекта» (ДЗ4 — Frontend; ДЗ5 — бэкенд на Supabase).

## Стек

- **React 19 + Vite 7** — SPA без лишних зависимостей (роутинг — вкладки, состояние — хуки)
- **Tailwind CSS 4** — дизайн-токены Концепции 1 «Спокойный минимализм» из ДЗ3 (`src/index.css`)
- **Vitest + Testing Library** — 121 юнит-/компонентный тест
- **Supabase** (PostgreSQL + Auth + RLS) — облачный бэкенд через `@supabase/supabase-js`; фасад `src/data/api.js` переключает его и Mock-режим (localStorage, эмуляция сети) по наличию `.env`

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173
```

Продакшен-сборка и превью:

```bash
npm run build
npm run preview
```

## Бэкенд (ДЗ5, Supabase)

Данные и аккаунты — в [Supabase](https://supabase.com): PostgreSQL-схема, Auth (email + пароль) и построчная безопасность (RLS). Без настроенного `.env` приложение работает в Mock-режиме — код не меняется, меняется только слой данных за фасадом `src/data/api.js`.

1. Создайте проект на [supabase.com](https://supabase.com) и выполните в **SQL Editor** миграции из [`supabase/migrations/`](supabase/migrations/): сначала `0001_init.sql` (таблицы), затем `0002_rls_policies.sql` (RLS-политики)
2. **Settings → API**: скопируйте **Project URL** и ключ **anon public**
3. `cp .env.example .env` — впишите оба значения (ключ `service_role` использовать запрещено: он обходит RLS; `.env` в `.gitignore`)
4. `npm run dev` — приложение в облачном режиме

Схема БД, RLS-политики, REST API, обработка ошибок и проверка безопасности — в [`backend_documentation.md`](backend_documentation.md). Откат миграций и пробы RLS «чужое не читается» — в [`supabase/README.md`](supabase/README.md).

## Тесты

```bash
npm test           # однократный прогон (121 тест, 8 файлов)
npm run test:watch # режим наблюдения
```

Покрытие: утилиты статистики и форматирования (84 теста, портированы из ДЗ2), компоненты (WeekBars, StatsCalendar), экраны (StatsScreen, ProfileScreen), хук данных (включая откат оптимистичной отметки при сбое сети).

## Структура

```
src/
├── components/   # переиспользуемые: HabitCard, WeekDots, StreakBadge, DaySummary,
│                 # HabitDialog (создание/редактирование), EmptyState, ErrorBanner,
│                 # WeekBars, StatsCalendar
├── screens/      # TodayScreen, StatsScreen, ProfileScreen
├── hooks/        # useHabitsData — загрузка, оптимистичные отметки, retry
├── data/         # api.js — фасад (Supabase или Mock); supabaseBackend.js — облачный слой
├── utils/        # stats.js, format.js — чистые функции (из ДЗ2)
├── App.jsx       # оболочка + нижняя навигация (#today/#stats/#profile — глубокие ссылки)
└── index.css     # дизайн-токены Tailwind (палитра Концепции 1 из ДЗ3)
```

CLAUDE.md — правила AI-агента проекта (из ДЗ2). Бэкенд — `supabase/` (миграции, README с пробами RLS), ключи — `.env` из `.env.example`.

## Функции (MVP, по ТЗ ДЗ3)

1. **Управление привычками** — создание (название 1–40, эмодзи, цвет), редактирование, архивация с подтверждением и восстановление
2. **Ежедневная отметка** — список «Сегодня», отметка в один тап (оптимистичный UI с откатом), прогресс дня
3. **Серии и статистика** — текущая серия и рекорд, столбики недели, календарь месяца, процент выполнения
4. **Аккаунт и синхронизация** — Mock-режим с баннером «локально»; с настроенным Supabase — регистрация, вход, сброс пароля и перенос локальных данных в облако (ДЗ5)

## Скриншоты

Скриншоты экранов и адаптива — в [`../скриншоты/`](../скриншоты/).
