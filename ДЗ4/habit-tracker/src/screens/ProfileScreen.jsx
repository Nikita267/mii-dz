import { useCallback, useEffect, useMemo, useState } from 'react';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import HabitDialog from '../components/HabitDialog.jsx';
import StreakBadge from '../components/StreakBadge.jsx';
import {
  archiveHabit,
  fetchAllHabits,
  fetchCheckIns,
  restoreHabit,
  updateHabit,
} from '../data/api.js';
import { formatDayMonth } from '../utils/format.js';
import { getCurrentStreak } from '../utils/stats.js';

/*
 * Экран «Профиль» (ТЗ ДЗ3, функция 1 — управление привычками): список активных
 * привычек с датой создания и серией, редактирование через HabitDialog,
 * архивация с подтверждением прямо в карточке (FR-17..FR-19), свёрнутый раздел
 * «Архив» с восстановлением (FR-22..FR-23) и баннер локального хранения
 * (FR-58 в адаптации Mock-режима ДЗ4).
 */

/** Окно «молодости» привычки: моложе — бейдж «новая» вместо «0 дней» (FR-26). */
const NEW_HABIT_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить привычки. Проверьте соединение и повторите.';
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить изменение. Попробуйте ещё раз.';
/** Текст подтверждения архивации из FR-17 — решение должно быть осознанным. */
const ARCHIVE_CONFIRM_HINT = 'Вклад привычки в статистику и календарь за прошедшие дни сохранится';
/** Пояснение пустого архива из FR-22 — раздел объясняет назначение, а не «пусто». */
const ARCHIVE_EMPTY_HINT =
  'Здесь будут отдохнувшие привычки. Архив не удаляет историю — серии и статистика сохраняются';
/** Баннер локального режима (FR-58, адаптация под Mock ДЗ4). */
const LOCAL_DATA_BANNER = 'Данные хранятся локально (Mock). Синхронизация появится в ДЗ5';

/** Суффикс альфы для подложки эмодзи-чипа в цвет привычки (как в HabitCard). */
const CHIP_ALPHA = '22';

/**
 * Сегодняшняя дата локального календаря в формате 'YYYY-MM-DD'.
 * Компоненты берутся локальными: пользовательская «середина дня» не должна
 * зависеть от таймзоны UTC (правило проекта: даты — строками).
 *
 * @returns {string} Дата строкой 'YYYY-MM-DD'.
 */
function localTodayIso() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Разбирает 'YYYY-MM-DD' в локальную полночь — для formatDayMonth, который
 * читает локальные компоненты. Форма с временем и без зоны 'T00:00:00'
 * парсится как локальное время, поэтому календарный день не сдвигается.
 *
 * @param {string} iso дата строкой 'YYYY-MM-DD'.
 * @returns {Date} Полночь указанного дня по локальному времени.
 */
function isoToLocalDate(iso) {
  return new Date(`${iso}T00:00:00`);
}

/**
 * Число полных дней от даты до «сегодня» (граница для пометки «новая»).
 *
 * @param {string} iso дата строкой 'YYYY-MM-DD'.
 * @param {string} todayIso «сегодня» строкой 'YYYY-MM-DD'.
 * @returns {number} Целое число дней, >= 0 для прошедших дат.
 */
function daysSince(iso, todayIso) {
  // Math.round страхует от суток в 23/25 часов при переходе на летнее время.
  return Math.round((isoToLocalDate(todayIso) - isoToLocalDate(iso)) / MS_PER_DAY);
}

/**
 * Скелетон на время загрузки: спокойные пульсирующие заглушки карточек,
 * чтобы экран не «прыгал» после прихода данных.
 *
 * @returns {JSX.Element} Блок состояния загрузки.
 */
function LoadingState() {
  return (
    <div className="mt-4 space-y-3" aria-busy="true">
      <p role="status" className="text-sm text-ink-faint">
        Загрузка привычек…
      </p>
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-24 animate-pulse rounded-3xl bg-bar-off/60" />
      ))}
    </div>
  );
}

