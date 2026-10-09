import { useState } from 'react';
import useHabitsData from '../hooks/useHabitsData.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import StatsCalendar from '../components/StatsCalendar.jsx';
import WeekBars from '../components/WeekBars.jsx';
import { getBestStreak, getCurrentStreak } from '../utils/stats.js';

/*
 * Экран «Статистика»: лента чипов-переключателей привычек, две крупные
 * засечковые цифры серий, столбики недели и календарь месяца.
 * Данные — общий хук useHabitsData; состояния loading / error / empty / success
 * разведены (правило 5 CLAUDE.md: у асинхронной операции виден каждый статус).
 */

/** Подписи крупных показателей выбранной привычки. */
const CURRENT_STREAK_CAPTION = 'текущая серия';
const BEST_STREAK_CAPTION = 'рекорд';

/** Тексты пустого состояния: отметок ещё нет, статистике не из чего собираться. */
const EMPTY_TITLE = 'Статистики пока нет';
const EMPTY_HINT = 'Отметьте привычку — здесь появится статистика';

/**
 * Скелетон экрана на время первой загрузки: повторяет раскладку контента
 * (заголовок, чипы, две карточки цифр, неделя, календарь), чтобы после
 * загрузки не было «прыжка» макета.
 *
 * @returns {JSX.Element} Секция с пульсирующими заглушками.
 */
function StatsSkeleton() {
  return (
    <div className="mt-4" aria-hidden="true">
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 w-28 shrink-0 animate-pulse rounded-full bg-line" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="h-24 animate-pulse rounded-2xl bg-line" />
        <div className="h-24 animate-pulse rounded-2xl bg-line" />
      </div>
      <div className="mt-4 h-44 animate-pulse rounded-2xl bg-line" />
      <div className="mt-4 h-72 animate-pulse rounded-2xl bg-line" />
    </div>
  );
}

/**
 * Экран «Статистика» вкладки нижней навигации.
 *
 * @returns {JSX.Element} Секция статистики: чипы привычек, серии, неделя, календарь.
 */
export default function StatsScreen() {
  const { habits, checkIns, loading, error, reload, localToday } = useHabitsData();
  const [selectedId, setSelectedId] = useState(null);

  // Выбранная привычка: явный выбор пользователя или первая активная.
  // Fallback на habits[0] устойчив к исчезновению выбранной привычки
  // после перезагрузки данных (архивация из другого экрана).
  const selectedHabit = habits.find((habit) => habit.id === selectedId) ?? habits[0] ?? null;

  // Заголовок остаётся на экране во всех состояниях — вкладка не «пустеет».
  const heading = (
    <h1 className="font-display text-2xl font-semibold">Статистика</h1>
  );

  if (loading) {
    return (
      <section aria-label="Статистика" aria-busy="true">
        {heading}
        <StatsSkeleton />
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Статистика">
        {heading}
        <div className="mt-4">
          <ErrorBanner message={error} onRetry={reload} />
        </div>
      </section>
    );
  }

  // Нет ни отметок, ни привычек — показывать нечего (статистика нулевая
  // не информативнее пустого состояния, поэтому единая ветка).
  if (!selectedHabit || checkIns.length === 0) {
    return (
      <section aria-label="Статистика">
        {heading}
        <div className="mt-4">
          <EmptyState title={EMPTY_TITLE} hint={EMPTY_HINT} />
        </div>
      </section>
    );
  }

  const currentStreak = getCurrentStreak(checkIns, selectedHabit.id, localToday);
  const bestStreak = getBestStreak(checkIns, selectedHabit.id);

  return (
    <section aria-label="Статистика">
      {heading}

      <div role="group" aria-label="Выбор привычки" className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {habits.map((habit) => {
          const isActive = habit.id === selectedHabit.id;
          return (
            <button
              key={habit.id}
              type="button"
              onClick={() => setSelectedId(habit.id)}
              aria-pressed={isActive}
              className={
                'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm ' +
                'transition-colors ' +
                (isActive
                  ? 'border-sage bg-sage-mist font-semibold text-ink'
                  : 'border-line bg-card text-ink-soft hover:border-sage/60 hover:text-ink')
              }
            >
              <span aria-hidden="true">{habit.emoji}</span> {habit.title}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <figure className="rounded-2xl border border-line bg-card px-5 py-4">
          <p className="font-display text-4xl text-ink">{currentStreak}</p>
          <figcaption className="mt-1 text-xs text-ink-faint">{CURRENT_STREAK_CAPTION}</figcaption>
        </figure>
        <figure className="rounded-2xl border border-line bg-card px-5 py-4">
          <p className="font-display text-4xl text-ink">{bestStreak ? bestStreak.length : 0}</p>
          <figcaption className="mt-1 text-xs text-ink-faint">{BEST_STREAK_CAPTION}</figcaption>
        </figure>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-card px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Эта неделя</h2>
        <div className="mt-3">
          <WeekBars checkIns={checkIns} habitId={selectedHabit.id} today={localToday} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-card px-5 py-4">
        <StatsCalendar
          habits={habits}
          checkIns={checkIns}
          selectedHabit={selectedHabit}
          today={localToday}
        />
      </div>
    </section>
  );
}
