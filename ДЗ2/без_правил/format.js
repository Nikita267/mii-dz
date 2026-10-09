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
