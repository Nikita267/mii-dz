/*
 * Supabase-бэкенд «Трекера привычек» (ДЗ5): реальный слой данных поверх
 * PostgreSQL + Auth + RLS. Сигнатуры и семантика функций повторяют Mock
 * (src/data/api.js), поэтому фасад api.js переключает слои без правок UI.
 *
 * Конфигурация — только через переменные окружения Vite (import.meta.env):
 *   VITE_SUPABASE_URL      — URL проекта Supabase (Settings → API → Project URL)
 *   VITE_SUPABASE_ANON_KEY — публичный anon-ключ; service_role ЗАПРЕЩЁН
 *
 * Схема БД (контракт ДЗ5, поля приходят в snake_case и маппятся в camelCase):
 *   habits:    id, user_id, title, emoji, color, created_at, archived_at
 *   check_ins: habit_id, user_id, date, created_at; PK (habit_id, date)
 *
 * Форматы на фронте (совпадают с Mock):
 *   Habit   = { id, title, emoji, color, createdAt, archivedAt }
 *   CheckIn = { habitId, date }
 *
 * Доменные коды ошибок (как в Mock, где применимо):
 *   'NETWORK' — сбой транспорта/сети; 'NOT_FOUND' — записи нет (или FK);
 *   'AUTH' — нет сессии; 'INVALID_DATA' — нарушение CHECK-ограничения БД;
 *   'NOT_CONFIGURED' — модуль используют напрямую без переменных окружения
 *   (через фасад api.js этот случай недостижим — там работает Mock).
 */

import { createClient } from '@supabase/supabase-js';

const HABITS_TABLE = 'habits';
const CHECK_INS_TABLE = 'check_ins';

/** Колонки привычки одним списком — без вложенных ресурсов PostgREST. */
const HABIT_COLUMNS = 'id,title,emoji,color,created_at,archived_at';

/** Ключ локального Mock-хранилища — тот же, что STORAGE_KEY в api.js. */
const MOCK_STORAGE_KEY = 'ht_mock_v1';

const TITLE_MAX_LENGTH = 40;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Коды PostgREST/PostgreSQL, переводимые в доменные ошибки. */
const PG_NOT_FOUND = 'PGRST116'; // .single(): затронуто 0 строк
const PG_UNIQUE_VIOLATION = '23505';
const PG_FK_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const HTTP_UNAUTHORIZED = 401;

/**
 * Безопасно читает переменные окружения Vite. В обычном Node (тесты,
 * self-check) import.meta.env отсутствует — тогда конфигурации нет и
 * фасад уходит в Mock-режим.
 * @returns {Object} объект env (возможно, пустой).
 */
function getEnv() {
  return import.meta.env ?? {};
}

/**
 * Проверяет, задана ли конфигурация Supabase переменными окружения.
 * @returns {boolean} true, если URL и anon-ключ непусты.
 */
export function isConfigured() {
  const env = getEnv();
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const urlLooksValid = typeof url === 'string' && /^https?:\/\//.test(url);
  return urlLooksValid && typeof anonKey === 'string' && anonKey.length > 0;
}

/** Единственный экземпляр клиента на страницу — создаётся лениво. */
let clientInstance = null;

/**
 * Возвращает клиент Supabase, при первом обращении создаёт его.
 * @returns {import('@supabase/supabase-js').SupabaseClient} клиент.
 * @throws {Error} 'NOT_CONFIGURED' — если переменные окружения не заданы.
 */
function requireClient() {
  if (!isConfigured()) {
    throw new Error('NOT_CONFIGURED');
  }
  if (clientInstance === null) {
    const env = getEnv();
    clientInstance = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // подхватывает токен из ссылки после подтверждения email/сброса пароля
        detectSessionInUrl: true,
      },
    });
  }
  return clientInstance;
}

/**
 * Дополняет число до двух знаков: 7 -> '07'.
 * @param {number} value число.
 * @returns {string} строка из двух цифр.
 */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Возвращает сегодняшнюю дату (локальное время) в формате 'YYYY-MM-DD'.
 * @returns {string} дата строкой.
 */
function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Проверяет название (1–40 символов после trim) и возвращает его очищенным —
 * та же валидация, что в Mock (api.js), чтобы ошибки не зависели от слоя.
 * @param {unknown} title сырое значение названия.
 * @returns {string} валидное название.
 * @throws {Error} если длина названия вне диапазона 1–40 символов.
 */
function assertValidTitle(title) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (trimmed.length < 1 || trimmed.length > TITLE_MAX_LENGTH) {
    throw new Error(`Название привычки должно быть от 1 до ${TITLE_MAX_LENGTH} символов`);
  }
  return trimmed;
}

