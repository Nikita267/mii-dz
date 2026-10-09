/*
 * Аналитика «Трекера привычек» (ДЗ6): Google Analytics 4 ИЛИ Яндекс.Метрика —
 * выбор определяется переменными окружения Vite. Скрипт счётчика вставляется
 * динамически и ТОЛЬКО если ID задан: без env приложение не грузит ни байта
 * трекинга и не отправляет событий (полный no-op).
 *
 * Переменные окружения (см. .env.example):
 *   VITE_GA_MEASUREMENT_ID — идентификатор потока GA4, 'G-XXXXXXXXXX'
 *   VITE_YM_COUNTER_ID     — номер счётчика Яндекс.Метрики, например '12345678'
 *
 * Если заданы обе — грузятся оба счётчика, и trackEvent уходит в каждый
 * (событие дублируется). Секретов в ID нет: оба значения публичные.
 */

/** env-переменная идентификатора потока GA4. */
const GA_MEASUREMENT_ID_ENV = 'VITE_GA_MEASUREMENT_ID';

/** env-переменная номера счётчика Яндекс.Метрики. */
const YM_COUNTER_ID_ENV = 'VITE_YM_COUNTER_ID';

/** URL загрузки gtag.js (GA4); идентификатор потока идёт параметром ?id=. */
const GA_SCRIPT_URL = 'https://www.googletagmanager.com/gtag/js';

/** URL загрузки тега Яндекс.Метрики. */
const YM_SCRIPT_URL = 'https://mc.yandex.ru/metrika/tag.js';

/**
 * Безопасно читает переменные окружения Vite: в обычном Node import.meta.env
 * отсутствует — тогда конфигурации нет и аналитика отключена.
 * @returns {Object} объект env (возможно, пустой).
 */
function getEnv() {
  return import.meta.env ?? {};
}

/**
 * Возвращает непустую строковую переменную окружения или null.
 * @param {string} name имя переменной.
 * @returns {null|string} значение или null, если переменная не задана/пуста.
 */
function envString(name) {
  const value = getEnv()[name];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Читает конфигурацию аналитики при каждом вызове, а не при импорте модуля:
 * значения можно менять в рантайме (в тестах — vi.stubEnv) без перезагрузки.
 * @returns {{gaId: null|string, ymId: null|string}} включённые счётчики.
 */
function readConfig() {
  return {
    gaId: envString(GA_MEASUREMENT_ID_ENV),
    ymId: envString(YM_COUNTER_ID_ENV),
  };
}

/**
 * Вставляет асинхронный <script src> в head, если такого ещё нет. Повторные
 * вызовы безвредны: React StrictMode монтирует эффекты дважды, а initAnalytics
 * может вызываться и вручную после смены конфигурации.
 * @param {string} src адрес скрипта счётчика.
 * @returns {void}
 */
function insertScriptOnce(src) {
  const alreadyLoaded = Array.from(document.getElementsByTagName('script')).some(
    (tag) => tag.getAttribute('src') === src
  );
  if (alreadyLoaded) {
    return;
  }
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  // Пометка «наш» скрипт: тесты чистят DOM по ней, не трогая чужие теги.
  script.setAttribute('data-ht-analytics', 'true');
  document.head.appendChild(script);
}

/**
 * Включает GA4: очередь dataLayer и глобальная gtag (официальный сниппет),
 * конфигурация потока и асинхронная загрузка gtag.js с ID в адресе.
 * @param {string} measurementId идентификатор потока 'G-XXXXXXXXXX'.
 * @returns {void}
 */
function initGoogleAnalytics(measurementId) {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    // gtag складывает вызовы в очередь dataLayer; готовый gtag.js вычитает её.
    window.gtag = function gtag(...args) {
      window.dataLayer.push(args);
    };
  }
  window.gtag('js', new Date());
  window.gtag('config', measurementId);
  insertScriptOnce(`${GA_SCRIPT_URL}?id=${measurementId}`);
}

/**
 * Включает Яндекс.Метрику: очередь ym и инициализация счётчика. Вебвизор
 * (запись экрана) выключен — для трекера привычек достаточно целей, а
 * clickmap и точный показатель отказов дают картину использования.
 * @param {string} counterId номер счётчика (числовая строка).
 * @returns {void}
 */
function initYandexMetrika(counterId) {
  if (typeof window.ym !== 'function') {
    // Официальная очередь tag.js: вызовы копятся в ym.a до загрузки скрипта.
    window.ym = function ym(...args) {
      window.ym.a = window.ym.a || [];
      window.ym.a.push(args);
    };
  }
  window.ym(Number(counterId), 'init', {
    clickmap: true,
    accurateTrackBounce: true,
    webvisor: false,
  });
  insertScriptOnce(YM_SCRIPT_URL);
}

/**
 * Инициализирует аналитику по переменным окружения: вставляет скрипт GA4
 * и/или Яндекс.Метрики и настраивает счётчики. Вызывать один раз при
 * монтировании приложения; без ID — no-op (никаких тегов и запросов).
 * @returns {void}
 */
export function initAnalytics() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return; // окружение без DOM (Node/SSR) — трекать нечего
  }
  const { gaId, ymId } = readConfig();
  if (gaId !== null) {
    initGoogleAnalytics(gaId);
  }
  if (ymId !== null) {
    initYandexMetrika(ymId);
  }
}

/**
 * Отправляет событие во все включённые системы: GA4 — gtag('event', ...),
 * Метрика — ym(counter, 'reachGoal', ...). Безопасна в любом состоянии:
 * если env не задан или глобалы трекинга ещё не готовы (скрипт не загрузился,
 * initAnalytics не вызывался) — тихий no-op без исключений.
 * @param {string} name имя события ('screen_view', 'habit_created', ...).
 * @param {Object} [params] параметры события (GA4 — параметры, Метрика —
 *   параметры цели reachGoal).
 * @returns {void}
 */
export function trackEvent(name, params = {}) {
  const { gaId, ymId } = readConfig();
  if (typeof window === 'undefined') {
    return;
  }
  if (gaId !== null && typeof window.gtag === 'function') {
    window.gtag('event', name, params);
  }
  if (ymId !== null && typeof window.ym === 'function') {
    window.ym(Number(ymId), 'reachGoal', name, params);
  }
}

/**
 * Проверяет, включена ли аналитика (задан хотя бы один ID счётчика).
 * Удобна для отладки и условных проверок в UI.
 * @returns {boolean} true, если initAnalytics вставит счётчик(и).
 */
export function isAnalyticsEnabled() {
  const { gaId, ymId } = readConfig();
  return gaId !== null || ymId !== null;
}
