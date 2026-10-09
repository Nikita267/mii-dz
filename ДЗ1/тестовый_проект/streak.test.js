// Тесты функции calculateStreak (node --test)
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { calculateStreak } = require('./streak.js');

const TODAY = new Date('2026-10-08');

test('пустой список отметок -> серия 0', () => {
  assert.strictEqual(calculateStreak([], TODAY), 0);
});

test('одна отметка сегодня -> серия 1', () => {
  assert.strictEqual(calculateStreak(['2026-10-08'], TODAY), 1);
});

test('серия 5 дней подряд, заканчивается сегодня -> 5', () => {
  const entries = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
  assert.strictEqual(calculateStreak(entries, TODAY), 5);
});

test('перерыв: вчера отметки нет, сегодня есть -> серия 1', () => {
  assert.strictEqual(calculateStreak(['2026-10-06', '2026-10-08'], TODAY), 1);
});

test('переход месяца: 29-30 сентября + 1-2 октября -> серия 4', () => {
  const entries = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
  assert.strictEqual(calculateStreak(entries, new Date('2026-10-02')), 4);
});

test('серия оборвалась 5 дней назад -> 0', () => {
  const entries = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'];
  assert.strictEqual(calculateStreak(entries, TODAY), 0);
});