/**
 * Приводит дату 'YYYY-MM-DD' к пригодному для БД виду; мусор заменяет на сегодня.
 * @param {unknown} value исходное значение даты.
 * @returns {string} дата 'YYYY-MM-DD'.
 */
function safeIsoDate(value) {
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value) ? value : todayIso();
}

/**
 * Маппит строку habits (snake_case) в модель фронтенда (camelCase).
 * @param {Object} row строка таблицы habits.
 * @returns {Object} Habit.
 */
function mapHabit(row) {
  return {
    id: row.id,
    title: row.title,
    emoji: row.emoji,
    color: row.color,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? null,
  };
}

/**
 * Маппит строку check_ins в модель фронтенда.
 * @param {Object} row строка таблицы check_ins.
 * @returns {Object} CheckIn.
 */
function mapCheckIn(row) {
  return { habitId: row.habit_id, date: row.date };
}

/**
 * Выделяет пользователя сессии в минимальную модель фронта.
 * @param {Object} user пользователь из Supabase Auth.
 * @returns {{id: string, email: null|string}} пользователь.
 */
function mapUser(user) {
  return { id: user.id, email: user.email ?? null };
}

/**
 * Проверяет, является ли ошибка сбоем транспорта (нет сети, DNS, CORS).
 * @param {Object|Error} error ошибка Supabase или исключение.
 * @returns {boolean} true для сетевых сбоев.
 */
function isTransportError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return error instanceof TypeError || /fetch|network|failed to fetch/i.test(message);
}

/**
 * Переводит ошибку запроса к данным в доменные коды приложения.
 * @param {Object|Error} error ошибка PostgREST/PostgreSQL или исключение.
 * @returns {Error} ошибка с кодом NETWORK / NOT_FOUND / AUTH / INVALID_DATA.
 */
function mapDataError(error) {
  if (error instanceof Error && error.message === 'NETWORK') {
    return error; // уже доменная — не заворачиваем повторно
  }
  const code = error?.code;
  if (code === PG_NOT_FOUND || code === PG_FK_VIOLATION) {
    return new Error('NOT_FOUND');
  }
  if (code === PG_CHECK_VIOLATION) {
    return new Error('INVALID_DATA');
  }
  if (error?.status === HTTP_UNAUTHORIZED) {
    return new Error('AUTH');
  }
  return new Error('NETWORK');
}

/**
 * Переводит ошибку Auth-операции: сбои сети — в 'NETWORK', остальные
 * (неверный пароль, занятый email) остаются с человекочитаемым текстом.
 * @param {Object|Error} error ошибка Supabase Auth.
 * @returns {Error} доменная ошибка.
 */
function mapAuthError(error) {
  if (isTransportError(error)) {
    return new Error('NETWORK');
  }
  return new Error(error?.message || 'AUTH_FAILED');
}

/**
 * Требует активную сессию для операции с данными.
 * @returns {Promise<Object>} сессия Supabase.
 * @throws {Error} 'AUTH' — если сессии нет; 'NETWORK' при сбое чтения.
 */
async function requireSession() {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw mapAuthError(error);
  }
  if (!data.session) {
    throw new Error('AUTH');
  }
  return data.session;
}

/**
 * Возвращает активные (не архивированные) привычки, сортировка по created_at
 * (id — вторичный ключ для детерминизма при одинаковых датах).
 * @returns {Promise<Array<Object>>} список активных привычек.
 * @throws {Error} 'AUTH' без сессии; 'NETWORK' при сбое сети.
 */
export async function fetchHabits() {
  const client = requireClient();
  await requireSession();
  const { data, error } = await client
    .from(HABITS_TABLE)
    .select(HABIT_COLUMNS)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    throw mapDataError(error);
  }
  return data.map(mapHabit);
}

/**
 * Возвращает все привычки, включая архивированные (для экрана «Профиль»).
 * @returns {Promise<Array<Object>>} полный список привычек.
 * @throws {Error} 'AUTH' без сессии; 'NETWORK' при сбое сети.
 */
export async function fetchAllHabits() {
  const client = requireClient();
  await requireSession();
  const { data, error } = await client
    .from(HABITS_TABLE)
    .select(HABIT_COLUMNS)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    throw mapDataError(error);
  }
  return data.map(mapHabit);
}

/**
 * Возвращает все отметки выполнения текущего пользователя.
 * @returns {Promise<Array<Object>>} список отметок.
 * @throws {Error} 'AUTH' без сессии; 'NETWORK' при сбое сети.
 */
