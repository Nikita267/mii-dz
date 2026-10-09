import { useEffect, useState } from 'react';
import {
  migrateLocalToCloud,
  requestPasswordReset,
  signIn,
  signInWithOAuth,
  signOut,
  signUp,
} from '../data/api.js';

/*
 * AuthBlock — блок аутентификации экрана «Профиль» (ДЗ5, ТЗ FR-54..FR-70).
 * Три состояния: информационная плашка локального режима, форма входа /
 * регистрации с восстановлением пароля и карточка вошедшего пользователя
 * с предупреждением о несинхронизированных данных при выходе (FR-67).
 * Блок не добывает сессию сам — получает её через props от ProfileScreen
 * (useAuth), а в api.js ходит только за действиями: вход, регистрация,
 * сброс пароля, выход, синхронизация.
 */

/** Плашка локального режима: облако не настроено, вход недоступен (FR-66). */
const MOCK_MODE_NOTE = 'Локальный режим (Mock): войти можно после настройки Supabase (ДЗ5)';

/** Минимальная длина пароля и кулдаун повторной отправки письма (FR-55/FR-70). */
const PASSWORD_MIN_LENGTH = 8;
const RESET_COOLDOWN_SECONDS = 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LOGIN_MODE_TITLE = 'Вход';
const SIGN_UP_MODE_TITLE = 'Регистрация';

/** Ошибки сервера по кодам api.js; формулировки — из ТЗ (FR-56, FR-64). */
const SERVER_ERRORS = {
  EMAIL_EXISTS: 'Пользователь с таким email уже существует. Переключитесь в режим входа',
  INVALID_CREDENTIALS: 'Неверный email или пароль',
  default: 'Не удалось выполнить запрос. Проверьте соединение и попробуйте ещё раз',
};

const SIGN_OUT_ERROR_MESSAGE = 'Не удалось выйти. Проверьте соединение и попробуйте ещё раз';

/** Предупреждение FR-67 — дословная формулировка из ТЗ (история №18). */
const UNSYNCED_WARNING =
  'Есть отметки, не синхронизированные с облаком, — при выходе они могут быть потеряны';

/** Кнопки предупреждения FR-67: основная, опасная и нейтральная. */
const BUTTON_PRIMARY =
  'w-full rounded-full bg-sage px-4 py-2 text-xs font-semibold text-white ' +
  'transition-colors hover:bg-sage-deep disabled:opacity-60';
const BUTTON_DANGER =
  'w-full rounded-full bg-terracotta px-4 py-2 text-xs font-semibold text-white ' +
  'transition-colors hover:opacity-90 disabled:opacity-60';
const BUTTON_GHOST =
  'w-full rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink-soft ' +
  'transition-colors hover:text-ink disabled:opacity-50';

/**
 * Валидирует email (FR-55): пустое значение и неверный формат — разные
 * конкретные ошибки у поля, чтобы запрос не уходил на сервер зря.
 *
 * @param {string} value сырое значение поля.
 * @returns {string|null} текст ошибки или null, если значение корректно.
 */
function validateEmail(value) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'Введите email';
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return 'Некорректный email';
  }
  return null;
}

/**
 * Валидирует пароль (FR-55): минимум 8 символов.
 *
 * @param {string} value сырое значение поля.
 * @returns {string|null} текст ошибки или null, если значение корректно.
 */
