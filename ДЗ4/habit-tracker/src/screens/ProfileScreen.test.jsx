import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileScreen from './ProfileScreen.jsx';
import {
  archiveHabit,
  fetchAllHabits,
  fetchCheckIns,
  getSession,
  hasUnsyncedLocalData,
  isCloudEnabled,
  migrateLocalToCloud,
  onAuthChange,
  restoreHabit,
  signIn,
  signOut,
  updateHabit,
} from '../data/api.js';
import { formatDayMonth } from '../utils/format.js';

/*
 * Тесты экрана «Профиль»: состояния загрузки/ошибки, список активных привычек
 * с сериями, подтверждение архивации (FR-17..FR-19), восстановление (FR-23)
 * и редактирование через HabitDialog. data/api.js подменён моком —
 * тестируется поведение экрана, а не mock-хранилище. Auth-методы ДЗ5
 * замоканы «гостевым Mock-режимом» (isCloudEnabled = false), поэтому блок
 * аутентификации рисует плашку локального режима и не влияет на сценарии.
 */

vi.mock('../data/api.js', () => ({
  archiveHabit: vi.fn(),
  fetchAllHabits: vi.fn(),
  fetchCheckIns: vi.fn(),
  restoreHabit: vi.fn(),
  updateHabit: vi.fn(),
  isCloudEnabled: vi.fn(() => false),
  getSession: vi.fn(),
  onAuthChange: vi.fn(() => vi.fn()),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  hasUnsyncedLocalData: vi.fn(() => false),
  migrateLocalToCloud: vi.fn(),
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

/*
 * ДЗ5, история №7 — перенос локальных данных после входа: при наличии
 * несинхронизированных Mock-данных экран показывает диалог с тремя выборами
 * («Синхронизировать и войти» / «Войти без переноса» / «Отмена»), успех —
 * со счётчиками, «Отмена» возвращает в гостевой режим через signOut.
 * Облачный режим включается моком isCloudEnabled, вход выполняется через
 * настоящую форму AuthBlock — как это делает пользователь.
 */

/** Заполняет форму входа и нажимает «Войти» (успех задаётся моком signIn). */
async function submitSignInForm(user) {
  await screen.findByLabelText('Email');
  await user.type(screen.getByLabelText('Email'), 'user@mail.ru');
  await user.type(screen.getByLabelText('Пароль'), 'longpassword');
  await user.click(screen.getByRole('button', { name: 'Войти' }));
}

describe('ProfileScreen — ДЗ5: перенос локальных данных', () => {
  beforeEach(() => {
    isCloudEnabled.mockReturnValue(true);
    getSession.mockResolvedValue(null); // стартуем гостем: форма входа
    onAuthChange.mockImplementation(() => () => {});
    signIn.mockResolvedValue({ user: { id: 'u1', email: 'user@mail.ru' } });
    signOut.mockResolvedValue(undefined);
    migrateLocalToCloud.mockResolvedValue({ habits: 3, checkIns: 12 });
    fetchAllHabits.mockResolvedValue(HABITS);
    fetchCheckIns.mockResolvedValue(CHECK_INS);
  });

  it('после входа с несинхронизированными данными показывает диалог с тремя выборами', async () => {
    hasUnsyncedLocalData.mockReturnValue(true);
    const user = userEvent.setup();
    render(<ProfileScreen />);
    expect(screen.queryByRole('dialog')).toBeNull();

    await submitSignInForm(user);

    const dialog = await screen.findByRole('dialog', { name: 'Перенос локальных данных' });
    expect(within(dialog).getByText('Перенести локальные данные?')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Синхронизировать и войти' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Войти без переноса' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toBeTruthy();
  });

  it('«Синхронизировать и войти» вызывает migrateLocalToCloud и показывает счётчики', async () => {
    hasUnsyncedLocalData.mockReturnValue(true);
    const user = userEvent.setup();
    render(<ProfileScreen />);
    await submitSignInForm(user);

    await user.click(await screen.findByRole('button', { name: 'Синхронизировать и войти' }));

    expect(migrateLocalToCloud).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Готово: данные перенесены в аккаунт')).toBeTruthy();
    // счётчики склоняются: 3 привычки, 12 отметок
    expect(screen.getByText(/3 привычки и 12 отметок/)).toBeTruthy();
    expect(screen.getByText(/серии не обнулены/)).toBeTruthy();
  });

  it('«Войти без переноса» закрывает диалог, перенос не запускается', async () => {
    hasUnsyncedLocalData.mockReturnValue(true);
    const user = userEvent.setup();
    render(<ProfileScreen />);
    await submitSignInForm(user);

    await user.click(await screen.findByRole('button', { name: 'Войти без переноса' }));

    expect(migrateLocalToCloud).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('«Отмена» завершает сессию через signOut и возвращает в гостевой режим', async () => {
    hasUnsyncedLocalData.mockReturnValue(true);
    let notifyAuthChange = null;
    onAuthChange.mockImplementation((callback) => {
      notifyAuthChange = callback;
      return () => {};
    });
    const user = userEvent.setup();
    render(<ProfileScreen />);
    await submitSignInForm(user);

    // useAuth узнаёт о входе через onAuthStateChange — как в реальном облаке
    act(() => notifyAuthChange({ user: { id: 'u1', email: 'user@mail.ru' } }, 'SIGNED_IN'));
    expect(await screen.findByText('user@mail.ru')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    act(() => notifyAuthChange(null, 'SIGNED_OUT'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // гостевой режим — снова форма входа
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });

  it('без локальных данных после входа диалог переноса не появляется', async () => {
    hasUnsyncedLocalData.mockReturnValue(false);
    const user = userEvent.setup();
    render(<ProfileScreen />);
    await submitSignInForm(user);

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
