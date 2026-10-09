# Аудит безопасности — «Трекер привычек» (ДЗ6, Шаг 2)

Дата: 2026-10-09. Аудит фиксирует состояние проекта; код и конфигурация не изменялись.

## 1. Методика

1. **`npm audit --json`** (npm 11.16.0, Node 24.18.0) — анализ дерева зависимостей
   (444 пакета: 13 production, 432 dev). Дополнительно: `npm ls --depth=0`,
   `npm audit --omit=dev`, `npm audit fix --dry-run` (проверка, есть ли фиксы
   без breaking-изменений; реальная установка не выполнялась).
2. **AI-ревью кода по OWASP Top 10 (2021)** — ручное чтение ключевых файлов:
   - `src/data/supabaseBackend.js`, `src/data/api.js` — слой данных и фасад;
   - `src/hooks/useAuth.js`, `src/hooks/useHabitsData.js` — сессия и загрузка;
   - `src/App.jsx`, `src/main.jsx`, `index.html`, `vite.config.js` — входные точки;
   - `supabase/migrations/0001..0003.sql` — схема, RLS, целостность;
   - `scripts/e2e-smoke.mjs`, `.env.example`, git-индекс репозитория.
   - Grep-проверки: `dangerouslySetInnerHTML|innerHTML|eval|document.write`
     (0 совпадений в `src/`), `service_role|SECRET|ANON_KEY` по некоммитимым
     путям (только имена env-переменных, значений нет).
3. Проверка секретов в git: `git check-ignore .env` (игнорируется корневым
   `.gitignore`), `git ls-files` (в репозитории из env-файлов только
   `.env.example` с пустыми значениями), скан собранного `dist/` на JWT-подобные
   строки и `service_role` (0 совпадений).

## 2. Найденные уязвимости

Итог `npm audit`: **3 уязвимости (2 critical, 1 moderate) — все в dev-цепочке
vitest; production-зависимости (react, react-dom, @supabase/supabase-js):
0 уязвимостей** (`npm audit --omit=dev` — found 0 vulnerabilities).

| ID | Уровень | Описание | Затронуто | Статус |
|----|---------|----------|-----------|--------|
| VULN-001 | critical | Prototype pollution -> RCE [1, 2] | tinypool (dev) | принято_risk |
| VULN-002 | critical | Агрегатор VULN-001/003 | vitest 3.2.7 (dev) | принято_risk |
| VULN-003 | moderate | Path traversal, чтение файлов [3] | @vitest/mocker (dev) | принято_risk |
| VULN-004 | low | Нет security-заголовков ответа (§4.1) | деплой Vercel | рекомендация |
| VULN-005 | low | Токен в localStorage читаем при XSS (§5) | supabaseBackend.js | принято_risk |
| VULN-006 | low | Confirm email выключен; код готов | Supabase Auth | рекомендация |

Advisories (все три — dev-цепочка vitest, в production-бандл не попадают):

- [1] GHSA-5gmw-xhrv-c9v3 — tinypool <= 2.1.0, prototype pollution gadget в
  опциях воркера -> Remote Code Execution (CWE-1321);
- [2] GHSA-85c8-ppgw-ccpr — tinypool < 2.1.2, prototype pollution gadget to RCE
  в опциях `run()` (CWE-1321, CWE-94);
- [3] GHSA-82fw-gwwq-j7x9 — @vitest/mocker 2.1.0–4.1.10, path traversal /
  arbitrary file read через redirect-mock (CWE-22, CVSS 3.1 = 5.9).

Обоснование принятых рисков (VULN-001..003): все три уязвимости живут в
dev-инструментарии и не попадают в production-бандл (vitest не используется
сборкой `vite build`). Эксплойт требует контролируемых злоумышленником опций
воркера или redirect-мока — тесты проекта выполняются только над собственным
кодом. `npm audit fix --dry-run`: фиксов без breaking-изменений нет — доступен только
`npm audit fix --force` с переходом vitest 3 -> 5 (breaking, isSemVerMajor).
Запланировать отдельной задачей (см. §4).

Положительные результаты проверок (находок нет):

- **XSS (A03):** в `src/` ноль `dangerouslySetInnerHTML` / `innerHTML` / `eval`
  / `new Function` / `document.write`. Весь вывод — через JSX (автоэкранирование
  React). Хэш-навигация `#today/#stats/#profile` валидируется белым списком
  `TAB_IDS` и не интерпретируется как разметка.
