import { useEffect, useRef, useState } from 'react';
import DaySummary from '../components/DaySummary.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import HabitCard from '../components/HabitCard.jsx';
import HabitDialog from '../components/HabitDialog.jsx';
import { createHabit } from '../data/api.js';
import useHabitsData from '../hooks/useHabitsData.js';
import { formatDayMonth } from '../utils/format.js';

/*
 * Экран «Сегодня» (Концепция 1 «Спокойный минимализм»): дата и сводка дня,
 * список карточек привычек с оптимистичными отметками, FAB «+» над таб-баром
 * и диалог создания привычки. Обязательные состояния loading / error / success
 * — по правилу 5 CLAUDE.md: скелетоны, баннер с повтором, подсветка карточки.
 */

/** Скелетон-карточек на время первой загрузки. */
const SKELETON_COUNT = 3;
/** Длительность микро-фидбека «успех» — подсветки отмеченной карточки. */
const FLASH_MS = 1200;
const CREATE_ERROR_MESSAGE = 'Не удалось сохранить привычку. Попробуйте ещё раз.';
const EMPTY_TITLE = 'Пока нет ни одной привычки';
const EMPTY_HINT = 'Создайте первую — и отмечайте её выполнение в один тап каждый день.';
const EMPTY_ACTION = 'Добавить привычку';

/**
 * Скелетон карточки привычки: повторяет сетку HabitCard (чип, строки текста,
 * круглая кнопка), чтобы замена заглушки на данные не меняла раскладку.
 *
 * @returns {JSX.Element} Заглушка карточки с пульсацией.
 */
function SkeletonCard() {
  return (
    <div className="flex items-center gap-3.5 rounded-3xl border border-line bg-card p-4 shadow-sm">
      <div className="size-12 shrink-0 animate-pulse rounded-2xl bg-sage-mist" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-2/5 animate-pulse rounded-full bg-sage-mist" />
        <div className="h-3 w-1/4 animate-pulse rounded-full bg-sage-mist/80" />
        <div className="h-2.5 w-3/5 animate-pulse rounded-full bg-sage-mist/60" />
      </div>
      <div className="size-11 shrink-0 animate-pulse rounded-full bg-sage-mist" />
    </div>
  );
}

/**
 * Главный экран приложения — «Сегодня».
 *
 * Шапка: заголовок и дата (formatDayMonth), ниже — сводка дня и список
 * карточек привычек. Пустой список — CTA на создание первой привычки;
 * ошибка — баннер с повтором; первая загрузка — три скелетона. FAB «+»
 * открывает диалог создания: после успешного сохранения список обновляется
 * тихой перезагрузкой. Успешная отметка подсвечивает карточку шалфейной
 * подложкой (bg-sage-mist) на короткое время.
 *
 * @returns {JSX.Element} Экран «Сегодня».
 */
export default function TodayScreen() {
  const { habits, checkIns, loading, error, reload, toggle, pendingId, localToday } =
    useHabitsData();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState(null);
  /** id привычки, подсвеченной после успешной отметки. */
  const [flashId, setFlashId] = useState(null);
  const flashTimerRef = useRef(null);
  // Дата шапки фиксируется на монтировании — вместе с localToday хука.
  const [todayDate] = useState(() => new Date());

  // Снятие таймера подсветки при размонтировании — без утечки.
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  /**
   * Переключение отметки: null (ошибка) и false (снятие) не подсвечиваются —
   * микро-фидбек «успех» уместен только для фактической отметки.
   *
   * @param {string} habitId идентификатор привычки.
   * @returns {void}
   */
  const handleToggle = async (habitId) => {
    const done = await toggle(habitId);
    if (done !== true) {
      return;
    }
    setFlashId(habitId);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashId(null), FLASH_MS);
  };

  /** Открывает диалог создания, сбрасывая ошибку прошлой попытки. */
  const openDialog = () => {
    setDialogError(null);
    setDialogOpen(true);
  };

  /** Закрывает диалог; на время сохранения закрытие заблокировано. */
  const closeDialog = () => {
    if (saving) {
      return;
    }
    setDialogOpen(false);
    setDialogError(null);
  };

  /**
   * Создание привычки из диалога: success — закрытие и тихое обновление
   * списка, error — сообщение в форме, диалог остаётся открытым.
   *
   * @param {{title: string, emoji: string, color: string}} payload данные формы.
   * @returns {void}
   */
  const handleCreate = async (payload) => {
    setSaving(true);
    setDialogError(null);
    try {
      await createHabit(payload);
      setDialogOpen(false);
      reload();
    } catch (createError) {
      console.error('TodayScreen: привычка не создана', createError);
      setDialogError(CREATE_ERROR_MESSAGE);
    } finally {
      setSaving(false);
    }
  };

  const isFirstLoad = loading && habits.length === 0;
  // Отметки за сегодня считаем только по активным привычкам: у архивированных
  // отметки в истории остаются, но в сводку дня попадать не должны.
  const activeIds = new Set(habits.map((habit) => habit.id));
  const doneCount = checkIns.filter(
    (checkIn) => checkIn.date === localToday && activeIds.has(checkIn.habitId)
  ).length;
  const showEmptyState = !isFirstLoad && habits.length === 0 && !error;

  return (
    <section aria-label="Сегодня" aria-busy={loading}>
      <header className="px-1">
        <h1 className="font-display text-2xl font-semibold">Сегодня</h1>
        <p className="mt-1 text-sm text-ink-soft">{formatDayMonth(todayDate)}</p>
      </header>

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} onRetry={reload} />
        </div>
      )}

      {isFirstLoad ? (
        <>
          <p className="sr-only">Загружаем привычки…</p>
          <div className="mt-4 space-y-3" aria-hidden="true">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        </>
      ) : showEmptyState ? (
        <div className="mt-6">
          <EmptyState
            title={EMPTY_TITLE}
            hint={EMPTY_HINT}
            actionLabel={EMPTY_ACTION}
            onAction={openDialog}
          />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <DaySummary done={doneCount} total={habits.length} />
          </div>
          <ul className="space-y-3">
            {habits.map((habit) => {
              const done = checkIns.some(
                (checkIn) => checkIn.habitId === habit.id && checkIn.date === localToday
              );
              const isFlashing = flashId === habit.id;
              return (
                <li
                  key={habit.id}
                  /* Обводка -m-1/p-1 геометрически нейтральна: карточка стоит
                     на месте, а подложка подсветки выступает на 4px по краям. */
                  className={
                    '-m-1 rounded-[28px] p-1 transition-colors duration-500 ' +
                    (isFlashing ? 'bg-sage-mist' : 'bg-transparent')
                  }
                >
                  <HabitCard
                    habit={habit}
                    checkIns={checkIns}
                    today={localToday}
                    done={done}
                    pending={pendingId === habit.id}
                    onToggle={() => handleToggle(habit.id)}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* FAB: справа над таб-баром; на широких экранах прижимается к правому
          краю контентной колонки max-w-md (50% − 14rem + 1rem запас). */}
      <button
        type="button"
        onClick={openDialog}
        aria-label="Добавить привычку"
        className="fixed bottom-20 right-[max(1rem,calc(50%_-_13rem))] z-40 flex size-14 items-center justify-center rounded-full bg-sage text-white shadow-lg shadow-ink/20 transition-all hover:bg-sage-deep active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-deep"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="size-7"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <HabitDialog
        open={dialogOpen}
        mode="create"
        onClose={closeDialog}
        onSubmit={handleCreate}
        pending={saving}
        error={dialogError}
      />
    </section>
  );
}