export async function fetchCheckIns() {
  const client = requireClient();
  await requireSession();
  const { data, error } = await client
    .from(CHECK_INS_TABLE)
    .select('habit_id,date')
    .order('date', { ascending: true });
  if (error) {
    throw mapDataError(error);
  }
  return data.map(mapCheckIn);
}

/**
 * Создаёт новую активную привычку с сегодняшней датой создания.
 * user_id и created_at проставляет БД (defaults auth.uid() / current_date).
 * @param {Object} params данные привычки.
 * @param {string} params.title название (1–40 символов после trim).
 * @param {string} [params.emoji='🌱'] эмодзи-иконка.
 * @param {string} [params.color='#7C9883'] hex-цвет из палитры.
 * @returns {Promise<Object>} созданная привычка.
 * @throws {Error} при невалидном названии; 'AUTH' без сессии;
 *   'INVALID_DATA' при нарушении CHECK БД (например, формат цвета);
 *   'NETWORK' при сбое сети.
 */
export async function createHabit({ title, emoji = '🌱', color = '#7C9883' }) {
  const client = requireClient();
  const trimmedTitle = assertValidTitle(title);
  await requireSession();
  const { data, error } = await client
    .from(HABITS_TABLE)
    .insert({ title: trimmedTitle, emoji, color })
    .select(HABIT_COLUMNS)
    .single();
  if (error) {
    throw mapDataError(error);
  }
  return mapHabit(data);
}

/**
 * Частично обновляет привычку (title / emoji / color). Название, если пришло,
 * проходит ту же валидацию, что и при создании.
 * @param {string} id идентификатор привычки.
 * @param {Object} patch патч: подмножество полей title, emoji, color.
 * @returns {Promise<Object>} обновлённая привычка.
 * @throws {Error} 'NOT_FOUND' если привычки нет; при невалидном названии;
 *   'AUTH' без сессии; 'INVALID_DATA' при нарушении CHECK БД; 'NETWORK'.
 */
export async function updateHabit(id, patch = {}) {
  const client = requireClient();
  await requireSession();

  const columns = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    columns.title = assertValidTitle(patch.title);
  }
  if (patch.emoji !== undefined) {
    columns.emoji = patch.emoji;
  }
  if (patch.color !== undefined) {
    columns.color = patch.color;
  }

  // Пустой патч (как в Mock) — возвращаем текущее состояние без записи.
  if (Object.keys(columns).length === 0) {
    const current = await client
      .from(HABITS_TABLE)
      .select(HABIT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (current.error) {
      throw mapDataError(current.error);
    }
    if (!current.data) {
      throw new Error('NOT_FOUND');
    }
    return mapHabit(current.data);
  }

  const { data, error } = await client
    .from(HABITS_TABLE)
    .update(columns)
    .eq('id', id)
    .select(HABIT_COLUMNS)
    .single();
  if (error) {
    throw mapDataError(error); // PGRST116 (0 строк) -> NOT_FOUND
  }
  return mapHabit(data);
}

/**
 * Архивирует привычку: archived_at = сегодняшняя дата (локальное время).
 * @param {string} id идентификатор привычки.
 * @returns {Promise<Object>} архивированная привычка.
 * @throws {Error} 'NOT_FOUND' если привычки нет; 'AUTH'; 'NETWORK'.
 */
export async function archiveHabit(id) {
  const client = requireClient();
  await requireSession();
  const { data, error } = await client
    .from(HABITS_TABLE)
    .update({ archived_at: todayIso() })
    .eq('id', id)
    .select(HABIT_COLUMNS)
    .single();
  if (error) {
    throw mapDataError(error);
  }
  return mapHabit(data);
}

/**
 * Возвращает привычку из архива: archived_at = null.
 * @param {string} id идентификатор привычки.
 * @returns {Promise<Object>} восстановленная привычка.
 * @throws {Error} 'NOT_FOUND' если привычки нет; 'AUTH'; 'NETWORK'.
 */
export async function restoreHabit(id) {
  const client = requireClient();
  await requireSession();
  const { data, error } = await client
    .from(HABITS_TABLE)
    .update({ archived_at: null })
    .eq('id', id)
    .select(HABIT_COLUMNS)
    .single();
  if (error) {
    throw mapDataError(error);
  }
  return mapHabit(data);
}