- **Инъекции (A03):** клиент БД — PostgREST builder (`supabase-js`): все запросы
  строятся методами `.eq()/.insert()/.update()/.delete()` с типизированными
  значениями; сырого SQL, `rpc()` и конкатенаций строк в запросах нет.
- **Секреты (A02):** в коде и git — только имена env-переменных; `.env`
  игнорируется, значения ключей нигде не закоммичены (в т.ч. в `dist/`);
  `service_role` документационно запрещён. Anon-ключ публичен by design,
  защита обеспечивает RLS.
- **CSRF (A01/A05):** аутентификация — Bearer-токен в заголовке `Authorization`,
  cookies приложение не использует -> классический CSRF (автоматическая
  отправка ambient-credentials) неприменим. Сторона XSS-кражи токена — см. VULN-005.

## 3. Выполненные исправления

**Не выполнялись — по условиям шага аудит только фиксирует состояние.**
Безопасных для автоматического применения исправлений `npm audit fix` (без
`--force`) нет. Изменения кода/конфигурации переведены в статусы
«рекомендация» таблицы §2 и список §4.

## 4. Рекомендации

1. **Security-заголовки через `vercel.json`** (VULN-004). Vercel из коробки даёт
   HTTPS/HSTS на `*.vercel.app` и `x-vercel-id`, но не выставляет
   X-Frame-Options / Referrer-Policy / CSP. Предлагаемый блок (применить при
   деплое ДЗ6):

   ```json
   {
     "headers": [
       {
         "source": "/(.*)",
         "headers": [
             { "key": "X-Frame-Options", "value": "DENY" },
             { "key": "X-Content-Type-Options", "value": "nosniff" },
             { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
             { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
           ]
       }
     ]
   }
   ```

   CSP для SPA на Supabase — отдельной задачей (нужен список `connect-src`
   для `${VITE_SUPABASE_URL}` и безопасные стили Tailwind).
2. **Обновление vitest 3 -> 5** (закрывает VULN-001..003): major-переход,
   прогнать `npm test` после миграции конфигурации. До перехода риск принят:
   dev-only, exploitation-путь в проекте отсутствует.
3. **Dependabot**: `.github/dependabot.yml` — ecosystem `npm`, интервал weekly,
   группировать minor/patch, чтобы не тонуть в PR.
4. **Ротация ключей**: при подозрении утечки — Supabase Dashboard → Settings →
   API → regenerate (anon и при необходимости service_role с ротацией JWT secret
   — это инвалидирует все сессии). Проверять, что `service_role` никогда не
   попадает в `VITE_*`-переменные (Vite встраивает их в клиентский бандл).
5. **Включить «Confirm email»** (VULN-006): Supabase → Authentication → Sign In /
   Providers → Email. Приложение уже готово (`signUp` возвращает
   `needsConfirmation`, вход до подтверждения блокируется) — меняется только
   настройка проекта; e2e-скрипт имеет ветку для этого режима.
6. Включить в Supabase требование минимальной длины пароля и rate limit
   (Auth → Rate limits), если отличается от дефолтного.

## 5. Переоценка рисков RLS

По `supabase/migrations/0001–0003.sql` защита данных трёхуровневая:

1. **RLS + пооперационные политики** (`0002`): RLS включён на обеих таблицах;
   select/insert/update/delete покрыты именованными политиками `to authenticated`
   с `auth.uid() = user_id` в `using` и `with check` (последний запрещает и
   «подарить» строку другому пользователю через update/insert). Политик для
   `anon` нет — аноним видит ноль строк.
2. **Ownership-сшивка** (`0003`): insert/update `check_ins` дополнительно требуют,
   чтобы привычка принадлежала тому же пользователю (закрытие замечания аудита
   ДЗ5 — отметка на чужую привычку при удовлетворённом FK).
3. **CHECK-ограничения и целостность** (`0001`): длина title 1–40 после trim;
   цвет строго `^#[0-9A-Fa-f]{6}$`; `date <= current_date` (отметки «из будущего»
   отклоняются БД); PK `(habit_id, date)` — дубль отметки невозможен; FK на
   `auth.users` и `habits` с каскадным удалением.

Вывод: **риск несанкционированного доступа к данным — низкий**. Авторизация
проверяется на уровне БД, а не клиента (клиентские проверки — лишь UX);
изоляция пользователей подтверждается живыми проверками `scripts/e2e-smoke.mjs`
(anon получает пустые выборки, будущая дата отклоняется, каскад работает).
Остаточные сценарии (локальный XSS читает токен из localStorage) учтены
VULN-005 и закрываются рекомендациями §4.1 (заголовки) и отсутствием
XSS-инъекций в коде.
