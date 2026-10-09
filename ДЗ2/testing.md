# ДЗ2 · Шаг 5 — Тестирование системы правил (testing.md)

## Методика

Одна и та же небольшая задача выдана двум «свежим» агентам (Claude Code, одинаковая модель, пустой контекст):

- **ДО** — агент решает задачу как есть, без файла правил;
- **ПОСЛЕ** — агент обязан сначала прочитать `ДЗ2/CLAUDE.md` и следовать каждому правилу.

**Задача:** утилита форматирования для «Трекера привычек»: `formatStreak(days)` — человекочитаемая длина серии с правильными формами русских слов; `weekLabel(date)` — подпись недели («эта неделя» / «прошлая неделя» / диапазон «29 сентября – 5 октября»). JavaScript, без сторонних библиотек.

Оба агента работали с реальной файловой системой и прогоняли тесты; код ниже — их фактические ответы (файлы сохранены: `без_правил/format.js` и `src/utils/format.js`).

---

## ДО применения правил (сырой ответ агента)

> 19/19 тестов зелёные (6 старых streak + 13 новых format). Код утилиты:
>
> **Файл: `format.js`** *(положил в корень тестового проекта — рядом с прочими файлами; package.json не создавал)*

```javascript
// Утилиты форматирования для «Трекера привычек».
//
// formatStreak(days)  — человекочитаемое описание длины серии:
//   0 -> «нет серии», 1 -> «1 день», 2–4 -> «N дня», 5+ -> «N дней»
//   (с учётом общих правил русской грамматики: 21 день, 22–24 дня,
//   11–14 дней и т.д. — на случай длинных серий).
//
// weekLabel(date) — подпись недели для заголовка группы отметок:
//   текущая неделя -> «эта неделя», предыдущая -> «прошлая неделя»,
//   иначе диапазон понедельник–воскресенье: «29 сентября – 5 октября».
//   Неделя начинается с понедельника; «сейчас» инъектируется вторым
//   аргументом для детерминированных тестов.

'use strict';

// месяцы в родительном падеже: «5 октября», а не «5 октябрь»
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/**
 * Человекочитаемая длина серии выполнений.
 * @param {number} days — целое число дней (0 или больше).
 * @returns {string} «нет серии» | «1 день» | «2 дня» | «5 дней» ...
 */
function formatStreak(days) {
  if (!Number.isInteger(days) || days < 0) {
    throw new TypeError(`formatStreak: ожидается неотрицательное целое, получено: ${days}`);
  }
  if (days === 0) return 'нет серии';

  const mod10 = days % 10;
  const mod100 = days % 100;
  let noun;
  if (mod10 === 1 && mod100 !== 11) {
    noun = 'день';       // 1, 21, 31 ... но не 11, 111
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    noun = 'дня';        // 2–4, 22–24 ... но не 12–14, 112–114
  } else {
    noun = 'дней';       // 5–20, 25–30, 11–14 ...
  }
  return `${days} ${noun}`;
}

/** Полночь того же дня, что и date (локальное время). */
function midnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Понедельник недели, к которой относится date (локальное время). */
function startOfWeek(date) {
  const d = midnight(date);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7); // вс=0..сб=6 -> пн=0..вс=6
  return d;
}

/** «8 октября» — число + месяц в родительном падеже. */
function formatDayMonth(date) {
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;
}

/**
 * Подпись недели для заголовка группы отметок.
 * @param {Date|string} date — любая дата внутри недели (Date или 'YYYY-MM-DD').
 * @param {Date} [now=new Date()] — «сейчас», инъектируется в тестах.
 * @returns {string} «эта неделя» | «прошлая неделя» | «29 сентября – 5 октября»
 */
function weekLabel(date, now = new Date()) {
  const target = date instanceof Date ? date : new Date(`${date}T00:00:00`); // без UTC-сдвига
  const weekStart = startOfWeek(target);
  const currentStart = startOfWeek(now);

  // разница в неделях; Math.round гасит лишний/недостающий час при переходе
  // на летнее/зимнее время (неделя бывает 167 или 169 часов)
  const diffWeeks = Math.round((weekStart - currentStart) / 604800000);

  if (diffWeeks === 0) return 'эта неделя';
  if (diffWeeks === -1) return 'прошлая неделя';

  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  return `${formatDayMonth(weekStart)} – ${formatDayMonth(weekEnd)}`;
}

// Экспорт для Node.js; в браузере функции доступны глобально
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatStreak, weekLabel };
}
```

