/*
 * WeekDots — 7 точек текущей недели (пн–вс) для карточки привычки.
 * Стиль по макету Концепции 1: выполнено — шалфейная точка, пропуск — «выключенная».
 */

/** Число дней в неделе; массив заодно задаёт порядок точек с понедельника. */
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Смещение JS-нумерации дней (вс = 0…сб = 6) к неделе «с понедельника». */
const MONDAY_OFFSET = 6;

/**
 * Разбирает дату-строку «YYYY-MM-DD» в UTC-полночь.
 * Работа через UTC исключает сдвиги локальной таймзоны при арифметике дней.
 *
 * @param {string} iso — дата в формате «YYYY-MM-DD».
 * @returns {Date} Полночь указанного дня по UTC.
 */
function isoToUtc(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

/**
 * Форматирует UTC-дату обратно в строку «YYYY-MM-DD».
 *
 * @param {Date} date — дата (ожидается UTC-полночь).
 * @returns {string} Дата в формате «YYYY-MM-DD».
 */
function utcToIso(date) {
  return date.toISOString().slice(0, 10);
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
  // Простой inline-поиск вместо импорта findCheckIn: объём мал, контракт тот же.
  const isDone = (iso) => checkIns.some((c) => c.habitId === habitId && c.date === iso);

  const base = isoToUtc(today);
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - (base.getUTCDay() + MONDAY_OFFSET) % 7);

  return WEEKDAYS.map((label, index) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + index);
    const iso = utcToIso(day);
    return { iso, done: isDone(iso), isToday: iso === today, label };
  });
}

/**
 * Строка из 7 точек недели: выполненные дни — bg-sage, пропуски — bg-bar-off,
 * сегодняшний день выделен тонким кольцом ring-sage-deep (по макету).
 *
 * @param {object} props — свойства компонента.
 * @param {Array<{habitId: string, date: string}>} props.checkIns — отметки привычек.
 * @param {string} props.habitId — идентификатор привычки, чью неделю показываем.
 * @param {string} props.today — «сегодня» в формате «YYYY-MM-DD».
 * @returns {JSX.Element} Контейнер с семью точками.
 */
export default function WeekDots({ checkIns, habitId, today }) {
  const days = buildWeek(Array.isArray(checkIns) ? checkIns : [], habitId, today);
  const doneCount = days.filter((day) => day.done).length;

  return (
    <div
      role="img"
      aria-label={`Отметки этой недели: выполнено ${doneCount} из 7 дней`}
      className="flex gap-1.5"
    >
      {days.map((day) => {
        // title дублирует состояние точки для наведения курсором; для скринридеров
        // достаточно сводки на контейнере (role="img" скрывает дочерние элементы).
        const state = day.done ? 'выполнено' : 'не выполнено';
        const todayNote = day.isToday ? ' · сегодня' : '';
        return (
          <span
            key={day.iso}
            title={`${day.label} — ${state}${todayNote}`}
            className={
              'size-2 rounded-full ' +
              (day.done ? 'bg-sage ' : 'bg-bar-off ') +
              (day.isToday ? 'ring-1 ring-sage-deep' : '')
            }
          />
        );
      })}
    </div>
  );
}