/**
 * Баннер локального режима хранения (FR-58, адаптация ДЗ4): честно сообщает,
 * что данные пока только в этом браузере и синхронизация придёт с ДЗ5.
 *
 * @returns {JSX.Element} Плашка-баннер.
 */
function LocalDataBanner() {
  return (
    <p
      role="note"
      className="mt-4 rounded-2xl bg-sage-mist px-4 py-3 text-xs leading-relaxed text-sage-deep"
    >
      {LOCAL_DATA_BANNER}
    </p>
  );
}

/**
 * Встроенное подтверждение архивации (FR-17/FR-19) вместо window.confirm:
 * пояснение о сохранении истории + пара кнопок «Отмена» / «Архивировать».
 *
 * @param {object} props — свойства компонента.
 * @param {boolean} props.busy — идёт ли архивация (кнопка «Архивируем…»).
 * @param {Function} props.onConfirm — подтверждение архивации.
 * @param {Function} props.onCancel — отмена — карточка остаётся без изменений.
 * @returns {JSX.Element} Панель подтверждения.
 */
function ArchiveConfirm({ busy, onConfirm, onCancel }) {
  return (
    <div className="mt-3 rounded-2xl bg-sage-mist/60 px-3.5 py-3">
      <p className="text-xs leading-relaxed text-ink">{ARCHIVE_CONFIRM_HINT}</p>
      <div className="mt-2.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={
            'rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-ink-soft ' +
            'transition-colors hover:text-ink disabled:opacity-50'
          }
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={
            'rounded-full bg-sage px-3.5 py-1.5 text-xs font-semibold text-white ' +
            'transition-colors hover:bg-sage-deep disabled:opacity-60'
          }
        >
          {busy ? 'Архивируем…' : 'Архивировать'}
        </button>
      </div>
    </div>
  );
}

/**
 * Карточка активной привычки: эмодзи-чип в цвете привычки, название, дата
 * создания (formatDayMonth), бейдж серии и кнопки «Изменить» / «В архив».
 * При подтверждении архивации кнопки сменяются панелью ArchiveConfirm.
 *
 * @param {object} props — свойства компонента.
 * @param {{id: string, title: string, emoji: string, color: string,
 *   createdAt: string}} props.habit — данные привычки.
 * @param {number} props.streakDays — текущая серия привычки в днях.
 * @param {boolean} props.isNew — привычка моложе 7 дней (FR-26).
 * @param {boolean} props.confirming — открыт ли режим подтверждения архивации.
 * @param {boolean} props.busy — идёт ли асинхронная операция с этой привычкой.
 * @param {Function} props.onEdit — открыть диалог редактирования.
 * @param {Function} props.onArchiveRequest — показать подтверждение архивации.
 * @param {Function} props.onArchiveCancel — скрыть подтверждение.
 * @param {Function} props.onArchiveConfirm — выполнить архивацию.
 * @returns {JSX.Element} Карточка строки активной привычки.
 */
