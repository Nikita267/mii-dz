/*
 * Mock-слой данных «Трекера привычек»: эмуляция сетевого API (асинхронность,
 * задержки 150–400 мс, ошибки сети) поверх localStorage.
 * В ДЗ5 будет заменён на Supabase — сигнатуры функций подобраны под будущий API.
 *
 * Форматы данных (совпадают с будущей схемой Supabase):
 *   Habit   = { id, title, emoji, color, createdAt: 'YYYY-MM-DD',
 *               archivedAt: null | 'YYYY-MM-DD' }
 *   CheckIn = { habitId, date: 'YYYY-MM-DD' }
 *
 * @typedef {Object} Habit
 * @property {string} id уникальный идентификатор.
 * @property {string} title название (1–40 символов после trim).
 * @property {string} emoji эмодзи-иконка.
 * @property {string} color hex-цвет из палитры Концепции 1.
 * @property {string} createdAt дата создания, 'YYYY-MM-DD'.
 * @property {null|string} archivedAt дата архивации или null для активной.
 *
 * @typedef {Object} CheckIn
 * @property {string} habitId идентификатор привычки.
 * @property {string} date дата отметки, 'YYYY-MM-DD'.
 */

const STORAGE_KEY = 'ht_mock_v1';
const ERROR_FLAG_KEY = 'ht_mock_error';
const DELAY_MIN_MS = 150;
const DELAY_MAX_MS = 400;
const TITLE_MAX_LENGTH = 40;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Окно истории отметок для seed-данных — последние 21 день. */
const HISTORY_WINDOW_DAYS = 21;

/*
 * localStorage отсутствует в Node (тесты, self-check), поэтому на этот случай
 * держим in-memory хранилище с тем же интерфейсом «ключ-значение».
 */
const memoryStorage = new Map();

/**
 * Читает значение ключа из localStorage с fallback-ом в память.
 * @param {string} key ключ.
 * @returns {null|string} значение или null, если ключа нет.
 */
function readRaw(key) {
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {
      // хранилище недоступно (приватный режим) — уходим в fallback ниже
    }
  }
  return memoryStorage.has(key) ? memoryStorage.get(key) : null;
}

/**
 * Записывает значение ключа в localStorage, при невозможности — в память.
 * @param {string} key ключ.
 * @param {string} value значение.
 * @returns {void}
 */
function writeRaw(key, value) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {
      // см. readRaw
    }
  }
  memoryStorage.set(key, value);
}

/**
 * Удаляет ключ из обоих хранилищ.
 * @param {string} key ключ.
 * @returns {void}
 */
function removeRaw(key) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      // см. readRaw
    }
  }
  memoryStorage.delete(key);
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
function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Сдвигает дату 'YYYY-MM-DD' на заданное число дней. Арифметика — через
 * UTC-полночь и полный объект Date: без переходов на летнее время и поясов.
 * @param {string} isoDate исходная дата 'YYYY-MM-DD'.
 * @param {number} days сдвиг в днях (может быть отрицательным).
 * @returns {string} новая дата 'YYYY-MM-DD'.
 */
function shiftDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const shiftedMs = Date.UTC(year, month - 1, day) + days * MS_PER_DAY;
  return new Date(shiftedMs).toISOString().slice(0, 10);
}

/**
 * Строит список офсетов «дней назад» для серии отметок.
 * @param {number} startDaysAgo сколько дней назад — начало серии (0 = сегодня).
 * @param {number} count длина серии.
 * @param {Array<number>} [skipDaysAgo] офсеты, которые нужно пропустить.
 * @returns {Array<number>} офсеты дней относительно сегодня.
 */
function streakDaysAgo(startDaysAgo, count, skipDaysAgo = []) {
  const offsets = [];
  for (let i = 0; i < count; i += 1) {
    const ago = startDaysAgo + i;
    if (!skipDaysAgo.includes(ago)) offsets.push(ago);
  }
  return offsets;
}

