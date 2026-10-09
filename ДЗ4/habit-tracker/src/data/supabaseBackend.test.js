import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHabit,
  fetchHabits,
  isConfigured,
  migrateLocalToCloud,
  signIn,
  toggleCheckIn,
  updateHabit,
} from './supabaseBackend.js';

/*
 * Тесты маппинга ошибок облака (ДЗ5): коды PostgREST/PostgreSQL и сбои
 * транспорта переводятся в доменные коды приложения (NETWORK / NOT_FOUND /
 * AUTH / INVALID_DATA), а гонка отметок 23505 завершается удалением.
 * @supabase/supabase-js замокан клиент-фабрикой: createClient отдаёт один
 * управляемый стаб, from() раздаёт цепочки-заглушки с результатами из очереди
 * (порядок — как в коде бэкенда). import.meta.env перекрыт vi.stubEnv.
 */

const stubClient = vi.hoisted(() => ({
  from: vi.fn(),
  auth: {
    getSession: vi.fn(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => stubClient),
}));

/** Успешная сессия — ответ auth.getSession для requireSession. */
const SESSION_OK = {
  data: { session: { user: { id: 'user-1', email: 'user@mail.ru' } } },
  error: null,
};

/** Нейтральный ответ цепочки, если тест не положил свой в очередь. */
const EMPTY_RESULT = { data: null, error: null };

/**
 * Строит заглушку PostgREST-цепочки: методы-фильтры возвращают сам билдер,
 * await (then) и .single()/.maybeSingle() отдают подставленный результат.
 * Один билдер = один вызов from(...) — результат привязан к цепочке целиком.
 *
 * @param {Object} result ответ { data, error } для этой цепочки.
 * @returns {Object} билдер-заглушка.
 */
function makeBuilder(result) {
  const builder = {};
  ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'order'].forEach((method) => {
    builder[method] = vi.fn(() => builder);
  });
  const settled = Promise.resolve(result);
  builder.single = vi.fn(() => settled);
  builder.maybeSingle = vi.fn(() => settled);
  builder.then = (onFulfilled, onRejected) => settled.then(onFulfilled, onRejected);
  return builder;
}

/** Очередь результатов: каждый новый from(...) забирает следующий элемент. */
const results = [];
/** Созданные цепочки — для утверждений о вызовах insert/delete по порядку. */
const chains = [];

/** Вчерашняя дата 'YYYY-MM-DD' — безопасно прошлая для CHECK date <= today. */
function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

