import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthBlock from './AuthBlock.jsx';
import { requestPasswordReset, signIn, signOut, signUp } from '../data/api.js';

/*
 * Тесты блока аутентификации (ДЗ5, FR-54..FR-70): плашка локального режима,
 * валидация формы (FR-55), переключение вход/регистрация, серверные ошибки
 * (FR-56/FR-64), предупреждение о несинхронизированных данных при выходе
 * (FR-67) и нейтральное подтверждение сброса пароля с кулдауном (FR-68/FR-70).
 * data/api.js замокан целиком — тестируется поведение UI, а не фасад.
 */

vi.mock('../data/api.js', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  migrateLocalToCloud: vi.fn(),
  hasUnsyncedLocalData: vi.fn(),
  getSession: vi.fn(),
  onAuthChange: vi.fn(() => vi.fn()),
  isCloudEnabled: vi.fn(),
}));

/** Ошибка аутентификации с кодом — как кладёт фасад api.js. */
function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthBlock — локальный режим (Mock)', () => {
  it('показывает информационную плашку вместо форм, когда облако не настроено', () => {
    render(
      <AuthBlock cloudEnabled={false} session={null} loading={false} />
    );

    expect(screen.getByText(/Локальный режим \(Mock\)/)).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Войти' })).toBeNull();
  });

  it('на время восстановления сессии показывает скелетон, а не форму', () => {
    render(<AuthBlock cloudEnabled session={null} loading />);

    expect(screen.getByRole('status').textContent).toContain('Проверяем вход');
    expect(screen.queryByLabelText('Email')).toBeNull();
  });
});

describe('AuthBlock — форма входа и регистрации', () => {
  it('пустой email и короткий пароль не уходят на сервер (FR-55)', async () => {
    const user = userEvent.setup();
    render(<AuthBlock cloudEnabled session={null} loading={false} />);

    await user.type(screen.getByLabelText('Пароль'), '123');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(screen.getByText('Введите email')).toBeTruthy();
    expect(screen.getByText('Пароль — минимум 8 символов')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('некорректный email ловится валидацией до запроса (FR-55)', async () => {
    const user = userEvent.setup();
    render(<AuthBlock cloudEnabled session={null} loading={false} />);

    await user.type(screen.getByLabelText('Email'), 'не-email');
    await user.type(screen.getByLabelText('Пароль'), 'longpassword');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(screen.getByText('Некорректный email')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('переключение режимов меняет кнопку и вызываемый метод', async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ user: { id: 'u1', email: 'new@mail.ru' } });
    render(<AuthBlock cloudEnabled session={null} loading={false} />);

    await user.click(screen.getByRole('button', { name: 'Регистрация' }));
    await user.type(screen.getByLabelText('Email'), 'new@mail.ru');
    await user.type(screen.getByLabelText('Пароль'), 'longpassword');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(signUp).toHaveBeenCalledWith('new@mail.ru', 'longpassword');
    expect(signIn).not.toHaveBeenCalled();

    // обратно ко входу: кнопка снова «Войти»
    await user.click(screen.getByRole('button', { name: 'Вход' }));
    expect(screen.getByRole('button', { name: 'Войти' })).toBeTruthy();
  });

  it('успешный вход сообщает сессию наверх (FR-63)', async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    signIn.mockResolvedValue({ user: { id: 'u1', email: 'user@mail.ru' } });
    render(
      <AuthBlock cloudEnabled session={null} loading={false} onSignedIn={onSignedIn} />
    );

    await user.type(screen.getByLabelText('Email'), 'user@mail.ru');
    await user.type(screen.getByLabelText('Пароль'), 'longpassword');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() =>
      expect(onSignedIn).toHaveBeenCalledWith({ userId: 'u1', email: 'user@mail.ru' })
    );
  });

  it('неверные креденшалы — общая формулировка без входа (FR-64)', async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    signIn.mockRejectedValue(codedError('INVALID_CREDENTIALS', 'Invalid login credentials'));
    render(
      <AuthBlock cloudEnabled session={null} loading={false} onSignedIn={onSignedIn} />
    );

    await user.type(screen.getByLabelText('Email'), 'user@mail.ru');
    await user.type(screen.getByLabelText('Пароль'), 'longpassword');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Неверный email или пароль')).toBeTruthy();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('занятый email при регистрации — подсказка перейти ко входу (FR-56)', async () => {
    const user = userEvent.setup();
    signUp.mockRejectedValue(codedError('EMAIL_EXISTS', 'User already registered'));
    render(<AuthBlock cloudEnabled session={null} loading={false} />);

    await user.click(screen.getByRole('button', { name: 'Регистрация' }));
    await user.type(screen.getByLabelText('Email'), 'busy@mail.ru');
    await user.type(screen.getByLabelText('Пароль'), 'longpassword');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByText(/уже существует/)).toBeTruthy();
  });

  it('регистрация без автосессии показывает статус «Подтвердите email» (FR-54)', async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ needsConfirmation: true });
    render(<AuthBlock cloudEnabled session={null} loading={false} />);

    await user.click(screen.getByRole('button', { name: 'Регистрация' }));
    await user.type(screen.getByLabelText('Email'), 'fresh@mail.ru');
    await user.type(screen.getByLabelText('Пароль'), 'longpassword');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByText('Подтвердите email')).toBeTruthy();
  });
});

describe('AuthBlock — восстановление пароля', () => {
  it('нейтральное подтверждение и кулдаун повторной отправки (FR-68/FR-70)', async () => {
    const user = userEvent.setup();
    requestPasswordReset.mockResolvedValue(undefined);
    render(<AuthBlock cloudEnabled session={null} loading={false} />);

    await user.click(screen.getByRole('button', { name: 'Забыли пароль?' }));
    await user.type(screen.getByLabelText('Email'), 'someone@mail.ru');
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    expect(await screen.findByText('Ссылка для сброса отправлена')).toBeTruthy();
    expect(requestPasswordReset).toHaveBeenCalledTimes(1);

    // сразу после отправки повтор заблокирован отсчётом 60 секунд
    const resend = screen.getByRole('button', { name: /Отправить повторно/ });
    expect(resend.disabled).toBe(true);
    await user.click(resend);
    expect(requestPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('пустой email в форме сброса не отправляется', async () => {
    const user = userEvent.setup();
    render(<AuthBlock cloudEnabled session={null} loading={false} />);

    await user.click(screen.getByRole('button', { name: 'Забыли пароль?' }));
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    expect(screen.getByText('Введите email')).toBeTruthy();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe('AuthBlock — вошедший пользователь', () => {
  it('показывает email; выход без локальных данных выполняется сразу (FR-66)', async () => {
    const user = userEvent.setup();
    const onSignedOut = vi.fn();
    signOut.mockResolvedValue(undefined);
    render(
      <AuthBlock
        cloudEnabled
        session={{ userId: 'u1', email: 'user@mail.ru' }}
        loading={false}
        onSignedOut={onSignedOut}
      />
    );

    expect(screen.getByText('user@mail.ru')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/могут быть потеряны/)).toBeNull();
  });

  it('при несинхронизированных данных выход требует выбора; «Отмена» ничего не делает (FR-67)', async () => {
    const user = userEvent.setup();
    render(
      <AuthBlock
        cloudEnabled
        session={{ userId: 'u1', email: 'user@mail.ru' }}
        loading={false}
        hasLocalData
      />
    );

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(
      screen.getByText(
        'Есть отметки, не синхронизированные с облаком, — при выходе они могут быть потеряны'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Синхронизировать и выйти' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Выйти без синхронизации' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByText(/могут быть потеряны/)).toBeNull();
  });
});
