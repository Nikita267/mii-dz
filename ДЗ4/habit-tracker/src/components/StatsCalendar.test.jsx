// Тесты компонента StatsCalendar (Vitest + Testing Library, jsdom).
// «Сегодня» всегда передаётся пропсом. Опорные факты календаря UTC:
// 1 октября 2026 — четверг (3 пустые ячейки до понедельника), 2027 — не
// високосный (28 дней в феврале), 2028 — високосный (29 дней).

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatsCalendar from './StatsCalendar.jsx';

/** Habit-фикстура с датой создания. */
const habit = (id, createdAt) => ({
  id,
  title: `Привычка ${id}`,
  emoji: '🌱',
  color: '#7C9883',
  createdAt,
  archivedAt: null,
});

/** Отметки одной привычки: ci('h1', '2026-10-05') */
const ci = (habitId, ...dates) => dates.map((date) => ({ habitId, date }));

const H1 = habit('h1', '2026-09-01'); // создана до отображаемого месяца
const H2 = habit('h2', '2026-10-07'); // создана в середине отображаемого месяца

describe('StatsCalendar: сетка месяца', () => {
  it('октябрь 2026: заголовок, 31 день, 3 пустые ячейки выравнивания', () => {
    const { container } = render(
      <StatsCalendar habits={[H1]} checkIns={[]} selectedHabit={H1} today="2026-10-09" />
    );
    expect(screen.getByText('Октябрь 2026')).toBeTruthy();
    expect(container.querySelectorAll('[title^="2026-10-"]')).toHaveLength(31);
    expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(3);
  });

  it('февраль: 28 дней в невисокосный год и 29 в високосный', () => {
    const props = { habits: [H1], checkIns: [], selectedHabit: H1 };
    const { container, rerender } = render(<StatsCalendar {...props} today="2027-02-15" />);
    expect(screen.getByText('Февраль 2027')).toBeTruthy();
    expect(container.querySelectorAll('[title^="2027-02-"]')).toHaveLength(28);
    rerender(<StatsCalendar {...props} today="2028-02-10" />);
    expect(screen.getByText('Февраль 2028')).toBeTruthy();
    expect(container.querySelectorAll('[title^="2028-02-"]')).toHaveLength(29);
  });

  it('подписи дней недели пн..вс присутствуют в заголовке сетки', () => {
    render(<StatsCalendar habits={[H1]} checkIns={[]} selectedHabit={H1} today="2026-10-09" />);
    ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });
});

describe('StatsCalendar: покрытие дня', () => {
  it('точка дня: все привычки, часть и ни одной', () => {
    const checkIns = [...ci('h1', '2026-10-05'), ...ci('h1', '2026-10-07')];
    render(
      <StatsCalendar habits={[H1, H2]} checkIns={checkIns} selectedHabit={H1} today="2026-10-09" />
    );
    // 5 октября h2 ещё не создана: единственная привычка выполнена — день закрыт
    expect(screen.getByTitle('2026-10-05 — все привычки выполнены')).toBeTruthy();
    // 7 октября актуальны обе (день создания входит), отмечена одна
    expect(screen.getByTitle('2026-10-07 — выполнено 1 из 2 привычек')).toBeTruthy();
    expect(screen.getByTitle('2026-10-06 — отметок нет')).toBeTruthy();
  });

  it('сегодня помечается в подсказке дня', () => {
    render(<StatsCalendar habits={[H1]} checkIns={[]} selectedHabit={H1} today="2026-10-09" />);
    expect(screen.getByTitle('2026-10-09 — отметок нет · сегодня')).toBeTruthy();
  });
});

describe('StatsCalendar: процент выполнения за месяц', () => {
  it('считается от начала месяца до сегодня с нормализацией округления', () => {
    render(
      <StatsCalendar
        habits={[H1]}
        checkIns={ci('h1', '2026-10-01', '2026-10-02')}
        selectedHabit={H1}
        today="2026-10-09"
      />
    );
    // окно 1–9 октября = 9 обязательных дней, выполнено 2 -> 2/9 = 22.2%
    expect(screen.getByText('22.2%')).toBeTruthy();
  });

  it('привычка создана в середине месяца: знаменатель от createdAt', () => {
    render(
      <StatsCalendar
        habits={[H2]}
        checkIns={ci('h2', '2026-10-07')}
        selectedHabit={H2}
        today="2026-10-09"
      />
    );
    // окно 7–9 октября = 3 обязательных дня, выполнено 1 -> 33.3%
    expect(screen.getByText('33.3%')).toBeTruthy();
  });
});
