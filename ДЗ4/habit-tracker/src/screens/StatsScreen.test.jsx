// Тесты экрана StatsScreen (Vitest + Testing Library, jsdom) — интеграция
// с хуком useHabitsData и mock-API. Seed mock-API детерминирован относительно
// реального «сегодня», поэтому серии первой привычки («Утренняя зарядка»,
// 12 дней подряд включая сегодня) и «Медитации» (серия оборвана вчера,
// рекорд 5) известны заранее.

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StatsScreen from './StatsScreen.jsx';
import { clearMockError, setMockError } from '../data/api.js';

/** Ключ mock-хранилища — см. src/data/api.js (STORAGE_KEY). */
const STORAGE_KEY = 'ht_mock_v1';

const LOAD_ERROR = 'Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.';
const EMPTY_HINT = 'Отметьте привычку — здесь появится статистика';

describe('StatsScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    clearMockError();
  });

  it('после загрузки показывает чипы привычек и цифры серий', async () => {
    render(<StatsScreen />);
    const firstChip = await screen.findByRole('button', { name: /Утренняя зарядка/ });
    // По умолчанию выбрана первая привычка — чип активен.
    expect(firstChip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('текущая серия')).toBeTruthy();
    expect(screen.getByText('рекорд')).toBeTruthy();
    expect(screen.getByText('Эта неделя')).toBeTruthy();
    expect(screen.getByText(/Процент выполнения за месяц/)).toBeTruthy();
    // У seed-привычки «Утренняя зарядка» серия 12 дней подряд, включая сегодня.
    const figures = document.querySelectorAll('figure');
    expect(figures[0].textContent).toContain('12');
    // Шесть seed-привычек — шесть чипов-переключателей.
    expect(document.querySelectorAll('[aria-pressed]')).toHaveLength(6);
  });

  it('переключение чипа пересчитывает серии выбранной привычки', async () => {
    render(<StatsScreen />);
    await screen.findByRole('button', { name: /Утренняя зарядка/ });
    fireEvent.click(screen.getByRole('button', { name: /Медитация/ }));
    // «Медитация»: серия оборвана вчера — текущая 0, рекорд 5.
    const figures = document.querySelectorAll('figure');
    expect(figures[0].textContent).toContain('0');
    expect(figures[1].textContent).toContain('5');
    expect(
      screen.getByRole('button', { name: /Медитация/ }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: /Утренняя зарядка/ }).getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('ошибка загрузки — баннер с кнопкой повтора', async () => {
    setMockError(true);
    render(<StatsScreen />);
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByText('текущая серия')).toBeNull();
    setMockError(false);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('button', { name: /Утренняя зарядка/ })).toBeTruthy();
  });

  it('нет отметок — пустое состояние с подсказкой', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        habits: [
          {
            id: 'h1',
            title: 'Тест',
            emoji: '🌱',
            color: '#7C9883',
            createdAt: '2026-10-01',
            archivedAt: null,
          },
        ],
        checkIns: [],
      })
    );
    render(<StatsScreen />);
    expect(await screen.findByText(EMPTY_HINT)).toBeTruthy();
    expect(screen.queryByText('текущая серия')).toBeNull();
  });
});