function validatePassword(value) {
  if (value === '') {
    return 'Введите пароль';
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Пароль — минимум ${PASSWORD_MIN_LENGTH} символов`;
  }
  return null;
}

/**
 * Приводит сессию фасада data/api.js ({user: {id, email}} | null) к компактному
 * контракту UI ({userId, email} | null) — тому же, что отдаёт useAuth.
 *
 * @param {{user: {id: string, email: null|string}}|null} session сессия фасада.
 * @returns {{userId: string, email: string}|null} сессия для UI либо null.
 */
function toUiSession(session) {
  const user = session && session.user ? session.user : null;
  return user ? { userId: user.id, email: user.email || '' } : null;
}

/**
 * Поле формы с меткой и ошибкой валидации: ошибка красит границу в терракоту
 * (токен ошибок из ТЗ FR-8) и связывается с инпутом через aria-describedby.
 *
 * @param {object} props — свойства компонента.
 * @param {string} props.id — идентификатор поля (id + htmlFor).
 * @param {string} props.label — текст метки.
 * @param {string} [props.type='text'] — тип инпута.
 * @param {string} props.value — текущее значение.
 * @param {Function} props.onChange — обработчик изменения.
 * @param {Function} [props.onBlur] — обработчик потери фокуса (валидация FR-55).
 * @param {string|null} [props.error] — ошибка поля или null.
 * @param {string} [props.autoComplete] — подсказка автозаполнения браузера.
 * @param {string} [props.hint] — необязательная подсказка под полем.
 * @returns {JSX.Element} Разметка поля.
 */
function Field({ id, label, type = 'text', value, onChange, onBlur, error, autoComplete, hint }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-ink-soft">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={
          'mt-1 w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm text-ink ' +
          'placeholder:text-ink-faint focus:border-sage focus:outline-none ' +
          (error ? 'border-terracotta' : 'border-line')
        }
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-terracotta">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

/**
 * Информационная плашка локального режима (Mock): облако не настроено,
 * поэтому вместо форм — честное объяснение, когда появится вход.
 *
 * @returns {JSX.Element} Плашка.
 */
function MockModeNote() {
  return (
    <p
      role="note"
      className="mt-4 rounded-2xl bg-sage-mist px-4 py-3 text-xs leading-relaxed text-sage-deep"
    >
      {MOCK_MODE_NOTE}
    </p>
  );
}

/**
 * Скелетон на время восстановления сессии: экран не мигает формой входа
 * перед уже открытым входом (FR-63).
 *
 * @returns {JSX.Element} Блок состояния загрузки.
 */
function LoadingState() {
  return (
    <div className="mt-4" aria-busy="true">
      <div className="h-28 animate-pulse rounded-3xl bg-bar-off/60" />
      <p role="status" className="mt-2 text-xs text-ink-faint">
        Проверяем вход…
      </p>
    </div>
  );
}

/**
 * Форма входа/регистрации (FR-54..FR-56, FR-63..FR-64): переключатель режимов,
 * email + пароль с валидацией на вводе и потере фокуса, ссылка «Забыли пароль?».
 *
 * @param {object} props — свойства компонента.
 * @param {Function} props.onSignedIn — сообщить наверх об успешном входе.
 * @param {Function} props.onForgot — перейти к форме восстановления пароля.
 * @param {Function} props.onRegistered — показать статус «Подтвердите email».
 * @returns {JSX.Element} Форма с переключателем режимов.
 */
function CredentialsForm({ onSignedIn, onForgot, onRegistered }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [oauthPending, setOauthPending] = useState(false);
  const isLogin = mode === 'login';

  /**
   * Переключает режим вход/регистрация, сбрасывая ошибки — правила полей
   * и тексты кнопок различаются между режимами.
   *
   * @param {string} nextMode — 'login' или 'register'.
   * @returns {void}
   */
  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErrors({});
    setSubmitError(null);
  };

  /**
   * Валидирует поле при потере фокуса (FR-55) — ошибка видна до отправки.
   *
   * @param {string} field — имя поля ('email' | 'password').
   * @returns {Function} обработчик blur.
   */
  const handleBlur = (field) => () => {
    const message = field === 'email' ? validateEmail(email) : validatePassword(password);
    setErrors((prev) => ({ ...prev, [field]: message }));
  };

  /* Ошибку при вводе снимаем сразу после исправления (FR-55: «при вводе»). */
  const handleEmailChange = (event) => {
    setEmail(event.target.value);
    setErrors((prev) => ({ ...prev, email: null }));
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
    setErrors((prev) => ({ ...prev, password: null }));
  };

  /**
   * Отправляет форму: локальная валидация блокирует запрос (FR-55), затем
   * вход или регистрация через api.js с обязательными loading/error.
   *
   * @param {Event} event — событие submit.
   * @returns {Promise<void>}
   */
  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (isLogin) {
        const result = await signIn(email.trim(), password);
        if (onSignedIn) onSignedIn(toUiSession(result));
      } else {
        const result = await signUp(email.trim(), password);
        if (result.user) {
          if (onSignedIn) onSignedIn(toUiSession(result));
        } else {
          onRegistered(); // письмо со ссылкой отправлено — статус FR-54
        }
      }
    } catch (error) {
      setSubmitError(SERVER_ERRORS[error.code] || SERVER_ERRORS.default);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Запуск OAuth2-входа через Google (ДЗ6): клик уводит браузер на страницу
   * провайдера, ответ Supabase примет по редиректу на origin приложения, а
   * готовую сессию пришлёт onAuthChange. Провайдер должен быть включён в
   * проекте Supabase: Authentication → Providers → Google.
   *
   * @returns {Promise<void>}
   */
  const handleGoogleSignIn = async () => {
    setOauthPending(true);
    setSubmitError(null);
    try {
      await signInWithOAuth('google');
      // При успехе страница вот-вот уйдёт на google.com — разблокировать
      // кнопку не нужно (иначе клик станет повторяемым до выгрузки).
    } catch (oauthError) {
      console.error('AuthBlock: OAuth-вход не начался', oauthError);
      setSubmitError(SERVER_ERRORS.default);
      setOauthPending(false);
    }
  };

  return (
    <section
      aria-label="Вход в аккаунт"
      className="mt-4 rounded-3xl border border-line bg-card p-4 shadow-sm"
    >
      <div className="flex rounded-full bg-sage-mist p-1" role="group" aria-label="Режим формы">
        {[
          ['login', LOGIN_MODE_TITLE],
          ['register', SIGN_UP_MODE_TITLE],
        ].map(([value, title]) => (
          <button
            key={value}
            type="button"
            onClick={() => switchMode(value)}
            aria-pressed={mode === value}
            className={
              'flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ' +
              (mode === value
                ? 'bg-card text-ink shadow-sm'
                : 'text-ink-soft hover:text-ink')
            }
          >
            {title}
          </button>
        ))}
      </div>

      {/* OAuth2 (ДЗ6): один клик вместо пары email/пароль; работает и для
          входа, и для регистрации — аккаунт создаётся провайдером при первом
          входе. Белая кнопка с рамкой и буквой G — визуально отделена от
          основной (шалфейной) submit-кнопки формы. */}
      <button
        type="button"
        onClick={() => void handleGoogleSignIn()}
        disabled={oauthPending}
        className={
          'mt-4 flex w-full items-center justify-center gap-2.5 rounded-full border ' +
          'border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink ' +
          'transition-colors hover:border-sage/60 disabled:opacity-60'
        }
      >
        <span aria-hidden="true" className="font-display text-base leading-none">G</span>
        {oauthPending ? 'Открываем Google…' : 'Войти через Google'}
      </button>

      <div aria-hidden="true" className="mt-3 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-faint">или</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form className="mt-3 space-y-3" onSubmit={handleSubmit} noValidate>
        <Field
          id="auth-email"
          label="Email"
          type="email"
          value={email}
          autoComplete="email"
          onChange={handleEmailChange}
          onBlur={handleBlur('email')}
          error={errors.email}
        />
        <Field
          id="auth-password"
          label="Пароль"
          type="password"
          value={password}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          onChange={handlePasswordChange}
          onBlur={handleBlur('password')}
          error={errors.password}
          hint={isLogin ? undefined : `Минимум ${PASSWORD_MIN_LENGTH} символов`}
        />

        {submitError && (
          <p role="alert" className="text-xs leading-relaxed text-terracotta">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={
            'w-full rounded-full bg-sage px-4 py-2.5 text-sm font-semibold text-white ' +
            'transition-colors hover:bg-sage-deep disabled:opacity-60'
          }
        >
          {submitting
            ? isLogin
              ? 'Входим…'
              : 'Создаём аккаунт…'
            : isLogin
              ? 'Войти'
              : 'Создать аккаунт'}
        </button>
      </form>

      {isLogin && (
        <button
          type="button"
          onClick={onForgot}
          className="mt-3 text-xs font-semibold text-sage-deep underline-offset-2 hover:underline"
        >
          Забыли пароль?
        </button>
      )}
    </section>
  );
}

/**
 * Статус «Подтвердите email» после регистрации без автосессии (FR-54).
 *
 * @param {object} props — свойства компонента.
 * @param {Function} props.onBack — вернуться к форме входа.
 * @returns {JSX.Element} Информационная карточка.
 */
function ConfirmEmailNote({ onBack }) {
  return (
    <section
      aria-label="Подтверждение email"
      className="mt-4 rounded-3xl border border-line bg-card p-4 shadow-sm"
    >
      <p className="text-sm font-semibold text-ink">Подтвердите email</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Мы отправили письмо со ссылкой. Перейдите по ней — аккаунт активируется,
        и данные будут защищены от потери при смене устройства.
      </p>
      <button
        type="button"
        onClick={onBack}
        className={
          'mt-3 rounded-full border border-line px-3.5 py-1.5 text-xs ' +
          'font-semibold text-ink-soft transition-colors hover:text-ink'
        }
      >
        К форме входа
      </button>
    </section>
  );
}

/**
 * Форма восстановления пароля (FR-68..FR-70): email, нейтральное подтвеждение
 * «Ссылка для сброса отправлена» (не раскрывает существование аккаунта) и
 * повторная отправка не чаще раза в 60 секунд с видимым отсчётом.
 *
 * @param {object} props — свойства компонента.
 * @param {Function} props.onBack — вернуться к форме входа.
 * @returns {JSX.Element} Форма или подтверждение отправки.
 */
function ForgotPasswordForm({ onBack }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  /* Отсчёт кулдауна (FR-70): цепочка таймеров, чистится при размонтировании. */
  useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /**
   * Отправляет запрос сброса: валидация, затем requestPasswordReset; успех
   * включает нейтральное подтверждение и кулдаун (FR-68/FR-70).
   *
   * @returns {Promise<void>}
   */
  const send = async () => {
    const validationError = validateEmail(email);
    setError(validationError);
    if (validationError || sending || cooldown > 0) {
      return;
    }
    setSending(true);
    try {
      await requestPasswordReset(email.trim());
      setSentTo(email.trim());
      setCooldown(RESET_COOLDOWN_SECONDS);
    } catch {
      setError('Не удалось отправить письмо. Попробуйте ещё раз');
    } finally {
      setSending(false);
    }
  };

  if (sentTo !== null) {
    return (
      <section
        aria-label="Восстановление пароля"
        className="mt-4 rounded-3xl border border-line bg-card p-4 shadow-sm"
      >
        <p className="text-sm font-semibold text-ink">Ссылка для сброса отправлена</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Если аккаунт {sentTo} существует, письмо придёт в течение минуты.
          Проверьте почту и папку «Спам».
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void send()}
            disabled={cooldown > 0 || sending}
            className={BUTTON_PRIMARY}
          >
            {cooldown > 0 ? `Отправить повторно через ${cooldown} с` : 'Отправить повторно'}
          </button>
          <button type="button" onClick={onBack} className={BUTTON_GHOST}>
            Назад ко входу
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Восстановление пароля"
      className="mt-4 rounded-3xl border border-line bg-card p-4 shadow-sm"
    >
      <p className="text-sm font-semibold text-ink">Восстановление пароля</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Введите email — пришлём ссылку для задания нового пароля.
      </p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        noValidate
      >
        <Field
          id="reset-email"
          label="Email"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          onBlur={() => setError(validateEmail(email))}
          error={error}
        />
        <button
          type="submit"
          disabled={sending}
          className={
            'w-full rounded-full bg-sage px-4 py-2.5 text-sm font-semibold text-white ' +
            'transition-colors hover:bg-sage-deep disabled:opacity-60'
          }
        >
          {sending ? 'Отправляем…' : 'Отправить ссылку'}
        </button>
      </form>
      <button
        type="button"
        onClick={onBack}
        className="mt-3 text-xs font-semibold text-sage-deep underline-offset-2 hover:underline"
      >
        Назад ко входу
      </button>
    </section>
  );
}

/**
 * Карточка вошедшего пользователя: email и «Выйти». При наличии локальных
 * несинхронизированных данных выход сначала показывает предупреждение FR-67
 * с выбором: синхронизировать, выйти без синхронизации или отменить.
 *
 * @param {object} props — свойства компонента.
 * @param {{userId: string, email: string}} props.session — сессия пользователя.
 * @param {boolean} props.hasLocalData — есть неперенесённые локальные данные.
 * @param {Function} [props.onSignedOut] — сообщить наверх об успешном выходе.
 * @returns {JSX.Element} Карточка аккаунта.
 */
function SessionCard({ session, hasLocalData, onSignedOut }) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Завершает сессию, при syncFirst сначала перенося локальные данные в облако.
   *
   * @param {boolean} syncFirst — синхронизировать перед выходом (FR-67).
   * @returns {Promise<void>}
   */
  const finishSession = async (syncFirst) => {
    setBusy(true);
    setError(null);
    try {
      if (syncFirst) {
        await migrateLocalToCloud();
      }
      await signOut();
      setWarningOpen(false);
      if (onSignedOut) onSignedOut();
    } catch {
      setError(SIGN_OUT_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  /** Клик «Выйти»: без несинхронизированных данных — сразу, иначе FR-67. */
  const handleSignOutClick = () => {
    if (hasLocalData) {
      setWarningOpen(true);
      return;
    }
    void finishSession(false);
  };

  return (
    <section
      aria-label="Аккаунт"
      className="mt-4 rounded-3xl border border-line bg-card p-4 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Аккаунт</p>
      <p className="mt-1 truncate text-sm font-semibold text-ink" title={session.email}>
        {session.email}
      </p>
      <p className="mt-0.5 text-xs text-ink-faint">Данные синхронизируются с облаком</p>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleSignOutClick}
          disabled={busy}
          className={
            'rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-ink-soft ' +
            'transition-colors hover:border-terracotta/60 hover:text-terracotta disabled:opacity-50'
          }
        >
          {busy ? 'Выходим…' : 'Выйти'}
        </button>
      </div>

      {warningOpen && (
        <div role="alert" className="mt-3 rounded-2xl bg-sage-mist/60 px-3.5 py-3">
          <p className="text-xs leading-relaxed text-ink">{UNSYNCED_WARNING}</p>
          <div className="mt-2.5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void finishSession(true)}
              disabled={busy}
              className={BUTTON_PRIMARY}
            >
              {busy ? 'Синхронизируем…' : 'Синхронизировать и выйти'}
            </button>
            <button
              type="button"
              onClick={() => void finishSession(false)}
              disabled={busy}
              className={BUTTON_DANGER}
            >
              Выйти без синхронизации
            </button>
            <button
              type="button"
              onClick={() => setWarningOpen(false)}
              disabled={busy}
              className={BUTTON_GHOST}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-terracotta">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * Блок аутентификации в «Профиле»: выбирает ветку по состоянию сессии.
 * Порядок проверок: загрузка → Mock-плашка → карточка аккаунта → форма входа.
 *
 * @param {object} props — свойства компонента.
 * @param {boolean} props.cloudEnabled — настроено ли облако (Supabase).
 * @param {{userId: string, email: string}|null} props.session — сессия или null.
 * @param {boolean} props.loading — идёт восстановление сессии.
 * @param {boolean} [props.hasLocalData=false] — есть несинхронизированные
 *   локальные данные (включает предупреждение FR-67 при выходе).
 * @param {Function} [props.onSignedIn] — успешный вход (сессия в аргументе).
 * @param {Function} [props.onSignedOut] — успешный выход.
 * @returns {JSX.Element} Блок аутентификации.
 */
export default function AuthBlock({
  cloudEnabled,
  session,
  loading,
  hasLocalData = false,
  onSignedIn,
  onSignedOut,
}) {
  if (loading) {
    return <LoadingState />;
  }
  if (!cloudEnabled) {
    return <MockModeNote />;
  }
  if (session) {
    return <SessionCard session={session} hasLocalData={hasLocalData} onSignedOut={onSignedOut} />;
  }
  return <AuthFormSwitcher onSignedIn={onSignedIn} />;
}

/**
 * Переключатель внутренних видов формы: креденшалы, восстановление пароля
 * и статус «Подтвердите email» после регистрации (FR-54).
 *
 * @param {object} props — свойства компонента.
 * @param {Function} props.onSignedIn — успешный вход.
 * @returns {JSX.Element} Активный вид формы.
 */
function AuthFormSwitcher({ onSignedIn }) {
  const [view, setView] = useState('form');

  if (view === 'forgot') {
    return <ForgotPasswordForm onBack={() => setView('form')} />;
  }
  if (view === 'registered') {
    return <ConfirmEmailNote onBack={() => setView('form')} />;
  }
  return (
    <CredentialsForm
      onSignedIn={onSignedIn}
      onForgot={() => setView('forgot')}
      onRegistered={() => setView('registered')}
    />
  );
}
