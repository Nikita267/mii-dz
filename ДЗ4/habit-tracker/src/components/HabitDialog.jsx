import { useEffect, useState } from 'react';

/*
 * HabitDialog — универсальный диалог создания/редактирования привычки
 * (ТЗ ДЗ3, FR-6..FR-9): название 1–40 символов со счётчиком, сетка из 8 эмодзи,
 * палитра из 6 цветов, Enter = «Сохранить», ошибка пустого названия — терракотой.
 */

/** Лимит названия по FR-9: 41-й символ не вводится (maxLength). */
const TITLE_MAX_LENGTH = 40;
const EMPTY_TITLE_MESSAGE = 'Название не может быть пустым';
/** Дефолты FR-7: достаточно ввести название, оформление необязательно. */
const DEFAULT_EMOJI = '💪';

/** Пресеты эмодзи (8 штук) — набор из api.js; держим локально до появления модуля. */
const EMOJI_PRESETS = ['💪', '💧', '📖', '🧘', '🚫', '🍬', '😴', '🏃'];

/** Дефолтный цвет — шалфей, как в createHabit из api.js. */
const DEFAULT_COLOR = '#7C9883';

/**
 * Палитра из 6 цветов — та же, что в seed-данных api.js. Хранится полный тон
 * HEX: подложка чипа в карточке получается добавлением альфы («{color}22»).
 */
const COLOR_PRESETS = [
  { value: '#7C9883', label: 'Шалфейный' },
  { value: '#C97B5D', label: 'Терракотовый' },
  { value: '#7B8FA6', label: 'Пыльно-синий' },
  { value: '#C9A227', label: 'Горчичный' },
  { value: '#C98B9A', label: 'Розовый' },
  { value: '#8B7FA6', label: 'Сиреневый' },
];

/**
 * Внутренняя форма диалога. Вынесена, чтобы наружный компонент мог делать
 * ранний return при !open без нарушения правила стабильности хуков, а ключ
 * key={mode} пересоздавал состояние при переключении режимов.
 *
 * @param {object} props — свойства компонента.
 * @param {'create'|'edit'} props.mode — режим создания или редактирования.
 * @param {{title?: string, emoji?: string, color?: string}} [props.initial] —
 *   исходные значения (в редактировании — текущие данные привычки).
 * @param {Function} props.onClose — закрытие диалога без сохранения.
 * @param {Function} props.onSubmit — вызов с payload {title, emoji, color}.
 * @param {boolean} props.pending — идёт сохранение (кнопка «Сохранение…»).
 * @param {string|null} props.error — ошибка сохранения от родителя.
 * @returns {JSX.Element} Карточка диалога с формой.
 */