/*
 * Seed-массив: 6 привычек с паттернами серий, заданными офсетами от сегодня.
 * Благодаря этому генерация детерминирована — зависит только от текущей даты,
 * а не от момента запуска или случайных чисел.
 */
const SEED_HABITS = [
  {
    id: 'habit-seed-1',
    title: 'Утренняя зарядка',
    emoji: '💪',
    color: '#7C9883', // шалфей — токен sage из дизайн-системы
    createdDaysAgo: 11,
    markDaysAgo: streakDaysAgo(0, 12), // серия 12 дней подряд, включая сегодня
  },
  {
    id: 'habit-seed-2',
    title: 'Пить 2 л воды',
    emoji: '💧',
    color: '#C97B5D', // терракота
    createdDaysAgo: 20,
    // рекордная история на весь 21-дневный период, единственный пропуск — 3 дня назад
    markDaysAgo: streakDaysAgo(0, HISTORY_WINDOW_DAYS, [3]),
  },
  {
    id: 'habit-seed-3',
    title: 'Чтение 30 минут',
    emoji: '📖',
    color: '#7B8FA6', // пыльно-синий
    createdDaysAgo: 4,
    markDaysAgo: streakDaysAgo(0, 5), // серия 5 дней, включая сегодня
  },
  {
    id: 'habit-seed-4',
    title: 'Медитация',
    emoji: '🧘',
    color: '#C9A227', // горчица
    createdDaysAgo: 6,
    markDaysAgo: streakDaysAgo(2, 5), // серия 5 дней, оборванная вчера
  },
  {
    id: 'habit-seed-5',
    title: 'Без сахара',
    emoji: '🚫🍬',
    color: '#C98B9A', // розовый
    createdDaysAgo: 1,
    markDaysAgo: streakDaysAgo(0, 2), // серия 2 дня: вчера и сегодня
  },
  {
    id: 'habit-seed-6',
    title: 'Отбой до 23:00',
    emoji: '😴',
    color: '#8B7FA6', // серо-фиолетовый
    createdDaysAgo: 2,
    markDaysAgo: [], // «новая» привычка — отметок ещё нет
  },
];

/**
 * Собирает начальное состояние: 6 привычек и отметки за последние 21 день.
 * @returns {{habits: Array<Habit>, checkIns: Array<CheckIn>}} состояние хранилища.
 */
function buildSeedState() {
  const today = todayString();
  const habits = [];
  const checkIns = [];
  SEED_HABITS.forEach((spec) => {
    habits.push({
      id: spec.id,
      title: spec.title,
      emoji: spec.emoji,
      color: spec.color,
      createdAt: shiftDays(today, -spec.createdDaysAgo),
      archivedAt: null,
    });
    spec.markDaysAgo.forEach((ago) => {
      checkIns.push({ habitId: spec.id, date: shiftDays(today, -ago) });
    });
  });
  return { habits, checkIns };
}

/**
 * Сохраняет состояние в хранилище.
 * @param {{habits: Array<Habit>, checkIns: Array<CheckIn>}} state состояние.
 * @returns {void}
 */
