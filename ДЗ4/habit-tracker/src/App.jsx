import { useState } from 'react';
import TodayScreen from './screens/TodayScreen.jsx';
import StatsScreen from './screens/StatsScreen.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';

const TABS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'stats', label: 'Статистика' },
  { id: 'profile', label: 'Профиль' },
];

/**
 * Корневой компонент приложения «Трекер привычек».
 * Навигация — нижние вкладки (Концепция 1: Сегодня / Статистика / Профиль).
 */
export default function App() {
  const [tab, setTab] = useState('today');

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
              onClick={() => setTab(t.id)}
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
