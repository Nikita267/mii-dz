/*
 * EmptyState — универсальное пустое состояние (FR-2/FR-4/FR-22):
 * заголовок, пояснение и необязательная кнопка действия в один тап.
 * Оформление перекликается с блоком «Новая привычка» макета (пунктир, шалфей).
 */

/**
 * Пустое состояние экрана или раздела.
 *
 * @param {object} props — свойства компонента.
 * @param {string} props.title — заголовок, например «Отмечай за 5 секунд».
 * @param {string} props.hint — пояснение, зачем и что делать дальше.
 * @param {string} [props.actionLabel] — подпись кнопки; без неё кнопка не выводится.
 * @param {Function} [props.onAction] — обработчик нажатия кнопки.
 * @returns {JSX.Element} Блок пустого состояния.
 */
export default function EmptyState({ title, hint, actionLabel, onAction }) {
  return (
    <div
      className={
        'rounded-3xl border border-dashed border-sage/60 bg-sage-mist/40 px-6 py-10 text-center'
      }
    >
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">{hint}</p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className={
            'mt-6 rounded-full bg-sage px-6 py-2.5 text-sm font-semibold text-white ' +
            'transition-colors hover:bg-sage-deep'
          }
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
