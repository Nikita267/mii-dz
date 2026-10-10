// Health Check — Vercel Serverless Function (ДЗ6).
// Проверяет доступность зависимостей приложения (БД PostgREST и Auth-сервис
// Supabase) и отвечает структурированным JSON: мониторинг и uptime-роботы
// получают статус и латентность, не трогая публичный UI. Секретов нет:
// читаются серверные env SUPABASE_URL / SUPABASE_ANON_KEY (без префикса
// VITE_, задаются в Vercel), anon-ключ публичный, данные защищает RLS.

/** Таймаут одной проверки: заметно меньше 10-секундного лимита функции Vercel. */
const CHECK_TIMEOUT_MS = 5000;

/** Результат проверки одного сервиса Supabase. */
/** @typedef {{status: 'up'|'down', latencyMs: number, error: null|string}} ServiceCheck */

/**
 * Пингует один сервис и замеряет латентность ответа.
 *
 * @param {string} url абсолютный адрес эндпоинта.
 * @param {Object.<string, string>} headers заголовки запроса (apikey).
 * @returns {Promise<ServiceCheck>} up при HTTP 2xx, иначе down с причиной.
 */
async function probeService(url, headers) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers,
      // Жёсткий таймаут: «зависший» сервис не должен держать функцию до лимита.
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return { status: 'down', latencyMs, error: `HTTP ${response.status}` };
    }
    return { status: 'up', latencyMs, error: null };
  } catch (probeError) {
    return {
      status: 'down',
      latencyMs: Date.now() - startedAt,
      error: probeError instanceof Error ? probeError.message : 'network error',
    };
  }
}

/**
 * Результат проверки при незаданном env: конфигурация Vercel — часть здоровья
 * функции, поэтому отсутствие переменных честно репортится как «down».
 *
 * @returns {ServiceCheck} Заглушка проверки с причиной в error.
 */
function misconfiguredCheck() {
  return { status: 'down', latencyMs: 0, error: 'SUPABASE_URL or SUPABASE_ANON_KEY is not set' };
}

/**
 * GET /api/health — здоровье зависимостей приложения.
 *
 * Параллельно проверяет БД (GET /rest/v1/habits?select=id&limit=1 с apikey:
 * под anon-ключом RLS возвращает 200 с пустым списком — корень /rest/v1/
 * стабильно отвечает 401 и для здоровья не годится) и Auth
 * (GET /auth/v1/health с тем же apikey), отвечает JSON-объектом
 * { status: 'ok'|'degraded', checks: { db, auth }, latencyMs, uptime,
 * timestamp }: все проверки прошли — HTTP 200, хотя бы одна нет (в том числе
 * из-за отсутствия env) — HTTP 503. Ответ помечен Cache-Control: no-store,
 * чтобы прокси и браузеры не кэшировали устаревший статус.
 *
 * @param {import('http').IncomingMessage} req входящий запрос (только GET).
 * @param {import('http').ServerResponse} res ответ функции.
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ status: 'error', error: 'method_not_allowed' });
    return;
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  const startedAt = Date.now();

  // Проверки не зависят друг от друга — идут параллельно, поэтому общая
  // латентность не складывается из двух последовательных кругов.
  const [db, auth] =
    SUPABASE_URL && SUPABASE_ANON_KEY
      ? await Promise.all([
          probeService(`${SUPABASE_URL}/rest/v1/habits?select=id&limit=1`, {
            apikey: SUPABASE_ANON_KEY,
          }),
          probeService(`${SUPABASE_URL}/auth/v1/health`, { apikey: SUPABASE_ANON_KEY }),
        ])
      : [misconfiguredCheck(), misconfiguredCheck()];

  const isOk = db.status === 'up' && auth.status === 'up';

  res.setHeader('Cache-Control', 'no-store');
  res.status(isOk ? 200 : 503).json({
    status: isOk ? 'ok' : 'degraded',
    checks: { db, auth },
    latencyMs: Date.now() - startedAt,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
