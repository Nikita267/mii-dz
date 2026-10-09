// Тесты утилит форматирования (node --test)
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { formatStreak, weekLabel } = require('./format.js');

// «сегодня» — четверг 8 октября 2026 (неделя: пн 05.10 – вс 11.10)
const NOW = new Date(2026, 9, 8);

test('formatStreak: 0 -> «нет серии»', () => {
  assert.strictEqual(formatStreak(0), 'нет серии');
});

test('formatStreak: 1 -> «1 день»', () => {
  assert.strictEqual(formatStreak(1), '1 день');
});

test('formatStreak: 2–4 -> «N дня»', () => {
  assert.strictEqual(formatStreak(2), '2 дня');
  assert.strictEqual(formatStreak(3), '3 дня');
  assert.strictEqual(formatStreak(4), '4 дня');
});

test('formatStreak: 5+ -> «N дней»', () => {
  assert.strictEqual(formatStreak(5), '5 дней');
  assert.strictEqual(formatStreak(20), '20 дней');
  assert.strictEqual(formatStreak(25), '25 дней');
});

test('formatStreak: общие правила грамматики (21 день, 22 дня, 11 дней)', () => {
  assert.strictEqual(formatStreak(11), '11 дней');
  assert.strictEqual(formatStreak(14), '14 дней');
  assert.strictEqual(formatStreak(21), '21 день');
  assert.strictEqual(formatStreak(22), '22 дня');
  assert.strictEqual(formatStreak(111), '111 дней');
  assert.strictEqual(formatStreak(112), '112 дней'); // …двенадцать -> «дней»
  assert.strictEqual(formatStreak(122), '122 дня');  // …двадцать два -> «дня»
});

test('formatStreak: отрицательное или дробное значение -> ошибка', () => {
  assert.throws(() => formatStreak(-1), TypeError);
  assert.throws(() => formatStreak(1.5), TypeError);
});

test('weekLabel: любой день текущей недели -> «эта неделя»', () => {
  assert.strictEqual(weekLabel(new Date(2026, 9, 8), NOW), 'эта неделя');   // четверг
  assert.strictEqual(weekLabel(new Date(2026, 9, 5), NOW), 'эта неделя');   // понедельник
  assert.strictEqual(weekLabel(new Date(2026, 9, 11, 23, 59), NOW), 'эта неделя'); // воскресенье, вечер
});

test('weekLabel: прошлая неделя -> «прошлая неделя»', () => {
  assert.strictEqual(weekLabel(new Date(2026, 9, 4), NOW), 'прошлая неделя');  // воскресенье
  assert.strictEqual(weekLabel(new Date(2026, 8, 28), NOW), 'прошлая неделя'); // понедельник
});

test('weekLabel: более старые недели -> диапазон понедельник–воскресенье', () => {
  assert.strictEqual(weekLabel(new Date(2026, 8, 27), NOW), '21 сентября – 27 сентября');
});

test('weekLabel: диапазон на стыке месяцев', () => {
  assert.strictEqual(weekLabel(new Date(2026, 8, 2), NOW), '31 августа – 6 сентября');
});

test('weekLabel: будущая неделя тоже получает диапазон', () => {
  assert.strictEqual(weekLabel(new Date(2026, 9, 12), NOW), '12 октября – 18 октября');
});

test('weekLabel: диапазон на стыке года', () => {
  assert.strictEqual(weekLabel(new Date(2026, 0, 1), NOW), '29 декабря – 4 января');
});

test('weekLabel: принимает дату строкой «YYYY-MM-DD»', () => {
  assert.strictEqual(weekLabel('2026-09-02', NOW), '31 августа – 6 сентября');
});