function persistState(state) {
  writeRaw(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Загружает состояние; при первом запуске (или повреждённом JSON) создаёт и
 * сохраняет seed. JSON.parse при каждом вызове отдаёт независимую копию —
 * вызывающий код не мутирует хранилище неявно.
 * @returns {{habits: Array<Habit>, checkIns: Array<CheckIn>}} состояние хранилища.
 */
function loadState() {
  const raw = readRaw(STORAGE_KEY);
  if (raw !== null) {
    try {
      return JSON.parse(raw);
    } catch {
      // повреждённые данные — пересоздаём из seed ниже
    }
  }
  const fresh = buildSeedState();
  persistState(fresh);
  return fresh;
}

/**
 * Случайная задержка в диапазоне [DELAY_MIN_MS, DELAY_MAX_MS).
 * @returns {number} задержка в миллисекундах.
 */
function randomDelayMs() {
  return DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
}

/**
 * Общая оболочка «сетевого запроса»: пауза 150–400 мс, затем проверка
 * демонстрационного флага ошибки. С неё начинается каждый публичный метод.
 * @returns {Promise<void>}
 * @throws {Error} 'NETWORK' — если включён режим ошибки (ht_mock_error = '1').
 */
async function simulateNetwork() {
  await new Promise((resolve) => setTimeout(resolve, randomDelayMs()));
  if (readRaw(ERROR_FLAG_KEY) === '1') {
    throw new Error('NETWORK');
  }
}

/** Счётчик для генерации идентификаторов в рамках сессии. */
let idCounter = 0;

/**
 * Генерирует идентификатор новой привычки (время + счётчик — без зависимостей).
 * @returns {string} уникальный идентификатор.
 */
function generateId() {
  idCounter += 1;
  return `habit-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/**
 * Обрезает пробелы названия; не-строка считается пустой.
 * @param {unknown} title сырое значение названия.
 * @returns {string} название после trim.
 */
function normalizeTitle(title) {
  return typeof title === 'string' ? title.trim() : '';
}

/**
 * Проверяет название (1–40 символов после trim) и возвращает его очищенным.
 * @param {unknown} title сырое значение названия.
 * @returns {string} валидное название.
 * @throws {Error} если длина названия вне диапазона 1–40 символов.
 */
function assertValidTitle(title) {
  const trimmed = normalizeTitle(title);
  if (trimmed.length < 1 || trimmed.length > TITLE_MAX_LENGTH) {
    throw new Error(`Название привычки должно быть от 1 до ${TITLE_MAX_LENGTH} символов`);
  }
  return trimmed;
}

/**
 * Ищет привычку по идентификатору.
 * @param {{habits: Array<Habit>}} state состояние хранилища.
 * @param {string} id идентификатор привычки.
 * @returns {Habit|undefined} найденная привычка или undefined.
 */
function findHabit(state, id) {
  return state.habits.find((habit) => habit.id === id);
}

/**
 * Возвращает активные (не архивированные) привычки.
 * @returns {Promise<Array<Habit>>} список активных привычек.
 * @throws {Error} 'NETWORK' — если включён демонстрационный режим ошибки.
 */
export async function fetchHabits() {
  await simulateNetwork();
  const state = loadState();
  return state.habits.filter((habit) => habit.archivedAt === null);
}

/**
 * Возвращает все привычки, включая архивированные (для экрана «Профиль»).
 * @returns {Promise<Array<Habit>>} полный список привычек.
 * @throws {Error} 'NETWORK' — если включён демонстрационный режим ошибки.
 */
export async function fetchAllHabits() {
  await simulateNetwork();
  return loadState().habits;
}

/**
 * Возвращает все отметки выполнения.
 * @returns {Promise<Array<CheckIn>>} список отметок.
 * @throws {Error} 'NETWORK' — если включён демонстрационный режим ошибки.
 */
export async function fetchCheckIns() {
  await simulateNetwork();
  return loadState().checkIns;
}

/**
 * Создаёт новую активную привычку с сегодняшней датой создания.
 * @param {Object} params данные привычки.
 * @param {string} params.title название (1–40 символов после trim).
 * @param {string} [params.emoji='🌱'] эмодзи-иконка.
 * @param {string} [params.color='#7C9883'] hex-цвет из палитры.
 * @returns {Promise<Habit>} созданная привычка.
 * @throws {Error} при невалидном названии или режиме ошибки сети.
 */
export async function createHabit({ title, emoji = '🌱', color = '#7C9883' }) {
  await simulateNetwork();
  const trimmedTitle = assertValidTitle(title);
  const state = loadState();
  const habit = {
    id: generateId(),
    title: trimmedTitle,
    emoji,
    color,
    createdAt: todayString(),
    archivedAt: null,
  };
  state.habits.push(habit);
  persistState(state);
  return habit;
}

/**
 * Частично обновляет привычку (title / emoji / color). Название, если пришло,
 * проходит ту же валидацию, что и при создании, — данные не могут «протухнуть».
 * @param {string} id идентификатор привычки.
 * @param {Object} patch патч: подмножество полей title, emoji, color.
 * @returns {Promise<Habit>} обновлённая привычка.
 * @throws {Error} 'NOT_FOUND' если привычки нет; Error при невалидном названии
 *   или режиме ошибки сети.
 */
export async function updateHabit(id, patch = {}) {
  await simulateNetwork();
  const state = loadState();
  const habit = findHabit(state, id);
  if (!habit) {
    throw new Error('NOT_FOUND');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    habit.title = assertValidTitle(patch.title);
  }
  if (patch.emoji !== undefined) {
    habit.emoji = patch.emoji;
  }
  if (patch.color !== undefined) {
    habit.color = patch.color;
  }
  persistState(state);
  return habit;
}

/**
 * Архивирует привычку: ставит archivedAt = сегодняшняя дата.
 * @param {string} id идентификатор привычки.
 * @returns {Promise<Habit>} архивированная привычка.
 * @throws {Error} 'NOT_FOUND' если привычки нет; 'NETWORK' в режиме ошибки.
 */
export async function archiveHabit(id) {
  await simulateNetwork();
  const state = loadState();
  const habit = findHabit(state, id);
  if (!habit) {
    throw new Error('NOT_FOUND');
  }
  habit.archivedAt = todayString();
  persistState(state);
  return habit;
}

/**
 * Возвращает привычку из архива: archivedAt = null.
 * @param {string} id идентификатор привычки.
 * @returns {Promise<Habit>} восстановленная привычка.
 * @throws {Error} 'NOT_FOUND' если привычки нет; 'NETWORK' в режиме ошибки.
 */
export async function restoreHabit(id) {
  await simulateNetwork();
  const state = loadState();
  const habit = findHabit(state, id);
  if (!habit) {
    throw new Error('NOT_FOUND');
  }
  habit.archivedAt = null;
  persistState(state);
  return habit;
}

/**
 * Переключает отметку выполнения за дату: добавляет, если её не было,
 * и снимает, если была (идемпотентный «тумблер» как в реальном API).
 * @param {string} habitId идентификатор привычки.
 * @param {string} date дата отметки в формате 'YYYY-MM-DD'.
 * @returns {Promise<{done: boolean}>} состояние отметки после переключения.
 * @throws {Error} 'NOT_FOUND' если привычки нет; 'NETWORK' в режиме ошибки.
 */
export async function toggleCheckIn(habitId, date) {
  await simulateNetwork();
  const state = loadState();
  const habit = findHabit(state, habitId);
  if (!habit) {
    throw new Error('NOT_FOUND');
  }
  const index = state.checkIns.findIndex(
    (checkIn) => checkIn.habitId === habitId && checkIn.date === date
  );
  let done;
  if (index === -1) {
    state.checkIns.push({ habitId, date });
    done = true;
  } else {
    state.checkIns.splice(index, 1);
    done = false;
  }
  persistState(state);
  return { done };
}

/**
 * Включает или выключает демонстрационный режим ошибки (для тестов error-состояний UI).
 * @param {boolean} flag true — все запросы отклоняются с Error('NETWORK').
 * @returns {void}
 */
export function setMockError(flag) {
  if (flag) {
    writeRaw(ERROR_FLAG_KEY, '1');
  } else {
    removeRaw(ERROR_FLAG_KEY);
  }
}

/**
 * Сбрасывает демонстрационный режим ошибки.
 * @returns {void}
 */
export function clearMockError() {
  removeRaw(ERROR_FLAG_KEY);
}