beforeAll(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://stub-project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'stub-anon-key');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.resetAllMocks();
  results.length = 0;
  chains.length = 0;
  stubClient.from.mockImplementation(() => {
    const builder = makeBuilder(results.length > 0 ? results.shift() : EMPTY_RESULT);
    chains.push(builder);
    return builder;
  });
  stubClient.auth.getSession.mockResolvedValue(SESSION_OK);
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('supabaseBackend — маппинг ошибок облака', () => {
  it('isConfigured видит заданные env-переменные', () => {
    expect(isConfigured()).toBe(true);
  });

  it('PGRST116 у .single() превращается в NOT_FOUND (обновление несуществующей)', async () => {
    results.push({ data: null, error: { code: 'PGRST116', message: '0 rows' } });

    await expect(updateHabit('habit-404', { title: 'Новое название' })).rejects.toThrow(
      'NOT_FOUND'
    );
  });

  it('23503 (нарушение FK) превращается в NOT_FOUND', async () => {
    results.push({ data: null, error: { code: '23503', message: 'violates foreign key' } });

    await expect(createHabit({ title: 'Чтение' })).rejects.toThrow('NOT_FOUND');
  });

  it('23514 (нарушение CHECK) превращается в INVALID_DATA', async () => {
    results.push({ data: null, error: { code: '23514', message: 'violates check constraint' } });

    await expect(createHabit({ title: 'Бег' })).rejects.toThrow('INVALID_DATA');
  });

  it('HTTP 401 превращается в AUTH', async () => {
    results.push({ data: null, error: { status: 401, message: 'JWT expired' } });

    await expect(fetchHabits()).rejects.toThrow('AUTH');
  });

  it('транспортный сбой Auth превращается в NETWORK', async () => {
    // как реальный supabase-js: сбой fetch возвращается в поле error, не бросается
    stubClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthFetchError', message: 'fetch failed' },
    });

    await expect(signIn('user@mail.ru', 'longpassword')).rejects.toThrow('NETWORK');
    expect(stubClient.from).not.toHaveBeenCalled();
  });

  it('транспортный сбой запроса данных (без кода и статуса) превращается в NETWORK', async () => {
    results.push({ data: null, error: { message: 'TypeError: fetch failed' } });

    await expect(fetchHabits()).rejects.toThrow('NETWORK');
  });

  it('пустая сессия даёт AUTH до какого-либо запроса к таблицам', async () => {
    stubClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(fetchHabits()).rejects.toThrow('AUTH');
    expect(stubClient.from).not.toHaveBeenCalled();
  });

  it('toggleCheckIn без существующей отметки завершается { done: true }', async () => {
    const date = isoDaysAgo(1);
    results.push({ data: { id: 'habit-1' }, error: null }); // привычка найдена
    results.push({ data: null, error: null }); // отметки ещё нет
    results.push({ data: [{ habit_id: 'habit-1', date }], error: null }); // insert

    await expect(toggleCheckIn('habit-1', date)).resolves.toEqual({ done: true });
    expect(chains[2].insert).toHaveBeenCalledWith({ habit_id: 'habit-1', date });
  });

  it('гонка 23505 в toggleCheckIn завершается удалением отметки и { done: false }', async () => {
    const date = isoDaysAgo(1);
    results.push({ data: { id: 'habit-1' }, error: null }); // привычка найдена
    results.push({ data: null, error: null }); // select отметки: ещё нет
    // другой клиент успел вставить отметку между select и insert
    results.push({ data: null, error: { code: '23505', message: 'duplicate key' } });
    results.push({ data: null, error: null }); // удаление «чужой» отметки

    await expect(toggleCheckIn('habit-1', date)).resolves.toEqual({ done: false });
    expect(chains[2].insert).toHaveBeenCalled();
    expect(chains[3].delete).toHaveBeenCalled();
    expect(chains[3].eq).toHaveBeenCalledWith('date', date);
  });

  it('fetchHabits маппит строки snake_case в модель camelCase', async () => {
    results.push({
      data: [
        {
          id: 'uuid-1',
          title: 'Зарядка',
          emoji: '💪',
          color: '#7C9883',
          created_at: '2026-09-01',
          archived_at: null,
        },
      ],
      error: null,
    });

    await expect(fetchHabits()).resolves.toEqual([
      {
        id: 'uuid-1',
        title: 'Зарядка',
        emoji: '💪',
        color: '#7C9883',
        createdAt: '2026-09-01',
        archivedAt: null,
      },
    ]);
  });

  it('migrateLocalToCloud переносит привычки и отметки, ids перемаппливаются', async () => {
    const date = isoDaysAgo(1);
    localStorage.setItem(
      'ht_mock_v1',
      JSON.stringify({
        habits: [
          {
            id: 'local-1',
            title: 'Зарядка',
            emoji: '💪',
            color: '#7C9883',
            createdAt: '2026-09-01',
            archivedAt: null,
          },
        ],
        checkIns: [{ habitId: 'local-1', date }],
      })
    );
    results.push({ data: { id: 'uuid-new' }, error: null }); // insert привычки
    results.push({ data: null, error: null }); // пачка отметок

    await expect(migrateLocalToCloud()).resolves.toEqual({ habits: 1, checkIns: 1 });
    expect(chains[1].insert).toHaveBeenCalledWith(
      [{ habit_id: 'uuid-new', user_id: 'user-1', date }],
      { ignoreDuplicates: true }
    );
    expect(localStorage.getItem('ht_mock_v1')).toBeNull();
  });
});