function HabitRow({
  habit,
  streakDays,
  isNew,
  confirming,
  busy,
  onEdit,
  onArchiveRequest,
  onArchiveCancel,
  onArchiveConfirm,
}) {
  return (
    <li>
      <article className="rounded-3xl border border-line bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{ backgroundColor: `${habit.color}${CHIP_ALPHA}` }}
          >
            {habit.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-ink">{habit.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs text-ink-faint">
                с {formatDayMonth(isoToLocalDate(habit.createdAt))}
              </span>
              <StreakBadge days={streakDays} isNew={isNew} />
            </div>
          </div>
        </div>

        {confirming ? (
          <ArchiveConfirm busy={busy} onConfirm={onArchiveConfirm} onCancel={onArchiveCancel} />
        ) : (
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              className={
                'rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold ' +
                'text-ink-soft transition-colors hover:border-sage/60 hover:text-ink ' +
                'disabled:opacity-50'
              }
            >
              Изменить
            </button>
            <button
              type="button"
              onClick={onArchiveRequest}
              disabled={busy}
              className={
                'rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold ' +
                'text-ink-soft transition-colors hover:border-sage/60 hover:text-ink ' +
                'disabled:opacity-50'
              }
            >
              {busy ? 'Архивируем…' : 'В архив'}
            </button>
          </div>
        )}
      </article>
    </li>
  );
}

/**
 * Строка архивной привычки: приглушённая карточка с датой архивации
 * и кнопкой «Восстановить» (FR-23 — возврат с сохранением истории).
 *
 * @param {object} props — свойства компонента.
 * @param {{id: string, title: string, emoji: string, color: string,
 *   archivedAt: string}} props.habit — данные архивной привычки.
 * @param {boolean} props.busy — идёт ли восстановление.
 * @param {Function} props.onRestore — вернуть привычку из архива.
 * @returns {JSX.Element} Карточка строки архива.
 */
function ArchivedHabitRow({ habit, busy, onRestore }) {
  return (
    <li>
      <article className="flex items-center gap-3 rounded-2xl border border-line/70 bg-card p-3.5">
        <div
          aria-hidden="true"
          className={
            'flex size-10 shrink-0 items-center justify-center rounded-xl text-xl opacity-80'
          }
          style={{ backgroundColor: `${habit.color}${CHIP_ALPHA}` }}
        >
          {habit.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink-soft">{habit.title}</h3>
          <p className="mt-0.5 text-xs text-ink-faint">
            в архиве с {formatDayMonth(isoToLocalDate(habit.archivedAt))}
          </p>
        </div>
        <button
          type="button"
          onClick={onRestore}
          disabled={busy}
          className={
            'shrink-0 rounded-full bg-sage px-3.5 py-1.5 text-xs font-semibold text-white ' +
            'transition-colors hover:bg-sage-deep disabled:opacity-60'
          }
        >
          {busy ? 'Возвращаем…' : 'Восстановить'}
        </button>
      </article>
    </li>
  );
}

/**
 * Экран «Профиль»: управление привычками — редактирование, архивация
 * и восстановление. Данные грузятся самостоятельно (fetchAllHabits +
 * fetchCheckIns одним эффектом), каждое действие проходит через mock-API
 * с обязательными состояниями loading / error / success.
 *
 * @returns {JSX.Element} Экран профиля.
 */
export default function ProfileScreen() {
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState(null);
  const [habits, setHabits] = useState([]);
  const [checkIns, setCheckIns] = useState([]);

  // Идентификатор привычки, с которой идёт асинхронная операция (строка
  // блокируется), + текст ошибки мутации вне диалога редактирования.
  const [busyId, setBusyId] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  const [archiveOpen, setArchiveOpen] = useState(false);

  // «Сегодня» фиксируется на монтировании: экран не обязан сам отслеживать
  // полуночь (FR-33 — задача экрана «Сегодня»), но серии считаются от неё.
  const today = useMemo(() => localTodayIso(), []);

  /**
   * Загружает привычки и отметки одним запросом-парой.
   *
   * @returns {Promise<void>} Завершается после обновления состояний.
   */
  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    try {
      const [loadedHabits, loadedCheckIns] = await Promise.all([
        fetchAllHabits(),
        fetchCheckIns(),
      ]);
      setHabits(loadedHabits);
      setCheckIns(loadedCheckIns);
      setStatus('success');
    } catch {
      setStatus('error');
      setLoadError(LOAD_ERROR_MESSAGE);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeHabits = habits.filter((habit) => habit.archivedAt === null);
  const archivedHabits = habits.filter((habit) => habit.archivedAt !== null);

  /**
   * Универсальный прогон мутации: блокирует строку, при успехе перезагружает
   * данные (mock-API — единственный источник истины), при ошибке показывает
   * баннер с повтором вместо тихого сбоя.
   *
   * @param {string} habitId — идентификатор привычки.
   * @param {Function} action — асинхронная операция из data/api.js.
   * @param {Function} [onSuccess] — действие после успеха до перезагрузки.
   * @returns {Promise<void>}
   */
  const runMutation = async (habitId, action, onSuccess) => {
    setBusyId(habitId);
    setMutationError(null);
    try {
      await action();
      if (onSuccess) {
        onSuccess();
      }
      await load();
    } catch {
      setMutationError(SAVE_ERROR_MESSAGE);
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Открывает диалог редактирования с текущими значениями привычки.
   *
   * @param {{id: string, title: string, emoji: string, color: string}} habit —
   *   редактируемая привычка.
   * @returns {void}
   */
  const handleEditOpen = (habit) => {
    setEditing(habit);
    setEditError(null);
  };

  /**
   * Сохраняет правки через updateHabit; при ошибке диалог остаётся открытым
   * с сообщением внутри (FR-16: случайное закрытие/сбой не портят данные).
   *
   * @param {{title: string, emoji: string, color: string}} payload —
   *   значения формы из HabitDialog.
   * @returns {Promise<void>}
   */
  const handleEditSubmit = async (payload) => {
    setSaving(true);
    setEditError(null);
    try {
      await updateHabit(editing.id, payload);
      setEditing(null);
      await load();
    } catch {
      setEditError(SAVE_ERROR_MESSAGE);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Профиль">
      <h1 className="font-display text-2xl font-semibold">Профиль</h1>
      <p className="mt-1 text-sm text-ink-soft">Привычки, серии и архив — в одном месте.</p>

      {status === 'loading' && <LoadingState />}

      {status === 'error' && (
        <div className="mt-4">
          <ErrorBanner message={loadError} onRetry={load} />
        </div>
      )}

      {status === 'success' && (
        <>
          <LocalDataBanner />

          {mutationError && (
            <div className="mt-3">
              <ErrorBanner message={mutationError} onRetry={load} />
            </div>
          )}

          {activeHabits.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Активных привычек нет"
                hint="Верните привычку из архива — история, серии и статистика сохранятся."
                actionLabel="Открыть архив"
                onAction={() => setArchiveOpen(true)}
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {activeHabits.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  streakDays={getCurrentStreak(checkIns, habit.id, today)}
                  isNew={daysSince(habit.createdAt, today) < NEW_HABIT_WINDOW_DAYS}
                  confirming={confirmId === habit.id}
                  busy={busyId === habit.id}
                  onEdit={() => handleEditOpen(habit)}
                  onArchiveRequest={() => {
                    setMutationError(null);
                    setConfirmId(habit.id);
                  }}
                  onArchiveCancel={() => setConfirmId(null)}
                  onArchiveConfirm={() =>
                    runMutation(habit.id, () => archiveHabit(habit.id), () => setConfirmId(null))
                  }
                />
              ))}
            </ul>
          )}

          {/* Архив свёрнут по умолчанию (details/summary): к редко нужному
              разделу один тап, count в подписи виден и свёрнутым. */}
          <details
            open={archiveOpen}
            onToggle={(event) => setArchiveOpen(event.currentTarget.open)}
            className="mt-6 rounded-3xl border border-line bg-card px-4 py-1"
          >
            <summary
              className={
                'cursor-pointer select-none py-3 text-sm font-semibold text-ink-soft ' +
                'transition-colors hover:text-ink'
              }
            >
              Архив · {archivedHabits.length}
            </summary>
            {archivedHabits.length === 0 ? (
              <p className="pb-4 pr-4 text-xs leading-relaxed text-ink-faint">
                {ARCHIVE_EMPTY_HINT}
              </p>
            ) : (
              <ul className="space-y-2.5 pb-4">
                {archivedHabits.map((habit) => (
                  <ArchivedHabitRow
                    key={habit.id}
                    habit={habit}
                    busy={busyId === habit.id}
                    onRestore={() => runMutation(habit.id, () => restoreHabit(habit.id))}
                  />
                ))}
              </ul>
            )}
          </details>
        </>
      )}

      <HabitDialog
        open={Boolean(editing)}
        mode="edit"
        initial={
          editing
            ? { title: editing.title, emoji: editing.emoji, color: editing.color }
            : undefined
        }
        onClose={() => {
          setEditing(null);
          setEditError(null);
        }}
        onSubmit={handleEditSubmit}
        pending={saving}
        error={editError}
      />
    </section>
  );
}
