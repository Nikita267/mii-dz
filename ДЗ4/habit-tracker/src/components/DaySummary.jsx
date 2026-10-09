/*
 * DaySummary — сводка дня «Выполнено N из M» с тонкой полосой прогресса
 * (макет Концепции 1, блок .day-progress).
 */

/**
 * Сводка прогресса дня: подпись «Выполнено N из M» и полоса выполнения.
 *
 * При отсутствии привычек (total = 0) не выводится вовсе — по FR-21 пустой
 * экран не должен показывать нулевые счётчики.
 *
 * @param {object} props — свойства компонента.
 * @param {number} props.done — количество выполненных сегодня привычек.
 * @param {number} props.total — количество активных привычек.
 * @returns {JSX.Element|null} Блок сводки или null без привычек.
 */
export default function DaySummary({ done, total }) {
  if (total <= 0) {
    return null;
  }
  const percent = Math.round((done / total) * 100);

  return (
    <section aria-label="Прогресс дня" className="px-1 pb-4">
      <p className="text-sm text-ink-soft">
        Выполнено{' '}
        <span className="font-bold text-ink">
          {done} из {total}
        </span>
      </p>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Выполнено привычек сегодня"
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-bar-off"
      >
        {/* Ширина зависит от данных, поэтому единственный допустимый
            динамический inline-стиль — по аналогии с цветом привычки. */}
        <div
          className="h-full rounded-full bg-sage transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}
