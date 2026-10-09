/*
 * ErrorBanner — баннер ошибки с кнопкой «Повторить».
 * Единый вид сбоев для всех экранов (правило CLAUDE.md: у каждой асинхронной
 * операции обязателен видимый error-стейт).
 */

/**
 * Баннер ошибки операции с возможностью повтора.
 *
 * @param {object} props — свойства компонента.
 * @param {string|null} props.message — текст ошибки; null скрывает баннер.
 * @param {Function} [props.onRetry] — повтор операции; без него кнопка не выводится.
 * @returns {JSX.Element|null} Баннер или null при отсутствии ошибки.
 */
export default function ErrorBanner({ message, onRetry }) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      className={
        'flex items-center justify-between gap-3 rounded-2xl border ' +
        'border-terracotta/40 bg-terracotta/10 px-4 py-3'
      }
    >
      <p className="min-w-0 text-sm leading-snug text-ink">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={
            'shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-terracotta ' +
            'transition-colors hover:bg-terracotta/10'
          }
        >
          Повторить
        </button>
      )}
    </div>
  );
}
