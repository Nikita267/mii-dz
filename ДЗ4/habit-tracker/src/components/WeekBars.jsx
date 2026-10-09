/*
 * WeekBars — столбики текущей недели (пн–вс) экрана «Статистика».
 * Высота столбика — факт, делённый на максимум привычки: отметки бинарные
 * (не больше одной на день), поэтому выполненный день занимает всю высоту,
 * а пропуск показывается минимальной «выключенной» полоской.
 */

/** Порядок и подписи дней недели; индекс 0 — понедельник. */
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** Смещение JS-нумерации дней (вс = 0…сб = 6) к неделе «с понедельника». */
const MONDAY_OFFSET = 6;

/** Максимум факта за день: отметка бинарная, выше одной не бывает. */
const MAX_PER_DAY = 1;

/** Высота «пустого» столбика в процентах: пропуск остаётся видимым. */
const EMPTY_BAR_PERCENT = 10;

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
 * Семь дней недели (пн–вс), к которой относится «сегодня», с отметками привычки.
 *
 * @param {Array<{habitId: string, date: string}>} checkIns — отметки всех привычек.
 * @param {string} habitId — идентификатор привычки.
 * @param {string} today — «сегодня» в формате «YYYY-MM-DD».
 * @returns {Array<{iso: string, done: boolean, isToday: boolean, label: string}>} Дни недели.
 */
function buildWeek(checkIns, habitId, today) {
  const isDone = (iso) => checkIns.some((c) => c.habitId === habitId && c.date === iso);

  const base = isoToUtc(today);
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - (base.getUTCDay() + MONDAY_OFFSET) % 7);

  return WEEKDAYS.map((label, index) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + index);
    const iso = day.toISOString().slice(0, 10);
    return { iso, done: isDone(iso), isToday: iso === today, label };
  });
}

/**
 * Высота столбика в процентах: факт / максимум привычки. Нулевому факту
 * оставляем минимальную высоту — «пустой» день читается как пропуск, а не дыра.
 *
 * @param {boolean} done — есть ли отметка в этот день.
 * @returns {number} Высота столбика, проценты от площади графика.
 */
function barHeightPercent(done) {
  const fact = done ? 1 : 0;
  return Math.round((fact / MAX_PER_DAY) * 100) || EMPTY_BAR_PERCENT;
}

/**
 * Столбчатая диаграмма недели: сегодня — bg-sage, остальные выполненные дни —
 * bg-sage/60, пропуски — bg-bar-off; сегодняшний день дополнительно выделен
 * жирной подписью (цвет столбика не должен «врать» о выполнении).
 *
 * @param {object} props — свойства компонента.
 * @param {Array<{habitId: string, date: string}>} props.checkIns — отметки привычек.
 * @param {string} props.habitId — идентификатор привычки, чью неделю показываем.
 * @param {string} props.today — «сегодня» в формате «YYYY-MM-DD».
 * @returns {JSX.Element} График недели с подписями дней.
 */
export default function WeekBars({ checkIns, habitId, today }) {
  const days = buildWeek(Array.isArray(checkIns) ? checkIns : [], habitId, today);
  const doneCount = days.filter((day) => day.done).length;

  return (
    <div
      role="img"
      aria-label={`Отметки этой недели: выполнено ${doneCount} из 7 дней`}
    >
      <div className="flex h-28 items-end gap-2">
        {days.map((day) => {
          // title дублирует состояние столбика; для скринридеров достаточно
          // сводки на контейнере (role="img" скрывает дочерние элементы).
          const state = day.done ? 'выполнено' : 'не выполнено';
          const todayNote = day.isToday ? ' · сегодня' : '';
          const barColor = day.done
            ? day.isToday
              ? 'bg-sage'
              : 'bg-sage/60'
            : 'bg-bar-off';
          return (
            <div
              key={day.iso}
              title={`${day.label}, ${day.iso} — ${state}${todayNote}`}
              className="flex h-full flex-1 flex-col justify-end"
            >
              <div
                className={'rounded-full ' + barColor}
                style={{ height: `${barHeightPercent(day.done)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {days.map((day) => (
          <span
            key={day.iso}
            className={
              'flex-1 text-center text-xs ' +
              (day.isToday ? 'font-semibold text-ink' : 'text-ink-faint')
            }
          >
            {day.label}
          </span>
        ))}
      </div>
    </div>
  );
}
