// Модуль статистики «Трекера привычек»: серии, процент выполнения, недельные корзины.
// Перенесён из ДЗ2 (статистика/stats.js) как ES-модуль приложения: те же контракты
// и сообщения об ошибках, но export function вместо module.exports/window.
//
// Инварианты модуля (из контракта ДЗ2, сохранены):
//  - только чистые функции: аргументы не мутируются, I/O нет, системные часы не читаются —
//    «сегодня» всегда инъекцируется параметром today;
//  - все даты — календарные строки 'YYYY-MM-DD'; арифметика ведётся в UTC по номерам
//    дней от эпохи, поэтому DST и локальный сдвиг таймзоны не меняют календарный день;
//  - невалидная дата — TypeError (fail fast), а не тихий NaN;
//  - входные массивы могут быть не отсортированы и содержать дубли (habitId, date) —
//    нормализуются внутри (уникальные даты + сортировка).

/**
 * @typedef {string} ISODate - валидная дата 'YYYY-MM-DD'
 */

/**
 * @typedef {Object} Habit
 * @property {string}      id        - уникальный идентификатор, напр. 'habit-water'
 * @property {string}      title     - название для UI
 * @property {string}      emoji     - иконка из утверждённого набора, напр. '💧'
 * @property {string}      color     - ключ цвета карточки из токенов Tailwind
 * @property {string}      createdAt - дата создания 'YYYY-MM-DD'; дни до неё НЕ входят
 *                                     в знаменатель процента выполнения
 * @property {string|null} archivedAt - дата архивирования 'YYYY-MM-DD' или null;
 *                                     статистику не фильтрует (архивные привычки
 *                                     отсекаются на уровне выборки данных)
 */

/**
 * @typedef {Object} CheckIn - атомарная отметка «привычка выполнена в дату»
 * @property {string} habitId - ссылка на Habit.id
 * @property {string} date    - 'YYYY-MM-DD'
 */

/**
 * @typedef {Object} Period - замкнутый диапазон дат (границы включаются)
 * @property {ISODate} from
 * @property {ISODate} to
 */

/** @typedef {'mon'|'sun'} WeekStart - какой день считается первым в неделе */

/**
 * @typedef {Object} WeekBucket
 * @property {ISODate}   weekStart - первый день недели (зависит от weekStartsOn)
 * @property {ISODate}   weekEnd   - последний день той же недели
 * @property {ISODate[]} dates     - уникальные даты отметок недели, по возрастанию
 * @property {number}    count     - dates.length, 1..7
 */

const MS_PER_DAY = 86400000; // сутки в мс; разности UTC-полуночей всегда ему кратны
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Внутренние помощники (не экспортируются) ───────────────────────────────────

/**
 * Человекочитаемое описание значения для сообщения TypeError.
 * @param {unknown} value
 * @returns {string}
 */
function describeValue(value) {
  try {
    return `${typeof value}: ${String(value)}`;
  } catch {
    return typeof value; // объект, чей toString() бросает исключение
  }
}

/**
 * Строгий парсер 'YYYY-MM-DD' -> Date на UTC-полуночи.
 * Отбрасывает '05.10.2026', '2026-10-5' и несуществующие даты ('2027-02-29'):
 * Date.UTC «прокатывает» календарь (13-й месяц -> следующий год), поэтому
 * валидность проверяется сравнением компонентов после конструирования.
 * @param {unknown} value
 * @param {string}  what - имя параметра для сообщения об ошибке
 * @returns {Date}
 * @throws {TypeError} если значение не строка 'YYYY-MM-DD' или дата не существует
 */
function parseISODate(value, what) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw new TypeError(
      `stats: ${what}: ожидается дата 'YYYY-MM-DD', получено ${describeValue(value)}`
    );
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError(`stats: ${what}: несуществующая календарная дата: ${value}`);
  }
  return date;
}

/**
 * Номер календарного дня (целое): '2026-10-07' -> 20659.
 * @param {unknown} value
 * @param {string}  what
 * @returns {number}
 */