/**
 * Переключает отметку выполнения за дату: добавляет, если её не было,
 * и снимает, если была (идемпотентный «тумблер» как в Mock).
 * @param {string} habitId идентификатор привычки.
 * @param {string} dateIso дата отметки в формате 'YYYY-MM-DD'.
 * @returns {Promise<{done: boolean}>} состояние отметки после переключения.
 * @throws {Error} 'NOT_FOUND' если привычки нет; 'AUTH' без сессии;
 *   'INVALID_DATA' если дата в будущем (CHECK date <= current_date); 'NETWORK'.
 */
export async function toggleCheckIn(habitId, dateIso) {
  const client = requireClient();
  await requireSession();

  // Семантика Mock: тумблер несуществующей привычки — ошибка NOT_FOUND.
  const habit = await client.from(HABITS_TABLE).select('id').eq('id', habitId).maybeSingle();
  if (habit.error) {
    throw mapDataError(habit.error);
  }
  if (!habit.data) {
    throw new Error('NOT_FOUND');
  }

  const existing = await client
    .from(CHECK_INS_TABLE)
    .select('habit_id,date')
    .eq('habit_id', habitId)
    .eq('date', dateIso)
    .maybeSingle();
  if (existing.error) {
    throw mapDataError(existing.error);
  }

  if (existing.data) {
    const removal = await client
      .from(CHECK_INS_TABLE)
      .delete()
      .eq('habit_id', habitId)
      .eq('date', dateIso);
    if (removal.error) {
      throw mapDataError(removal.error);
    }
    return { done: false };
  }

  const insertion = await client
    .from(CHECK_INS_TABLE)
    .insert({ habit_id: habitId, date: dateIso })
    .select('habit_id,date');
  if (insertion.error) {
    if (insertion.error.code === PG_UNIQUE_VIOLATION) {
      // Другой клиент успел поставить отметку между select и insert —
      // тумблер корректно завершаем снятием этой отметки.
      const removal = await client
        .from(CHECK_INS_TABLE)
        .delete()
        .eq('habit_id', habitId)
        .eq('date', dateIso);
      if (removal.error) {
        throw mapDataError(removal.error);
      }
      return { done: false };
    }
    throw mapDataError(insertion.error); // 23503 (нет привычки) -> NOT_FOUND
  }
  return { done: true };
}

/**
 * Регистрирует пользователя. Если в проекте включено подтверждение email,
 * сессии сразу нет — возвращается признак необходимости подтверждения.
 * @param {string} email адрес электронной почты.
 * @param {string} password пароль.
 * @returns {Promise<{user?: {id: string, email: null|string}, needsConfirmation?: boolean}>}
 *   объект пользователя или признак ожидания подтверждения email.
 * @throws {Error} 'NETWORK' при сбое сети; иначе ошибка с текстом Supabase.
 */
export async function signUp(email, password) {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw mapAuthError(error);
  }
  if (!data.session) {
    return { needsConfirmation: true };
  }
  return { user: mapUser(data.user) };
}

/**
 * Выполняет вход по email и паролю.
 * @param {string} email адрес электронной почты.
 * @param {string} password пароль.
 * @returns {Promise<{user: {id: string, email: null|string}}>} пользователь.
 * @throws {Error} 'NETWORK' при сбое сети; иначе ошибка с текстом Supabase
 *   (например, «Invalid login credentials»).
 */
export async function signIn(email, password) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw mapAuthError(error);
  }
  return { user: mapUser(data.user) };
}

/**
 * Завершает сессию текущего пользователя.
 * @returns {Promise<void>}
 * @throws {Error} 'NETWORK' при сбое сети; иначе ошибка с текстом Supabase.
 */
export async function signOut() {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) {
    throw mapAuthError(error);
  }
}

/**
 * Возвращает текущую сессию, если она есть (null — если нет).
 * @returns {Promise<null|{user: {id: string, email: null|string}}>} сессия.
 * @throws {Error} 'NETWORK' при сбое чтения хранилища сессии.
 */
export async function getSession() {
  const client = requireClient();
  try {
    const { data } = await client.auth.getSession();
    return data.session ? { user: mapUser(data.session.user) } : null;
  } catch (error) {
    throw mapAuthError(error);
  }
}

/**
 * Подписывается на смену состояния аутентификации. Supabase v2 присылает
 * первое событие INITIAL_SESSION сразу при подписке — отдельный «текущий»
 * вызов не нужен.
 * @param {Function} callback колбэк (session|null, event).
 * @returns {Function} функция отписки.
 * @throws {Error} 'NOT_CONFIGURED' при прямом использовании без конфигурации.
 */
