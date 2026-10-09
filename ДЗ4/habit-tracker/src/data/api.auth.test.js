import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  fetchHabits,
  getSession,
  getUserId,
  isCloudEnabled,
  migrateLocalToCloud,
  onAuthChange,
  requestPasswordReset,
  signIn,
  signInWithOAuth,
  signOut,
  signUp,
} from './api.js';

/*
 * Контракт фасада data/api.js в Mock-режиме (ДЗ5): переменные окружения
 * Supabase не заданы, поэтому весь интерфейс аутентификации и перенос данных
 * обязан отклоняться с Error('AUTH_UNSUPPORTED') — UI не должен думать,
 * что вход «просто работает». Data-функции при этом живут в Mock: приложение
 * полностью работоспособно без облака. Файл тестирует настоящий фасад
 * (без vi.mock) — env надёжно очищен через vi.stubEnv.
 */

beforeAll(() => {
  // Пустые строки = переменные заданы, но falsy: cloud-режим выключен.
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('api.js — фасад в Mock-режиме (env не задан)', () => {
  it('isCloudEnabled возвращает false без конфигурации Supabase', () => {
    expect(isCloudEnabled()).toBe(false);
  });

  it.each([
    ['signUp', () => signUp('user@mail.ru', 'longpassword')],
    ['signIn', () => signIn('user@mail.ru', 'longpassword')],
    ['signInWithOAuth', () => signInWithOAuth('google')],
    ['signOut', () => signOut()],
    ['getSession', () => getSession()],
    ['requestPasswordReset', () => requestPasswordReset('user@mail.ru')],
    ['getUserId', () => getUserId()],
    ['migrateLocalToCloud', () => migrateLocalToCloud()],
  ])('%s отклоняется с AUTH_UNSUPPORTED', async (_, invoke) => {
    await expect(invoke()).rejects.toThrow('AUTH_UNSUPPORTED');
  });

  it('onAuthChange кидает AUTH_UNSUPPORTED синхронно', () => {
    expect(() => onAuthChange(vi.fn())).toThrow('AUTH_UNSUPPORTED');
  });

  it('data-функции работают: fetchHabits возвращает массив привычек', async () => {
    const habits = await fetchHabits();
    expect(Array.isArray(habits)).toBe(true);
    expect(habits.length).toBeGreaterThan(0);
    expect(habits[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      archivedAt: null,
    });
  });
});
