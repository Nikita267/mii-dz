// Структурированный логгер (ДЗ6): каждая запись — одна строка JSON
// { ts, level, msg, ...context }. Машиночитаемые логи удобно фильтровать и
// собирать мониторингом, а единый формат в браузере и на сервере упрощает
// разбор инцидентов. Порог фильтрации задаётся переменной окружения
// VITE_LOG_LEVEL ('debug' | 'info' | 'warning' | 'error', по умолчанию 'info').

/** Приоритеты уровней: больше — «важнее». Порядок фиксирован этой таблицей. */
const LEVELS = { debug: 10, info: 20, warning: 30, error: 40 };

/** Уровень по умолчанию: debug-шум не нужен, пока его явно не попросили. */
const DEFAULT_LEVEL = 'info';

/**
 * Разрешает порог фильтрации из VITE_LOG_LEVEL.
 *
 * Читается при каждой записи, а не кэшируется при импорте: смена переменной
 * окружения (в тестах через vi.stubEnv) подхватывается без перезагрузки модуля.
 *
 * @returns {string} Действующий уровень — один из ключей LEVELS.
 */
function resolveThreshold() {
  const raw = import.meta.env?.VITE_LOG_LEVEL;
  const level = typeof raw === 'string' ? raw.toLowerCase() : '';
  return LEVELS[level] ? level : DEFAULT_LEVEL;
}

/**
 * Формирует JSON-запись и выводит её одним вызовом консоли: одна запись —
 * одна строка, при копировании лога записи не склеиваются и остаются парсибельными.
 *
 * @param {string} level уровень записи ('debug' | 'info' | 'warning' | 'error').
 * @param {string} msg короткий идентификатор события, например 'habit_created'.
 * @param {Object<string, *>} [context] дополнительные поля записи (расширяют JSON).
 * @returns {void}
 */
function emit(level, msg, context) {
  if (LEVELS[level] < LEVELS[resolveThreshold()]) {
    return;
  }
  const entry = { ts: new Date().toISOString(), level, msg, ...context };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warning') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Логирует событие уровня debug — детальная трассировка для разработки.
 *
 * @param {string} msg идентификатор события.
 * @param {Object<string, *>} [context] дополнительные поля записи.
 * @returns {void}
 */
export function logDebug(msg, context = {}) {
  emit('debug', msg, context);
}

/**
 * Логирует событие уровня info — штатные этапы работы приложения.
 *
 * @param {string} msg идентификатор события, например 'habit_created'.
 * @param {Object<string, *>} [context] дополнительные поля записи.
 * @returns {void}
 */
export function logInfo(msg, context = {}) {
  emit('info', msg, context);
}

/**
 * Логирует событие уровня warning — восстановимая проблема (откат оптимистичного
 * обновления, повторная попытка), пользователь мог заметить сбой.
 *
 * @param {string} msg идентификатор события, например 'checkin_reverted'.
 * @param {Object<string, *>} [context] дополнительные поля записи.
 * @returns {void}
 */
export function logWarning(msg, context = {}) {
  emit('warning', msg, context);
}

/**
 * Логирует событие уровня error — операция не выполнена, нужен разбор.
 *
 * @param {string} msg идентификатор события, например 'habits_load_failed'.
 * @param {Object<string, *>} [context] дополнительные поля записи.
 * @returns {void}
 */
export function logError(msg, context = {}) {
  emit('error', msg, context);
}
