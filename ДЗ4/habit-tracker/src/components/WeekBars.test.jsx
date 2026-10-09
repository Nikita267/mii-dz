// Тесты компонента WeekBars (Vitest + Testing Library, jsdom).
// Времена детерминированы: «сегодня» передаётся пропсом. Опорные дни недели
// (из тестов stats.js): 2026-10-05 — пн, 2026-10-09 — пт, 2026-01-01 — чт.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WeekBars from './WeekBars.jsx';

/** Отметки одной привычки: ci('h1', '2026-10-05', '2026-10-09') */
const ci = (habitId, ...dates) => dates.map((date) => ({ habitId, date }));

describe('WeekBars: сетка недели', () => {
  it('рисует подписи пн..вс и сводку выполненных дней', () => {
    render(
      <WeekBars checkIns={ci('h1', '2026-10-05', '2026-10-09')} habitId="h1" today="2026-10-09" />
    );
    ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
    expect(
      screen.getByRole('img', { name: 'Отметки этой недели: выполнено 2 из 7 дней' })
    ).toBeTruthy();
  });

  it('подсказки различают выполненные дни и сегодня', () => {
    render(
      <WeekBars checkIns={ci('h1', '2026-10-05', '2026-10-09')} habitId="h1" today="2026-10-09" />
    );
    expect(screen.getByTitle('пн, 2026-10-05 — выполнено')).toBeTruthy();
    expect(screen.getByTitle('пт, 2026-10-09 — выполнено · сегодня')).toBeTruthy();
    expect(screen.getByTitle('сб, 2026-10-10 — не выполнено')).toBeTruthy();
  });

  it('неделя на границе года начинается в декабре', () => {
    render(<WeekBars checkIns={ci('h1', '2025-12-31')} habitId="h1" today="2026-01-01" />);
    expect(screen.getByTitle('пн, 2025-12-29 — не выполнено')).toBeTruthy();
    expect(screen.getByTitle('ср, 2025-12-31 — выполнено')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Отметки этой недели: выполнено 1 из 7 дней' })
    ).toBeTruthy();
  });

  it('без отметок все семь дней пустые', () => {
    render(<WeekBars checkIns={[]} habitId="h1" today="2026-10-09" />);
    expect(
      screen.getByRole('img', { name: 'Отметки этой недели: выполнено 0 из 7 дней' })
    ).toBeTruthy();
    expect(screen.getByTitle('вс, 2026-10-11 — не выполнено')).toBeTruthy();
  });

  it('чужие привычки не влияют на столбики', () => {
    render(
      <WeekBars checkIns={ci('other', '2026-10-05')} habitId="h1" today="2026-10-09" />
    );
    expect(screen.getByTitle('пн, 2026-10-05 — не выполнено')).toBeTruthy();
  });
});
