import { getCompletionRate } from '../utils/stats.js';

/*
 * StatsCalendar — календарь текущего месяца экрана «Статистика».
 * Точка дня кодирует покрытие всех привычек: полная — день закрыт полностью,
 * полупрозрачная — частично, «выключенная» — отметок нет; сегодняшний день
 * отмечен тонким кольцом. Под сеткой — процент выполнения выбранной привычки
 * за месяц (getCompletionRate обрезает окно до createdAt и «сегодня»).
 */

/** Подписи дней недели-заголовка; индекс 0 — понедельник. */
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** Названия месяцев в именительном падеже — для заголовка календаря. */
const MONTHS_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

/** Смещение JS-нумерации дней (вс = 0…сб = 6) к неделе «с понедельника». */
const MONDAY_OFFSET = 6;

/** Число колонок календаря — семь дней недели. */
const DAYS_IN_WEEK = 7;

/**
 * Разбирает дату-строку «YYYY-MM-DD» в UTC-полночь.
 * Арифметика через UTC исключает сдвиги таймзоны и летнего времени.
 *
 * @param {string} iso — дата в формате «YYYY-MM-DD».
 * @returns {Date} Полночь указанного дня по UTC.
 */
function isoToUtc(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

/**
 * Строит сетку текущего месяца: заголовок, ячейки-дни и дата первого числа.
 *
 * @param {string} today — «сегодня» в формате «YYYY-MM-DD».
 * @returns {{title: string, cells: Array<string|null>, monthStartIso: string}}
 *   cells — даты месяца по возрастанию; null в начале выравнивает первое
 *   число на колонку его дня недели (неделя с понедельника).
 */
function buildMonth(today) {
  const base = isoToUtc(today);
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const leadBlanks = (firstDay.getUTCDay() + MONDAY_OFFSET) % DAYS_IN_WEEK;
  // «Нулевой» день следующего месяца — последний день текущего: без таблиц длин.
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < leadBlanks; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10));
  }
  return {
    title: `${MONTHS_NOMINATIVE[month]} ${year}`,
    cells,
    monthStartIso: firstDay.toISOString().slice(0, 10),
  };
}

/**
 * Считает покрытие дня: сколько привычек существовали к этой дате и сколько
 * из них отмечены. Сравнение строк 'YYYY-MM-DD' лексикографически совпадает
 * с хронологией, поэтому привычки, созданные позже дня, в знаменатель не входят.
 *
 * @param {Array<{id: string, createdAt: string}>} habits — активные привычки.
 * @param {Array<{habitId: string, date: string}>} checkIns — отметки всех привычек.
 * @param {string} iso — дата дня в формате «YYYY-MM-DD».
 * @returns {{expected: number, done: number}} Число актуальных и выполненных привычек.
 */
function dayCompletion(habits, checkIns, iso) {
  const expected = habits.filter((habit) => habit.createdAt <= iso).length;
  const done = habits.filter(
    (habit) =>
      habit.createdAt <= iso &&
      checkIns.some((checkIn) => checkIn.habitId === habit.id && checkIn.date === iso)
  ).length;
  return { expected, done };
}

/**
 * Класс точки дня по покрытию: все привычки — шалфей, часть — полупрозрачный
 * шалфей, ничего — «выключенная» точка.
 *
 * @param {number} expected — число актуальных в этот день привычек.
 * @param {number} done — число выполненных из них.
 * @returns {string} Tailwind-класс цвета точки.
 */
function dotClass(expected, done) {
  if (expected > 0 && done === expected) return 'bg-sage';
  if (done > 0) return 'bg-sage/50';
  return 'bg-bar-off';
}

/**
 * Человекочитаемое состояние дня для всплывающей подсказки.
 *
 * @param {number} expected — число актуальных в этот день привычек.
 * @param {number} done — число выполненных из них.
 * @returns {string} Описание покрытия дня.
 */
function completionText(expected, done) {
  if (expected > 0 && done === expected) return 'все привычки выполнены';
  if (done > 0) return `выполнено ${done} из ${expected} привычек`;
  return 'отметок нет';
}

/**
 * Календарь месяца с точками выполнения и процентом за месяц.
 *
 * @param {object} props — свойства компонента.
 * @param {Array<{id: string, createdAt: string}>} props.habits — активные привычки
 *   (знаменатель покрытия дня).
 * @param {Array<{habitId: string, date: string}>} props.checkIns — отметки всех привычек.
 * @param {{id: string, createdAt: string}} props.selectedHabit — привычка, чей процент
 *   выполнения за месяц показывается под сеткой.
 * @param {string} props.today — «сегодня» в формате «YYYY-MM-DD».
 * @returns {JSX.Element|null} Сетка календаря с подписью процента.
 */
export default function StatsCalendar({ habits, checkIns, selectedHabit, today }) {
  // Без выбранной привычки процент не посчитать — экран не должен рендерить нас.
  if (!selectedHabit) {
    return null;
  }

  const safeHabits = Array.isArray(habits) ? habits : [];
  const safeCheckIns = Array.isArray(checkIns) ? checkIns : [];
  const { title, cells, monthStartIso } = buildMonth(today);
  const { percent } = getCompletionRate(
    safeCheckIns,
    selectedHabit,
    { from: monthStartIso, to: today },
    today
  );

  return (
    <section aria-label={`Календарь месяца: ${title}`}>
      <h2 className="font-display text-lg text-ink">{title}</h2>

      <div className="mt-3 grid grid-cols-7 gap-y-2">
        {WEEKDAYS.map((label) => (
          <span key={label} className="text-center text-xs text-ink-faint">
            {label}
          </span>
        ))}
        {cells.map((iso, index) => {
          if (iso === null) {
            return <span key={`blank-${index}`} aria-hidden="true" />;
          }
          const { expected, done } = dayCompletion(safeHabits, safeCheckIns, iso);
          const isToday = iso === today;
          const todayNote = isToday ? ' · сегодня' : '';
          return (
            <span
              key={iso}
              title={`${iso} — ${completionText(expected, done)}${todayNote}`}
              className="flex flex-col items-center gap-1"
            >
              <span
                className={
                  'text-xs ' + (isToday ? 'font-semibold text-ink' : 'text-ink-soft')
                }
              >
                {Number(iso.slice(8, 10))}
              </span>
              <span
                className={
                  'size-2 rounded-full ' +
                  dotClass(expected, done) +
                  (isToday ? ' ring-1 ring-sage-deep' : '')
                }
              />
            </span>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        Процент выполнения за месяц:{' '}
        <span className="font-semibold text-ink">{percent}%</span>
      </p>
    </section>
  );
}
