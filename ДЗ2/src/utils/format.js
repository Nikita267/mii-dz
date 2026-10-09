// Утилиты форматирования человекочитаемых подписей для «Трекера привычек».
// Чистые функции без побочных эффектов: одинаково работают в Node и браузере.

/** Русские названия месяцев в родительном падеже: «5 октября», «29 сентября». */
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
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
