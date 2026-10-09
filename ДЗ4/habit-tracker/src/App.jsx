import { useEffect, useState } from 'react';
import { initAnalytics, trackEvent } from './analytics/index.js';
import TodayScreen from './screens/TodayScreen.jsx';
import StatsScreen from './screens/StatsScreen.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';

const TABS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'stats', label: 'Статистика' },
  { id: 'profile', label: 'Профиль' },
];

/** Допустимые идентификаторы вкладок — для проверки глубокой ссылки. */
const TAB_IDS = new Set(TABS.map((t) => t.id));

/**
 * Начальная вкладка из хэша URL (#today/#stats/#profile).
 * Глубокие ссылки нужны для скриншотного тестирования экранов и удобства
 * шаринга состояния; некорректный хэш молча падает на «Сегодня».
 *
 * @returns {string} идентификатор вкладки.
 */
function initialTab() {
  const hash = window.location.hash.replace('#', '');
  return TAB_IDS.has(hash) ? hash : 'today';
}

/**
 * Корневой компонент приложения «Трекер привычек».
 * Навигация — нижние вкладки (Концепция 1: Сегодня / Статистика / Профиль).
 */
export default function App() {
  const [tab, setTab] = useState(initialTab);

  // Счётчик аналитики (ДЗ6) грузится один раз при монтировании; без env
  // (VITE_GA_MEASUREMENT_ID / VITE_YM_COUNTER_ID) initAnalytics — no-op.
  useEffect(() => {
    initAnalytics();
  }, []);

  // Просмотр экрана — событие screen_view при каждой смене вкладки
  // (включая первую: эффект срабатывает и на монтировании).
  useEffect(() => {
    trackEvent('screen_view', { screen: tab });
  }, [tab]);

  /** Переключает вкладку и синхронизирует хэш URL (глубокая ссылка). */
  const switchTab = (id) => {
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper text-ink">
      <main className="flex-1 px-4 pt-5 pb-24">
        {tab === 'today' && <TodayScreen />}
        {tab === 'stats' && <StatsScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-card" aria-label="Основная навигация">
        <div className="mx-auto flex max-w-md">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={
                'flex-1 py-3 text-sm transition-colors ' +
                (tab === t.id ? 'font-semibold text-sage-deep' : 'text-ink-soft hover:text-ink')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