> Тесты: `format.test.js` — 13 проверок (склонения включая 11/21/111/112, границы недель, стык месяцев «31 августа – 6 сентября», стык года, ввод строкой). Прогон: `node --test` → 19/19 pass. По ходу два ожидания в тестах были исправлены как ошибочные (30.09 — это «прошлая неделя», а не диапазон; 112 → «112 дней»), код не менялся.

---

## ПОСЛЕ применения правил (сырой ответ агента)

> **План (был до правок):** создать `src/utils/format.js` (чистые функции), рядом тест `src/utils/format.test.js` (`node:test`, без зависимостей), минимальный `package.json` для ES-модулей, прогнать тесты.
>
> **Решение по TDD-циклу:** первый прогон поймал 2 падения — неделя целиком внутри одного месяца печаталась как «18 августа – 24 августа»; исправлено на идиоматичное «18 – 24 августа». Итог: **18/18 тестов зелёные**.
>
> **Изменённые файлы:** `src/utils/format.js` (создан), `src/utils/format.test.js` (создан), `package.json` (создан: `"type": "module"`, скрипт test, зависимостей 0).
> **Проверка:** `cd ДЗ2 && node --test` → tests 18 / pass 18 / fail 0.

```js
// Утилиты форматирования человекочитаемых подписей для «Трекера привычек».
// Чистые функции без побочных эффектов: одинаково работают в Node и браузере.

/** Русские названия месяцев в родительном падеже: «5 октября», «29 сентября». */
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const NO_STREAK_LABEL = 'нет серии';
const CURRENT_WEEK_LABEL = 'эта неделя';
const PREVIOUS_WEEK_LABEL = 'прошлая неделя';
/** Тире в диапазоне дат — как в макете («29 сентября – 5 октября»). */
const RANGE_SEPARATOR = ' – ';

const DAYS_IN_WEEK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Смещение JS-нумерации дней (вс = 0…сб = 6) к неделе «с понедельника». */
const MONDAY_OFFSET = 6;

/** Границы формы «N дня» по последней цифре числа: 2, 3, 4. */
const FEW_LAST_DIGIT_MIN = 2;
const FEW_LAST_DIGIT_MAX = 4;
/** Диапазон 11–14 — исключение русской plural-логики: всегда «дней». */
const TEENS_MIN = 11;
const TEENS_MAX = 14;

/**
 * Подбирает форму слова «день» по правилам русского языка.
 *
 * Правила зависят от двух последних цифр: 11–14 — всегда «дней»;
 * иначе последняя цифра 1 — «день», 2–4 — «дня», остальные — «дней».
 * Поэтому для серий 21+ («21 день», «22 дня») простое правило «5+ — дней»
 * дало бы неграмотные подписи.
 *
 * @param {number} count — количество дней (целое, неотрицательное).
 * @returns {string} Одна из форм: «день», «дня», «дней».
 */
function daysWord(count) {
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= TEENS_MIN && lastTwoDigits <= TEENS_MAX) {
    return 'дней';
  }
  const lastDigit = count % 10;
  if (lastDigit === 1) {
    return 'день';
  }
  if (lastDigit >= FEW_LAST_DIGIT_MIN && lastDigit <= FEW_LAST_DIGIT_MAX) {
    return 'дня';
  }
  return 'дней';
}

/**
 * Человекочитаемое описание длины серии привычки.
 *
 * Примеры: 0 — «нет серии», 1 — «1 день», 3 — «3 дня», 5 — «5 дней»,
 * 21 — «21 день». Некорректные значения (отрицательные, не числа)
 * схлопываются в «нет серии», чтобы битые данные не ломали интерфейс.
 *
 * @param {number} days — длина серии в днях.
 * @returns {string} Готовая к показу подпись.
 */
export function formatStreak(days) {
  const count = Math.floor(Number(days));
  if (!Number.isFinite(count) || count <= 0) {
    return NO_STREAK_LABEL;
  }
  return `${count} ${daysWord(count)}`;
}

/**
 * Приводит дату к полуночи локального времени.
 * Нормализация нужна, чтобы разница недель не зависела от времени суток.
 *
 * @param {Date} date — исходная дата.
 * @returns {Date} Новый объект Date с обнулённым временем.
 */
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Возвращает понедельник недели, к которой относится дата.
 *
 * @param {Date} date — исходная дата.
 * @returns {Date} Полночь понедельника этой недели.
 */
function startOfWeek(date) {
  const monday = startOfDay(date);
  const daysSinceMonday = (date.getDay() + MONDAY_OFFSET) % DAYS_IN_WEEK;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return monday;
}

/**
 * Форматирует дату как «5 октября».
 *
 * @param {Date} date — исходная дата.
 * @returns {string} День месяца и месяц в родительном падеже.
 */
function formatDayMonth(date) {
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;
}

/**
 * Форматирует диапазон недели: понедельник — воскресенье.
 *
 * Если неделя целиком внутри одного месяца, месяц не дублируется:
 * «18 – 24 августа». При смене месяца пишутся обе части:
 * «29 сентября – 5 октября». Годы добавляются только при переходе
 * года: «30 декабря 2024 – 5 января 2025».
 *
 * @param {Date} weekStart - понедельник недели.
 * @param {Date} weekEnd - воскресенье той же недели.
 * @returns {string} Диапазон дат для заголовка группы.
 */
function formatWeekRange(weekStart, weekEnd) {
  const crossesYear = weekStart.getFullYear() !== weekEnd.getFullYear();
  if (crossesYear) {
    const from = `${formatDayMonth(weekStart)} ${weekStart.getFullYear()}`;
    const to = `${formatDayMonth(weekEnd)} ${weekEnd.getFullYear()}`;
    return `${from}${RANGE_SEPARATOR}${to}`;
  }
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${weekStart.getDate()}${RANGE_SEPARATOR}${formatDayMonth(weekEnd)}`;
  }
  return `${formatDayMonth(weekStart)}${RANGE_SEPARATOR}${formatDayMonth(weekEnd)}`;
}

