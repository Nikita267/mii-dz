import { useCallback, useEffect, useRef, useState } from 'react';
import { trackEvent } from '../analytics/index.js';
import { fetchCheckIns, fetchHabits, toggleCheckIn } from '../data/api.js';
import { logError, logWarning } from '../utils/logger.js';

/*
 * useHabitsData — данные экрана «Сегодня»: параллельная загрузка привычек
 * и отметок, оптимистичная отметка с откатом при сбое, локальное «сегодня».
 * Хук инкапсулирует обязательные состояния loading / error / success
 * (правило 5 CLAUDE.md) и единый контракт данных для экранов.
 */

/** Тексты ошибок — константы: экран показывает их в баннере как есть. */
const LOAD_ERROR_MESSAGE =
  'Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.';
const TOGGLE_ERROR_MESSAGE =
  'Не удалось сохранить отметку — изменение отменено. Попробуйте ещё раз.';

/**
 * Дополняет число до двух знаков: 7 -> '07'.
 * @param {number} value число.
 * @returns {string} строка из двух цифр.
 */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Локальное «сегодня» строкой 'YYYY-MM-DD'. Компоненты берутся локальным
 * временем — так же, как mock-api сеет данные, поэтому строки совпадают.
 *
 * @param {Date} date текущий момент.
 * @returns {string} дата в формате 'YYYY-MM-DD'.
 */
function toLocalIsoString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Проверяет наличие отметки привычки за дату.
 *
 * @param {Array<{habitId: string, date: string}>} checkIns отметки.
 * @param {string} habitId идентификатор привычки.
 * @param {string} date дата 'YYYY-MM-DD'.
 * @returns {boolean} true, если отметка есть.
 */
function hasCheckIn(checkIns, habitId, date) {
  return checkIns.some((checkIn) => checkIn.habitId === habitId && checkIn.date === date);
}

/**
 * Возвращает новый массив отметок с добавленной или снятой отметкой за дату.
 * Операция «set/unset» идемпотентна: повторное применение с тем же значением
 * не создаёт дубликатов, поэтому откат и сверка с сервером безопасны.
 *
 * @param {Array<{habitId: string, date: string}>} checkIns исходные отметки.
 * @param {string} habitId идентификатор привычки.
 * @param {string} date дата 'YYYY-MM-DD'.
 * @param {boolean} done целевое состояние отметки.
 * @returns {Array<{habitId: string, date: string}>} новый массив отметок.
 */
function withDone(checkIns, habitId, date, done) {
  if (!done) {
    return checkIns.filter((checkIn) => !(checkIn.habitId === habitId && checkIn.date === date));
  }
  if (hasCheckIn(checkIns, habitId, date)) {
    return checkIns;
  }
  return [...checkIns, { habitId, date }];
}

/**
 * Загружает привычки и отметки для экранов приложения.
 *
 * Первая загрузка идёт с состоянием loading (на экране — скелетоны);
 * повторная (reload после создания привычки) — «тихая», без скелетонов,
 * чтобы готовый список не мигал. toggle переключает сегодняшнюю отметку
 * оптимистично: UI меняется сразу, при ошибке сети изменение откатывается
 * точечно и показывается баннер ошибки.
 *
 * @returns {{habits: Array<Object>, checkIns: Array<{habitId: string, date: string}>,
 *   loading: boolean, error: null|string, reload: Function, toggle: Function,
 *   pendingId: null|string, localToday: string}} Состояние данных:
 *   habits — активные привычки; checkIns — все отметки; loading/error —
 *   статус загрузки; reload() — повторная загрузка; toggle(habitId) —
 *   переключение сегодняшней отметки (true/false — итог сервера,
 *   null — ошибка с откатом); pendingId — привычка в момент сохранения;
 *   localToday — «сегодня» строкой 'YYYY-MM-DD'.
 */
export default function useHabitsData() {
  // «Сегодня» фиксируется на монтировании: пересчёт при смене суток не нужен
  // (сессии короткие, дата согласована с mock-api в рамках одной загрузки).
  const [localToday] = useState(() => toLocalIsoString(new Date()));
  const [habits, setHabits] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  /** Номер последнего запроса — защищает от «медленного старого» ответа. */
  const requestIdRef = useRef(0);
  /** Была ли успешная загрузка — делает последующие reload «тихими». */
  const loadedOnceRef = useRef(false);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!loadedOnceRef.current) {
      setLoading(true);
    }
    setError(null);
    try {
      // Привычки и отметки не зависят друг от друга — грузим параллельно.
      const [nextHabits, nextCheckIns] = await Promise.all([fetchHabits(), fetchCheckIns()]);
      if (requestIdRef.current !== requestId) {
        return; // уже есть более свежий запрос — этот ответ устарел
      }
      setHabits(nextHabits);
      setCheckIns(nextCheckIns);
      loadedOnceRef.current = true;
    } catch (loadError) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      logError('habits_load_failed', { error: String(loadError) });
      setError(LOAD_ERROR_MESSAGE);
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // Первая загрузка — микрозадачей: react-hooks/set-state-in-effect запрещает
    // синхронные setState из тела эффекта, а на монтировании синхронные вызовы
    // внутри load и так no-op (loading уже true, error уже null).
    Promise.resolve().then(load);
  }, [load]);

  const toggle = useCallback(
    async (habitId) => {
      const wasDone = hasCheckIn(checkIns, habitId, localToday);
      setPendingId(habitId);
      setError(null);
      // Оптимистичное обновление: чекбокс реагирует мгновенно, сервер
      // подтверждает спустя задержку mock-API (150–400 мс).
      setCheckIns((prev) => withDone(prev, habitId, localToday, !wasDone));
      try {
        const { done } = await toggleCheckIn(habitId, localToday);
        trackEvent('habit_toggled', { done });
        if (done === wasDone) {
          // Ответ разошёлся с прогнозом (данные менялись вне экрана) —
          // доверяем серверу и приводим отметку к его результату.
          setCheckIns((prev) => withDone(prev, habitId, localToday, done));
        }
        return done;
      } catch (toggleError) {
        logWarning('checkin_reverted', { habitId, date: localToday, error: String(toggleError) });
        // Хирургический откат одной отметки: соседние оптимистичные
        // изменения (другая карточка в этот момент) не затираются.
        setCheckIns((prev) => withDone(prev, habitId, localToday, wasDone));
        setError(TOGGLE_ERROR_MESSAGE);
        return null;
      } finally {
        setPendingId(null);
      }
    },
    [checkIns, localToday]
  );

  return { habits, checkIns, loading, error, reload: load, toggle, pendingId, localToday };
}