function dayIndexOf(value, what) {
  // Math.round страхует от суток в 23/25 часов, хотя UTC-полночь даёт точное кратное
  return Math.round(parseISODate(value, what).getTime() / MS_PER_DAY);
}

/**
 * Номер дня «сегодня». Принимает ISODate-строку или Date.
 * Для Date календарный день берётся UTC-методами: new Date('YYYY-MM-DD') — это
 * UTC-полночь, и локальный сдвиг таймзоны не должен менять день (кейс 9 контракта).
 * @param {ISODate|Date|undefined} today
 * @param {string}                 what
 * @returns {number}
 */
function todayIndexOf(today, what) {
  const value = today === undefined ? new Date() : today;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError(`stats: ${what}: невалидный объект Date`);
    }
    return Math.round(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / MS_PER_DAY
    );
  }
  return dayIndexOf(value, what);
}

/**
 * Обратное преобразование: номер дня -> 'YYYY-MM-DD'.
 * @param {number} dayIndex
 * @returns {ISODate}
 */
function isoOfDay(dayIndex) {
  return new Date(dayIndex * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * День недели номера дня по UTC: 0 = воскресенье .. 6 = суббота.
 * @param {number} dayIndex
 * @returns {number}
 */
function weekdayOf(dayIndex) {
  return new Date(dayIndex * MS_PER_DAY).getUTCDay();
}

/**
 * Проверка habitId: только строка (кейс «нестроковый habitId -> TypeError»).
 * @param {unknown} habitId
 * @param {string}  what
 * @throws {TypeError}
 */
function assertHabitId(habitId, what) {
  if (typeof habitId !== 'string') {
    throw new TypeError(`stats: ${what}: ожидается строка, получено ${describeValue(habitId)}`);
  }
}

/**
 * Нормализация массива отметок: null/undefined -> [] (кейс 1: результат-«ноль»,
 * а не исключение); не-массив -> TypeError (fail fast).
 * @param {CheckIn[]|null|undefined} checkIns
 * @param {string}                   fnName
 * @returns {CheckIn[]}
 */
function toCheckInArray(checkIns, fnName) {
  if (checkIns === null || checkIns === undefined) return [];
  if (!Array.isArray(checkIns)) {
    throw new TypeError(
      `stats: ${fnName}: checkIns: ожидается массив, null или undefined, ` +
        `получено ${describeValue(checkIns)}`
    );
  }
  return checkIns;
}

/**
 * Нормализация отметок одной привычки: уникальные даты по возрастанию (номера дней).
 * Дубли (habitId, date) схлопываются — семантика Set; порядок входа не важен.
 * Чужие привычки фильтруются ДО валидации дат и на результат не влияют (кейс 4).
 * @param {CheckIn[]} checkIns
 * @param {string}    habitId
 * @returns {number[]}
 */
function habitDayIndices(checkIns, habitId) {
  const seen = new Set();
  const days = [];
  for (const entry of checkIns) {
    if (!entry || entry.habitId !== habitId) continue;
    const day = dayIndexOf(entry.date, 'checkIns[].date');
    if (!seen.has(day)) {
      seen.add(day);
      days.push(day);
    }
  }
  days.sort((a, b) => a - b);
  return days;
}

// ─── Экспортируемые функции ─────────────────────────────────────────────────────

/**
 * Длина текущей серии подряд идущих дней с отметками, считая от today назад.
 * Серия «жива», только если последняя отметка — today или yesterday; иначе 0.
 * Отметки «из будущего» (позже today) игнорируются и серию не продлевают.
 *
 * @param {CheckIn[]}     checkIns - все отметки (порядок произвольный, дубли допустимы)
 * @param {string}        habitId  - идентификатор привычки
 * @param {ISODate|Date} [today]   - «сегодня»; по умолчанию новая Date()
 * @returns {number} целое >= 0
 * @throws {TypeError} при невалидной дате или нестроковом habitId
 */
export function getCurrentStreak(checkIns, habitId, today) {
  assertHabitId(habitId, 'getCurrentStreak: habitId');
  const todayDay = todayIndexOf(today, 'getCurrentStreak: today');
  const days = habitDayIndices(
    toCheckInArray(checkIns, 'getCurrentStreak'),
    habitId
  ).filter((day) => day <= todayDay);
  if (days.length === 0) return 0;

  const last = days[days.length - 1];
  if (todayDay - last > 1) return 0; // пропуск >= 2 дней — серия мертва (кейс 11)

  let streak = 1;
  for (let i = days.length - 1; i > 0; i -= 1) {
    // Сравнение полных дат в номерах дней, а не getDate(): границы месяца/года
    // (30 -> 1 и 12-31 -> 01-01) дают разность ровно 1 (кейс 7, баг ДЗ1 v1)
    if (days[i] - days[i - 1] !== 1) break;
    streak += 1;
  }
  return streak;
}

/**
 * Максимальная серия за всю историю наблюдений (независимо от today):
 * оборвавшаяся текущая серия всё равно остаётся кандидатом в лучшую (кейс 11).
 *
 * @param {CheckIn[]} checkIns
 * @param {string}    habitId
 * @returns {{ length: number, start: ISODate, end: ISODate }|null}
 *   length - целое >= 1; start/end - календарные границы серии;
 *   null - если у привычки нет ни одной отметки. При равной длине серий
 *   возвращается более ранняя (детерминизм, кейс 21).
 * @throws {TypeError} при невалидной дате отметки или нестроковом habitId
 */
export function getBestStreak(checkIns, habitId) {
  assertHabitId(habitId, 'getBestStreak: habitId');
  const days = habitDayIndices(toCheckInArray(checkIns, 'getBestStreak'), habitId);
  if (days.length === 0) return null; // кейс 5: ни одной отметки — не ошибка

  let best = { length: 1, start: days[0], end: days[0] };
  let runStart = 0;
  for (let i = 1; i <= days.length; i += 1) {
    const runBroken = i === days.length || days[i] - days[i - 1] !== 1;
    if (!runBroken) continue;
    const length = i - runStart;
    // строго '>' — при равенстве побеждает более ранняя серия
    if (length > best.length) best = { length, start: days[runStart], end: days[i - 1] };
    runStart = i;
  }
  return { length: best.length, start: isoOfDay(best.start), end: isoOfDay(best.end) };
}

/**
 * Доля «обязательных» дней периода, покрытых отметками.
 *
 * Числитель (done): число уникальных дат отметок внутри эффективного окна
 * [max(period.from, habit.createdAt) .. min(period.to, today)].
 * Знаменатель (expected): календарные дни того же окна (диапазон замкнут,
 * границы включаются — кейс 16). Окно общее, поэтому percent не превышает 100,
 * а отметки «из будущего» и до создания привычки в числитель не попадают.
 *
 * @param {CheckIn[]}     checkIns
 * @param {Habit}         habit
 * @param {Period}        period
 * @param {ISODate|Date} [today]
 * @returns {{ percent: number, done: number, expected: number }}
 *   percent - 0..100 с округлением до 1 знака; при expected = 0 -> percent = 0
 *   (не NaN и не Infinity — кейсы 13-15).
 * @throws {TypeError} при невалидных habit / period / today или дате отметки
 */
export function getCompletionRate(checkIns, habit, period, today) {
  if (!habit || typeof habit !== 'object') {
    throw new TypeError(
      `stats: getCompletionRate: habit: ожидается объект Habit, получено ${describeValue(habit)}`
    );
  }
  assertHabitId(habit.id, 'getCompletionRate: habit.id');
  if (!period || typeof period !== 'object') {
    throw new TypeError('stats: getCompletionRate: period: ожидается объект Period { from, to }');
  }
  const createdDay = dayIndexOf(habit.createdAt, 'getCompletionRate: habit.createdAt');
  const periodFrom = dayIndexOf(period.from, 'getCompletionRate: period.from');
  const periodTo = dayIndexOf(period.to, 'getCompletionRate: period.to');
  const todayDay = todayIndexOf(today, 'getCompletionRate: today');

  // Эффективное окно: до createdAt дни не обязательны (кейс 14), после today —
  // ещё не наступили и обрезаются (кейс 15)
  const from = Math.max(periodFrom, createdDay);
  const to = Math.min(periodTo, todayDay);
  const expected = to >= from ? to - from + 1 : 0; // пустое окно -> 0, не NaN (кейс 13)

  const days = habitDayIndices(
    toCheckInArray(checkIns, 'getCompletionRate'),
    habit.id
  ).filter((day) => day >= from && day <= to);
  const done = days.length;
  const percent = expected === 0 ? 0 : Math.round((done / expected) * 1000) / 10;

  return { percent, done, expected };
}

/**
 * Разбиение отметок привычки на календарные недели.
 *
 * Ключ недели — дата weekStart (первый день недели), а не номер недели ISO:
 * снимает споры о нумерации и первом дне года. Неделя, пересекающая границу
 * месяца или года, — одна корзина (кейс 17). Пустые недели корзин не образуют —
 * в выдаче только недели с отметками (кейс 19). У частичных первой/последней
 * недель подписи weekStart..weekEnd — полные 7-дневные границы, а dates и count
 * учитывают только даты внутри period (кейс 18).
 *
 * @param {CheckIn[]}  checkIns
 * @param {string}     habitId
 * @param {Object}    [options]
 * @param {WeekStart} [options.weekStartsOn='mon'] - первый день недели
 * @param {Period}    [options.period]             - обрезка диапазона (замкнут)
 * @returns {WeekBucket[]} - по возрастанию weekStart; [] при отсутствии отметок
 * @throws {TypeError} при невалидных options / options.period / дате отметки
 *                     или нестроковом habitId
 */
export function groupByWeeks(checkIns, habitId, options) {
  assertHabitId(habitId, 'groupByWeeks: habitId');

  let weekStartsOn = 'mon';
  let clipFrom = -Infinity;
  let clipTo = Infinity;
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') {
      throw new TypeError(
        `stats: groupByWeeks: options: ожидается объект, получено ${describeValue(options)}`
      );
    }
    if (options.weekStartsOn !== undefined) {
      if (options.weekStartsOn !== 'mon' && options.weekStartsOn !== 'sun') {
        throw new TypeError(
          "stats: groupByWeeks: options.weekStartsOn: ожидается 'mon' или 'sun', " +
            `получено ${describeValue(options.weekStartsOn)}`
        );
      }
      weekStartsOn = options.weekStartsOn;
    }
    if (options.period !== undefined && options.period !== null) {
      const clip = options.period;
      if (!clip || typeof clip !== 'object') {
        throw new TypeError(
          'stats: groupByWeeks: options.period: ожидается объект Period { from, to }'
        );
      }
      clipFrom = dayIndexOf(clip.from, 'groupByWeeks: options.period.from');
      clipTo = dayIndexOf(clip.to, 'groupByWeeks: options.period.to');
      if (clipFrom > clipTo) return []; // кейс 15: from > to — пустой результат
    }
  }

  const days = habitDayIndices(
    toCheckInArray(checkIns, 'groupByWeeks'),
    habitId
  ).filter((day) => day >= clipFrom && day <= clipTo);

  const buckets = [];
  let i = 0;
  while (i < days.length) {
    // Сдвиг назад до начала недели: 'mon' -> пн..вс, 'sun' -> вс..сб (кейс 18)
    const weekday = weekdayOf(days[i]);
    const shift = weekStartsOn === 'mon' ? (weekday + 6) % 7 : weekday;
    const weekStart = days[i] - shift;
    const weekEnd = weekStart + 6;

    const weekDays = [];
    while (i < days.length && days[i] >= weekStart && days[i] <= weekEnd) {
      weekDays.push(days[i]);
      i += 1;
    }
    buckets.push({
      weekStart: isoOfDay(weekStart),
      weekEnd: isoOfDay(weekEnd),
      dates: weekDays.map((day) => isoOfDay(day)),
      count: weekDays.length,
    });
  }
  return buckets;
}
