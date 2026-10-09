import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { clearMockError, setMockError } from '../data/api.js';
import useHabitsData from './useHabitsData.js';

/*
 * Тесты хука useHabitsData: параллельная загрузка, оптимистичная отметка,
 * откат при сбое сети, восстановление reload-ом. Данные идут через mock-api
 * (localStorage jsdom); сбой сети включается флагом setMockError.
 */

/** Ожидаемое «сегодня» — тем же способом, что и в хуке. */
function expectedToday() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Есть ли отметка привычки за дату — зеркало предиката хука. */
function isMarked(checkIns, habitId, date) {
  return checkIns.some((checkIn) => checkIn.habitId === habitId && checkIn.date === date);
}

describe('useHabitsData', () => {
  afterEach(() => {
    clearMockError();
  });

  it('загружает привычки и отметки параллельно и отдаёт локальное «сегодня»', async () => {
    const { result } = renderHook(() => useHabitsData());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.habits.length).toBeGreaterThan(0);
    expect(result.current.checkIns.length).toBeGreaterThan(0);
    expect(result.current.localToday).toBe(expectedToday());
  });

  it('toggle оптимистично отмечает привычку без отметок и подтверждает сервером', async () => {
    const { result } = renderHook(() => useHabitsData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Seed-привычка «Отбой до 23:00» (habit-seed-6) создана без отметок.
    const today = result.current.localToday;
    expect(isMarked(result.current.checkIns, 'habit-seed-6', today)).toBe(false);

    let outcome;
    await act(async () => {
      outcome = await result.current.toggle('habit-seed-6');
    });

    expect(outcome).toBe(true);
    expect(isMarked(result.current.checkIns, 'habit-seed-6', today)).toBe(true);
    expect(result.current.pendingId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('toggle при сбое сети откатывает отметку и возвращает null', async () => {
    const { result } = renderHook(() => useHabitsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Данные уже загружены; сеть «падает» только в момент сохранения отметки.
    setMockError(true);

    const anyHabit = result.current.habits[0];
    const today = result.current.localToday;
    const wasDone = isMarked(result.current.checkIns, anyHabit.id, today);
    const marksBefore = result.current.checkIns.length;

    let outcome;
    await act(async () => {
      outcome = await result.current.toggle(anyHabit.id);
    });

    expect(outcome).toBeNull();
    expect(result.current.error).toContain('Не удалось сохранить отметку');
    expect(isMarked(result.current.checkIns, anyHabit.id, today)).toBe(wasDone);
    expect(result.current.checkIns).toHaveLength(marksBefore);
    expect(result.current.pendingId).toBeNull();
  });

  it('после ошибки загрузки reload восстанавливает данные', async () => {
    setMockError(true);
    const { result } = renderHook(() => useHabitsData());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.habits).toHaveLength(0);

    clearMockError();
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.habits.length).toBeGreaterThan(0);
  });
});