function HabitDialogForm({ mode, initial, onClose, onSubmit, pending, error }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? DEFAULT_EMOJI);
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COLOR);
  const [titleError, setTitleError] = useState(null);

  // Esc закрывает диалог; подписка живёт только пока диалог смонтирован.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !pending) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pending]);

  /**
   * Отправка формы: пустое название подсвечивается терракотой (FR-8),
   * валидный вариант уходит родителю обрезанным (FR-10 — trim по краям).
   *
   * @param {React.FormEvent} event — событие submit (в т.ч. по Enter).
   * @returns {void}
   */
  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(EMPTY_TITLE_MESSAGE);
      return;
    }
    setTitleError(null);
    onSubmit({ title: trimmed, emoji, color });
  };

  /** Ввод снимает подсветку ошибки — пользователь уже исправляет (FR-8). */
  const handleTitleChange = (event) => {
    setTitle(event.target.value);
    if (titleError) {
      setTitleError(null);
    }
  };

  const isEdit = mode === 'edit';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="habit-dialog-title"
      className="w-full max-w-md rounded-3xl border border-line bg-card p-5 shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="habit-dialog-title" className="font-display text-xl text-ink">
            {isEdit ? 'Редактирование привычки' : 'Новая привычка'}
          </h2>
          {isEdit && (
            <p className="mt-2 inline-block rounded-full bg-sage-mist px-2.5 py-1 text-xs font-semibold text-sage-deep">
              История и серия сохранятся
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          aria-label="Закрыть"
          className={
            'flex size-8 shrink-0 items-center justify-center rounded-full text-ink-faint ' +
            'transition-colors hover:bg-sage-mist hover:text-ink disabled:opacity-50'
          }
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4">
        <label
          htmlFor="habit-title"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-faint"
        >
          Название
        </label>
        <input
          id="habit-title"
          type="text"
          value={title}
          onChange={handleTitleChange}
          maxLength={TITLE_MAX_LENGTH}
          autoFocus
          placeholder="Например: Вода"
          aria-invalid={Boolean(titleError)}
          aria-describedby={titleError ? 'habit-title-error' : undefined}
          className={
            'w-full rounded-xl border bg-card px-3.5 py-2.5 text-base text-ink outline-none ' +
            'transition-colors placeholder:text-ink-faint focus:ring-2 focus:ring-sage ' +
            (titleError ? 'border-terracotta' : 'border-line focus:border-sage')
          }
        />
        <div className="mt-1 flex items-baseline justify-between gap-2">
          {titleError ? (
            <p id="habit-title-error" className="text-xs text-terracotta">
              {titleError}
            </p>
          ) : (
            <p className="text-xs text-ink-faint">От 1 до {TITLE_MAX_LENGTH} символов</p>
          )}
          <span
            className={
              'text-xs ' +
              (title.length >= TITLE_MAX_LENGTH ? 'text-terracotta' : 'text-ink-faint')
            }
          >
            {title.length}/{TITLE_MAX_LENGTH}
          </span>
        </div>

        <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-faint">
          Эмодзи
        </p>
        <div className="grid grid-cols-8 gap-1.5" role="group" aria-label="Выбор эмодзи">
          {EMOJI_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setEmoji(preset)}
              aria-pressed={emoji === preset}
              aria-label={`Эмодзи ${preset}`}
              className={
                'flex size-9 items-center justify-center rounded-xl text-xl transition-colors ' +
                (emoji === preset ? 'bg-sage-mist ring-1 ring-sage-deep' : 'hover:bg-sage-mist/60')
              }
            >
              {preset}
            </button>
          ))}
        </div>

        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-faint">
          Цвет
        </p>
        <div className="flex gap-2.5" role="group" aria-label="Выбор цвета">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setColor(preset.value)}
              aria-pressed={color === preset.value}
              aria-label={preset.label}
              title={preset.label}
              // Цвет пресета динамический по природе — то же исключение,
              // что и цвет привычки в карточке.
              style={{ backgroundColor: preset.value }}
              className={
                'size-8 rounded-full transition-transform hover:scale-110 ' +
                (color === preset.value
                  ? 'ring-2 ring-sage-deep ring-offset-2 ring-offset-card'
                  : 'ring-1 ring-line ring-offset-2 ring-offset-card')
              }
            />
          ))}
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-terracotta/10 px-3 py-2 text-xs text-terracotta"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={
              'flex-1 rounded-full border border-line py-2.5 text-sm font-semibold text-ink-soft ' +
              'transition-colors hover:text-ink disabled:opacity-50'
            }
          >
            Отмена
          </button>
          {/* FR-8: «Сохранить» активна всегда — валидация показывает ошибку,
              а не блокирует кнопку; отключение только на время сохранения. */}
          <button
            type="submit"
            disabled={pending}
            className={
              'flex-1 rounded-full bg-sage py-2.5 text-sm font-semibold text-white ' +
              'transition-colors hover:bg-sage-deep disabled:opacity-60'
            }
          >
            {pending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Диалог создания/редактирования привычки: overlay, закрытие по Esc и клику
 * вне карточки, блокировка закрытия на время сохранения.
 *
 * @param {object} props — свойства компонента.
 * @param {boolean} props.open — показан ли диалог.
 * @param {'create'|'edit'} [props.mode='create'] — режим работы формы.
 * @param {{title?: string, emoji?: string, color?: string}} [props.initial] —
 *   стартовые значения полей (для редактирования).
 * @param {Function} props.onClose — закрытие без сохранения.
 * @param {Function} props.onSubmit — сохранение; получает {title, emoji, color}.
 * @param {boolean} [props.pending=false] — идёт сохранение.
 * @param {string|null} [props.error=null] — ошибка сохранения для показа в форме.
 * @returns {JSX.Element|null} Диалог или null, когда закрыт.
 */
export default function HabitDialog({
  open,
  mode = 'create',
  initial,
  onClose,
  onSubmit,
  pending = false,
  error = null,
}) {
  if (!open) {
    return null;
  }

  const handleBackdropMouseDown = (event) => {
    // Закрываем только по клику именно по подложке, не по карточке.
    if (event.target === event.currentTarget && !pending) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-4 sm:items-center"
      onMouseDown={handleBackdropMouseDown}
    >
      <HabitDialogForm
        key={mode}
        mode={mode}
        initial={initial}
        onClose={onClose}
        onSubmit={onSubmit}
        pending={pending}
        error={error}
      />
    </div>
  );
}
