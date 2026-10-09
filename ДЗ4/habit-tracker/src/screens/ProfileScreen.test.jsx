import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileScreen from './ProfileScreen.jsx';
import {
  archiveHabit,
  fetchAllHabits,
  fetchCheckIns,
  restoreHabit,
  updateHabit,
} from '../data/api.js';
import { formatDayMonth } from '../utils/format.js';

/*
 * Тесты экрана «Профиль»: состояния загрузки/ошибки, список активных привычек
 * с сериями, подтверждение архивации (FR-17..FR-19), восстановление (FR-23)
 * и редактирование через HabitDialog. data/api.js подменён моком —
 * тестируется поведение экрана, а не mock-хранилище.
 */

vi.mock('../data/api.js', () => ({
  archiveHabit: vi.fn(),
  fetchAllHabits: vi.fn(),
  fetchCheckIns: vi.fn(),
  restoreHabit: vi.fn(),
  updateHabit: vi.fn(),
}));

/** Локальная дата N дней назад строкой 'YYYY-MM-DD' — как видит её экран. */
function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Ожидаемая подпись даты «с 5 октября» для N дней назад. */
function dayMonthDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDayMonth(date);
}

const HABITS = [
  {
    id: 'h1',
    title: 'Утренняя зарядка',
    emoji: '💪',
    color: '#7C9883',
    createdAt: isoDaysAgo(10),
    archivedAt: null,
  },
  {
    id: 'h2',
    title: 'Новичок',
    emoji: '💧',
    color: '#5B8DB9',
    createdAt: isoDaysAgo(1),
    archivedAt: null,
  },
  {
    id: 'h3',
    title: 'Отбой до 23:00',
    emoji: '😴',
    color: '#8E82BC',
    createdAt: isoDaysAgo(20),
    archivedAt: isoDaysAgo(2),
  },
];

const CHECK_INS = [
  { habitId: 'h1', date: isoDaysAgo(1) },
  { habitId: 'h1', date: isoDaysAgo(0) },
];

/** Каркас строки привычки — статья вокруг заголовка с названием. */
function rowOf(title) {
  return screen.getByText(title).closest('article');
}

beforeEach(() => {
  vi.clearAllMocks();
  archiveHabit.mockResolvedValue(HABITS[0]);
  restoreHabit.mockResolvedValue(HABITS[2]);
  updateHabit.mockResolvedValue(HABITS[0]);
});

describe('ProfileScreen — загрузка данных', () => {
  it('показывает состояние загрузки, пока запрос в полёте', () => {
    fetchAllHabits.mockReturnValue(new Promise(() => {}));
    fetchCheckIns.mockResolvedValue([]);

    render(<ProfileScreen />);

    expect(screen.getByRole('status').textContent).toContain('Загрузка привычек');
    expect(screen.queryByText('Утренняя зарядка')).toBeNull();
  });

  it('после ошибки показывает баннер, повтор загружает список', async () => {
    fetchAllHabits
      .mockRejectedValueOnce(new Error('NETWORK'))
      .mockResolvedValue(HABITS);
    fetchCheckIns.mockResolvedValue(CHECK_INS);

    render(<ProfileScreen />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Не удалось загрузить привычки');

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Утренняя зарядка')).toBeTruthy();
  });
});

describe('ProfileScreen — активные привычки', () => {
  beforeEach(() => {
    fetchAllHabits.mockResolvedValue(HABITS);
    fetchCheckIns.mockResolvedValue(CHECK_INS);
  });

  it('рисует дату создания, серию и пометку «новая» (FR-26)', async () => {
    render(<ProfileScreen />);

    expect(await screen.findByText('Утренняя зарядка')).toBeTruthy();
    // отметки вчера и сегодня -> серия 2 дня
    expect(screen.getByText('🔥 2 дня')).toBeTruthy();
    // привычка, созданная вчера без отметок, — «новая», а не «нет серии»
    expect(screen.getByText('новая')).toBeTruthy();
    expect(screen.getByText(`с ${dayMonthDaysAgo(10)}`)).toBeTruthy();
    // архивная привычка живёт только внутри свёрнутого раздела «Архив»,
    // а не в списке активных (содержимое details смонтировано, но скрыто)
    const archivedTitle = screen.getByText('Отбой до 23:00');
    expect(archivedTitle.closest('details')).not.toBeNull();
    expect(rowOf('Утренняя зарядка').closest('ul').contains(archivedTitle)).toBe(false);
  });

  it('архивация требует подтверждения; отмена не меняет данные (FR-17/FR-19)', async () => {
    const user = userEvent.setup();
    render(<ProfileScreen />);
    await screen.findByText('Утренняя зарядка');

    await user.click(within(rowOf('Утренняя зарядка')).getByRole('button', { name: 'В архив' }));

    expect(
      screen.getByText('Вклад привычки в статистику и календарь за прошедшие дни сохранится')
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(archiveHabit).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Вклад привычки в статистику и календарь за прошедшие дни сохранится')
    ).toBeNull();
  });

  it('подтверждение архивации вызывает archiveHabit и перезагружает список', async () => {
    const user = userEvent.setup();
    render(<ProfileScreen />);
    await screen.findByText('Утренняя зарядка');

    await user.click(within(rowOf('Утренняя зарядка')).getByRole('button', { name: 'В архив' }));
    await user.click(screen.getByRole('button', { name: 'Архивировать' }));

    expect(archiveHabit).toHaveBeenCalledWith('h1');
    // начальная загрузка + перезагрузка после мутации
    await vi.waitFor(() => expect(fetchAllHabits).toHaveBeenCalledTimes(2));
  });
});

describe('ProfileScreen — архив', () => {
  beforeEach(() => {
    fetchAllHabits.mockResolvedValue(HABITS);
    fetchCheckIns.mockResolvedValue(CHECK_INS);
  });

  it('показывает счётчик архива и восстанавливает привычку (FR-23)', async () => {
    const user = userEvent.setup();
    render(<ProfileScreen />);
    await screen.findByText('Утренняя зарядка');

    expect(screen.getByText('Архив · 1')).toBeTruthy();

    await user.click(screen.getByText('Архив · 1'));
    await user.click(screen.getByRole('button', { name: 'Восстановить' }));

    expect(restoreHabit).toHaveBeenCalledWith('h3');
    await vi.waitFor(() => expect(fetchAllHabits).toHaveBeenCalledTimes(2));
  });

  it('редактирование открывает диалог с текущими значениями и сохраняет', async () => {
    const user = userEvent.setup();
    render(<ProfileScreen />);
    await screen.findByText('Утренняя зарядка');

    await user.click(within(rowOf('Утренняя зарядка')).getByRole('button', { name: 'Изменить' }));

    const titleInput = screen.getByLabelText('Название');
    expect(titleInput.value).toBe('Утренняя зарядка');

    await user.clear(titleInput);
    await user.type(titleInput, 'Зарядка 10 минут');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(updateHabit).toHaveBeenCalledWith('h1', {
      title: 'Зарядка 10 минут',
      emoji: '💪',
      color: '#7C9883',
    });
    await vi.waitFor(() => expect(fetchAllHabits).toHaveBeenCalledTimes(2));
  });
});