/**
 * Подпись недели для заголовка группы записей.
 *
 * Неделя считается с понедельника по воскресенье. Для текущей и прошлой
 * недели возвращаются фиксированные подписи; для остальных — диапазон:
 * «18 – 24 августа» внутри месяца, «29 сентября – 5 октября» при смене
 * месяца, с годами при переходе года.
 *
 * @param {Date} date - любая дата внутри подписываемой недели.
 * @param {Date} [now=new Date()] - «текущий момент»; передаётся явно
 *   в тестах, чтобы закрепить вывод относительно контрольного времени.
 * @returns {string} Подпись недели для заголовка группы.
 * @throws {TypeError} Если date не является корректным экземпляром Date.
 */
export function weekLabel(date, now = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('weekLabel: ожидается корректный экземпляр Date');
  }
  const weekStart = startOfWeek(date);
  const currentWeekStart = startOfWeek(now);
  // Math.round страхует от сдвига на час при переходе на летнее время.
  const weeksAgo = Math.round(
    (currentWeekStart - weekStart) / (MS_PER_DAY * DAYS_IN_WEEK)
  );
  if (weeksAgo === 0) {
    return CURRENT_WEEK_LABEL;
  }
  if (weeksAgo === 1) {
    return PREVIOUS_WEEK_LABEL;
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + (DAYS_IN_WEEK - 1));
  return formatWeekRange(weekStart, weekEnd);
}
```

---

## Вывод (что конкретно улучшилось)

Качество логики в обоих вариантах сопоставимое — модель одна и та же, и «без правил» агент написал рабочий код с грамотной русской plural-логикой и DST-страховкой. Разница — в **предсказуемости и соответствии стандартам проекта**. С файлом правил агент: разложил код по принятой структуре (`src/utils/`, `package.json` с нулевыми зависимостями) вместо свалки в корень; убрал все магические числа в именованные константы (`MS_PER_DAY`, `TEENS_MIN`… против inline `604800000` и `6`); задокументировал JSDoc каждую функцию, включая приватные хелперы; выдал ответ в требуемом формате «план → изменённые файлы → команда проверки»; добавил 18 тестов вместо 13 (включая идиоматические диапазоны «18 – 24 августа» и годы при переходе года) и defensively схлопнул невалидный ввод в «нет серии», чтобы битые данные не ломали UI.

Показательный побочный эффект: «без правил» агент при расхождении теста с кодом **поправил ожидания тестов под поведение** («два ожидания исправлены как ошибочные»), а «с правилами» в той же ситуации **исправлял код под зафиксированное требование** — правила сместили приоритет с «сделать зелёным» на «сделать правильно». Для сквозного проекта, где этот файл будут читать на проверке и дорабатывать в ДЗ4–6, именно это снижение энтропии и есть главный выигрыш: следующий запрос агента начинается с чистой структуры, а не с разборов чужих привычек.