export function onAuthChange(callback) {
  const client = requireClient();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(session ? { user: mapUser(session.user) } : null, event);
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Отправляет письмо для сброса пароля. Не раскрывает существование email
 * (ответ одинаковый в любом случае).
 * @param {string} email адрес электронной почты.
 * @returns {Promise<void>}
 * @throws {Error} 'NETWORK' при сбое сети; иначе ошибка с текстом Supabase.
 */
export async function requestPasswordReset(email) {
  const client = requireClient();
  const { error } = await client.auth.resetPasswordForEmail(email);
  if (error) {
    throw mapAuthError(error);
  }
}

/**
 * Возвращает идентификатор текущего пользователя (или null без сессии).
 * @returns {Promise<null|string>} uuid пользователя.
 * @throws {Error} 'NETWORK' при сбое чтения сессии.
 */
export async function getUserId() {
  const session = await getSession();
  return session === null ? null : session.user.id;
}

/**
 * Читает сырой JSON локального Mock-хранилища (ht_mock_v1).
 * @returns {null|string} содержимое ключа или null.
 */
function readMockRaw() {
  if (typeof localStorage === 'undefined') {
    return null; // Node (тесты) — in-memory кэш Mock недоступен извне
  }
  try {
    return localStorage.getItem(MOCK_STORAGE_KEY);
  } catch {
    return null; // приватный режим браузера — переносить нечего
  }
}

/** Удаляет ключ Mock-хранилища из localStorage. */
function removeMockKey() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(MOCK_STORAGE_KEY);
    } catch {
      // хранилище недоступно — ключ и так нигде не сохранён
    }
  }
}

/**
 * Переносит локальные Mock-данные в Supabase текущего пользователя:
 * создаёт привычки (с сохранением created_at и архивного статуса; id меняются,
 * так как в БД uuid), отмечает check_ins (дубли и будущие даты пропускает),
 * затем очищает localStorage-ключ Mock. Идентификаторы привычек в check_ins
 * перемаппиваются на новые uuid.
 * @returns {Promise<{habits: number, checkIns: number}>} число перенесённых
 *   привычек и отметок.
 * @throws {Error} 'AUTH' без сессии; 'NETWORK' при сбое сети на этапе отметок.
 */
export async function migrateLocalToCloud() {
  const client = requireClient();
  const session = await requireSession();

  const raw = readMockRaw();
  if (raw === null) {
    return { habits: 0, checkIns: 0 };
  }
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return { habits: 0, checkIns: 0 }; // повреждённые данные — нечего переносить
  }

  const localHabits = Array.isArray(state?.habits) ? state.habits : [];
  const localCheckIns = Array.isArray(state?.checkIns) ? state.checkIns : [];

  // id из Mock — не uuid: строим карту «старый id -> новый uuid» по мере вставки.
  const idMapping = new Map();
  let migratedHabits = 0;
  for (const habit of localHabits) {
    try {
      const { data, error } = await client
        .from(HABITS_TABLE)
        .insert({
          user_id: session.user.id,
          title: assertValidTitle(habit?.title),
          emoji: typeof habit?.emoji === 'string' ? habit.emoji : '🌱',
          color: typeof habit?.color === 'string' ? habit.color : '#7C9883',
          created_at: safeIsoDate(habit?.createdAt),
          archived_at:
            typeof habit?.archivedAt === 'string' && ISO_DATE_PATTERN.test(habit.archivedAt)
              ? habit.archivedAt
              : null,
        })
        .select('id')
        .single();
      if (error) {
        throw mapDataError(error);
      }
      idMapping.set(habit?.id, data.id);
      migratedHabits += 1;
    } catch (migrationError) {
      // Одна непригодная привычка не должна рушить перенос остальных.
      console.error('supabaseBackend: привычка не перенесена', habit?.id, migrationError);
    }
  }

  // Отметки: только для перенесённых привычек, без дублей и будущих дат
  // (CHECK date <= current_date в БД иначе отклонит всю пачку).
  const today = todayIso();
  const seen = new Set();
  const rows = [];
  localCheckIns.forEach((checkIn) => {
    const habitId = idMapping.get(checkIn?.habitId);
    const date = checkIn?.date;
    if (!habitId || typeof date !== 'string' || date > today) {
      return;
    }
    const dedupeKey = `${habitId}|${date}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    rows.push({ habit_id: habitId, user_id: session.user.id, date });
  });

  if (rows.length > 0) {
    // ignoreDuplicates: повторный перенос не упадёт на PK (habit_id, date).
    const { error } = await client.from(CHECK_INS_TABLE).insert(rows, { ignoreDuplicates: true });
    if (error) {
      throw mapDataError(error);
    }
  }

  removeMockKey();
  return { habits: migratedHabits, checkIns: rows.length };
}
