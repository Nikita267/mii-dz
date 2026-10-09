import { formatStreak } from '../utils/format.js';

/*
 * StreakBadge — бейдж текущей серии в карточке привычки.
 * Активная серия — шалфейная плашка «🔥 N дней»; нулевая — приглушённая,
 * чтобы «сломанная» серия не выглядела ошибкой (макет: .streak / .streak.broke).
 */

/**
 * Бейдж длины текущей серии привычки.
 *
 * При days > 0 показывает «🔥 N дней» (склонение — formatStreak). При нулевой
 * серии различает два случая: свежесозданная привычка помечается серым бейджем
 * «новая», привычка с оборванной серией — подписью «нет серии».
 *
 * @param {object} props — свойства компонента.
 * @param {number} props.days — длина текущей серии в днях.
 * @param {boolean} [props.isNew=false] — привычка создана сегодня и ещё без отметок.
 * @returns {JSX.Element} Плашка-бейдж серии.
 */
export default function StreakBadge({ days, isNew = false }) {
  if (days > 0) {
    return (
      <span
        title="Текущая серия"
        className={
          'inline-flex items-center whitespace-nowrap rounded-full bg-sage-mist ' +
          'px-2.5 py-0.5 text-xs font-bold text-sage-deep'
        }
      >
        🔥 {formatStreak(days)}
      </span>
    );
  }

  return (
    <span
      title={isNew ? 'Привычка пока без отметок' : 'Серия оборвалась или ещё не начата'}
      className={
        'inline-flex items-center whitespace-nowrap rounded-full bg-bar-off ' +
        'px-2.5 py-0.5 text-xs font-semibold text-ink-soft'
      }
    >
      {isNew ? 'новая' : formatStreak(days)}
    </span>
  );
}
