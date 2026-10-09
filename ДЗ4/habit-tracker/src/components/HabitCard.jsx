import { getCurrentStreak } from '../utils/stats.js';
import StreakBadge from './StreakBadge.jsx';
import WeekDots from './WeekDots.jsx';

/*
 * HabitCard — карточка привычки на экране «Сегодня» (макет Концепции 1):
 * emoji-чип, название, бейдж серии, 7 точек недели и круглый чекбокс 44px.
 */

/**
 * Карточка одной привычки на «Сегодня».
 *
 * Слева — emoji-чип на подложке цвета привычки (динамический цвет — единственное
 * разрешённое исключение из запрета inline-стилей), затем название, бейдж серии
 * и точки недели. Справа — круглая кнопка-чекбокс 44px (size-11): при pending
 * она заблокирована и пульсирует, при done — залита шалфеем с белой галочкой.
 *
 * @param {object} props — свойства компонента.
 * @param {{id: string, title: string, emoji: string, color: string,
 *   createdAt: string, archivedAt: null|string}} props.habit — данные привычки.
 * @param {Array<{habitId: string, date: string}>} props.checkIns — отметки привычек.
 * @param {string} props.today — «сегодня» в формате «YYYY-MM-DD».
 * @param {boolean} [props.done=false] — выполнена ли привычка сегодня.
 * @param {boolean} [props.pending=false] — идёт ли сохранение отметки.
 * @param {Function} props.onToggle — обработчик переключения отметки.
 * @returns {JSX.Element} Карточка привычки.
 */
export default function HabitCard({
  habit,
  checkIns,
  today,
  done = false,
  pending = false,
  onToggle,
}) {
  const marks = Array.isArray(checkIns) ? checkIns : [];
  // Серия — из общего контракта утилит (семантика ДЗ2): «жива», пока последняя
  // отметка — сегодня или вчера; отметки «из будущего» серию не продлевают.
  const streakDays = getCurrentStreak(marks, habit.id, today);
  // «Новая» — создана сегодня и ещё ни разу не отмечена: без отметок и без истории.
  const isNew = habit.createdAt === today && !marks.some((c) => c.habitId === habit.id);

  return (
    <article
      className={
        'flex items-center gap-3.5 rounded-3xl border bg-card p-4 shadow-sm transition-colors ' +
        (done ? 'border-sage/50' : 'border-line')
      }
    >
      <div
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
        style={{ backgroundColor: `${habit.color}22` }}
      >
        {habit.emoji}
      </div>

      <div className="min-w-0 flex-1">
        <h3
          className={
            'truncate text-base font-semibold transition-colors ' +
            (done ? 'text-ink-soft' : 'text-ink')
          }
        >
          {habit.title}
        </h3>
        <div className="mt-1.5">
          <StreakBadge days={streakDays} isNew={isNew} />
        </div>
        <div className="mt-2.5">
          <WeekDots checkIns={marks} habitId={habit.id} today={today} />
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={`Отметить: ${habit.title}`}
        className={
          'flex size-11 shrink-0 items-center justify-center self-center rounded-full ' +
          'border-2 text-lg font-bold transition-all ' +
          (done
            ? 'border-sage bg-sage text-white'
            : 'border-line bg-card text-transparent hover:border-sage active:scale-95') +
          (pending ? ' animate-pulse disabled:cursor-not-allowed' : '')
        }
      >
        ✓
      </button>
    </article>
  );
}
