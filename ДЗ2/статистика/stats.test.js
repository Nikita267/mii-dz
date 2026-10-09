// Тесты модуля статистики src/utils/stats.js (node --test) — шаг 3 из 3.
//
// Все времена детерминированы: «сегодня» всегда передаётся параметром (строкой
// 'YYYY-MM-DD' или объектом Date на UTC-полуночи), системные часы не читаются.
// Опорные дни недели (проверены по календарю UTC):
//   2026-10-05 — пн,  2026-10-09 — пт,  2026-10-11 — вс,  2026-10-12 — пн,
//   2026-09-28 — пн,  2026-09-30 — ср,  2026-11-30 — пн,  2026-12-28 — пн,
//   2026-12-31 — чт,  2027-01-01 — пт,  2027-01-03 — вс;  2024 — високосный.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCurrentStreak,
  getBestStreak,
  getCompletionRate,
  groupByWeeks,
} = require('./stats.js');

// ─── Фикстюры и помощники ───────────────────────────────────────────────────────

const TODAY = '2026-10-09'; // пятница
const H = 'habit-water';
const OTHER = 'habit-run';

/** Отметки одной привычки: ci('h', '2026-10-07', '2026-10-08') */
const ci = (habitId, ...dates) => dates.map((date) => ({ habitId, date }));

/** Habit с датой создания */
const habit = (id, createdAt) => ({ id, title: `Привычка ${id}`, createdAt });

/** Замкнутый период */
const period = (from, to) => ({ from, to });

const HB = habit(H, '2026-09-01'); // создана до всех периодов ниже
const P_WEEK = period('2026-10-01', '2026-10-05');

// ─── getCurrentStreak: позитивные сценарии ──────────────────────────────────────

test('стек: 3 дня подряд, последняя отметка сегодня -> 3', () => {
  const entries = ci(H, '2026-10-07', '2026-10-08', '2026-10-09');
  assert.strictEqual(getCurrentStreak(entries, H, TODAY), 3);
});

test('одна отметка сегодня -> 1', () => {
  assert.strictEqual(getCurrentStreak(ci(H, TODAY), H, TODAY), 1);
});

test('последняя отметка вчера: серия жива (3 дня, конец вчера) -> 3', () => {
  const entries = ci(H, '2026-10-06', '2026-10-07', '2026-10-08');
  assert.strictEqual(getCurrentStreak(entries, H, TODAY), 3);
});

test('одна отметка вчера -> 1 (граница «вчера» ещё держит серию)', () => {
  assert.strictEqual(getCurrentStreak(ci(H, '2026-10-08'), H, TODAY), 1);
});

// ─── getCurrentStreak: краевые случаи ───────────────────────────────────────────

test('последняя отметка 2 дня назад -> серия мертва, 0 (кейс 11)', () => {
  assert.strictEqual(getCurrentStreak(ci(H, '2026-10-07'), H, TODAY), 0);
});

test('разрыв в середине истории: считается только хвост после разрыва', () => {
  // 10-03, 10-04 | пропуск | 10-08, 10-09 -> текущая серия 2
  const entries = ci(H, '2026-10-03', '2026-10-04', '2026-10-08', '2026-10-09');
  assert.strictEqual(getCurrentStreak(entries, H, TODAY), 2);
});

test('переход месяца: 30-31 января + 1-2 февраля -> 4 (кейс 7, баг ДЗ1 v1)', () => {
  const entries = ci(H, '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02');
  assert.strictEqual(getCurrentStreak(entries, H, '2026-02-02'), 4);
});

test('переход месяца в невисокосный год: 27-28 февраля + 1 марта -> 3', () => {
  const entries = ci(H, '2026-02-27', '2026-02-28', '2026-03-01');
  assert.strictEqual(getCurrentStreak(entries, H, '2026-03-01'), 3);
});

test('переход года: 30-31 декабря + 1 января -> 3', () => {
  const entries = ci(H, '2026-12-30', '2026-12-31', '2027-01-01');
  assert.strictEqual(getCurrentStreak(entries, H, '2027-01-01'), 3);
});

test('високосный год: 28-29 февраля + 1 марта 2024 -> 3', () => {
  const entries = ci(H, '2024-02-28', '2024-02-29', '2024-03-01');
  assert.strictEqual(getCurrentStreak(entries, H, '2024-03-01'), 3);
});

test('вход не отсортирован, есть дубли и чужие отметки -> как нормализованный', () => {
  const messy = [
    ...ci(H, '2026-10-09', '2026-10-07'),
    ...ci(OTHER, '2026-10-08'),
    ...ci(H, '2026-10-08', '2026-10-08', '2026-10-07'),
  ];
  assert.strictEqual(getCurrentStreak(messy, H, TODAY), 3);
});

test('чужие отметки фильтруются до валидации: битая дата чужой привычки не бросает (кейс 4)', () => {
  const entries = [...ci(OTHER, 'не-дата', '2026-10-09'), ...ci(H, '2026-10-09')];
  assert.strictEqual(getCurrentStreak(entries, H, TODAY), 1);
});

test('отметки из будущего не продлевают серию', () => {
  const entries = ci(H, '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12');
  assert.strictEqual(getCurrentStreak(entries, H, TODAY), 3);
});

test('все отметки в будущем -> 0', () => {
  assert.strictEqual(getCurrentStreak(ci(H, '2026-10-20', '2026-10-21'), H, TODAY), 0);
});

test('пустые данные: [] / null / undefined -> 0, не исключение (кейс 1)', () => {
  assert.strictEqual(getCurrentStreak([], H, TODAY), 0);
  assert.strictEqual(getCurrentStreak(null, H, TODAY), 0);
  assert.strictEqual(getCurrentStreak(undefined, H, TODAY), 0);
});

test('нет отметок этой привычки (только чужие) -> 0 (кейс 5)', () => {
  assert.strictEqual(getCurrentStreak(ci(OTHER, '2026-10-09'), H, TODAY), 0);
});

test('today можно передать объектом Date, день берётся по UTC (кейс 9)', () => {
  const entries = ci(H, '2026-10-08', '2026-10-09');
  assert.strictEqual(getCurrentStreak(entries, H, new Date('2026-10-09')), 2);
  // середина UTC-дня: локальный сдвиг таймзоны не должен менять календарный день
  assert.strictEqual(getCurrentStreak(entries, H, new Date(Date.UTC(2026, 9, 9, 18))), 2);
});

// ─── getBestStreak: позитивные сценарии ─────────────────────────────────────────

test('лучшая серия в середине истории: серии 2 | 4 | 3 -> 4 с календарными границами', () => {
  const entries = ci(
    H,
    '2026-10-01', '2026-10-02', // серия 2
    '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', // серия 4
    '2026-10-10', '2026-10-11', '2026-10-12' // серия 3
  );
  assert.deepStrictEqual(getBestStreak(entries, H), {
    length: 4,
    start: '2026-10-05',
    end: '2026-10-08',
  });
});

test('одна отметка -> { length: 1, start = end }', () => {
  assert.deepStrictEqual(getBestStreak(ci(H, '2026-10-09'), H), {
    length: 1,
    start: '2026-10-09',
    end: '2026-10-09',
  });
});

test('лучшая серия не зависит от today: будущие отметки тоже учитываются', () => {
  const entries = ci(H, '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05');
  assert.deepStrictEqual(getBestStreak(entries, H), {
    length: 5,
    start: '2027-01-01',
    end: '2027-01-05',
  });
});

// ─── getBestStreak: краевые случаи ──────────────────────────────────────────────

test('оборвавшаяся текущая серия — не лучшая; лучшая ранняя длинная (кейс 11)', () => {
  // ранняя серия 28.09-02.10 (5 дней через границу месяца), хвост 08-10 (живой)
  const entries = ci(
    H,
    '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
    '2026-10-08', '2026-10-09'
  );
  assert.deepStrictEqual(getBestStreak(entries, H), {
    length: 5,
    start: '2026-09-28',
    end: '2026-10-02',
  });
  // текущая при этом жива и равна 2 — «лучшая» и «текущая» не путаются
  assert.strictEqual(getCurrentStreak(entries, H, TODAY), 2);
});

test('равная длина серий -> побеждает более ранняя (кейс 21)', () => {
  const entries = ci(
    H,
    '2026-10-01', '2026-10-02', '2026-10-03',
    '2026-10-10', '2026-10-11', '2026-10-12'
  );
  assert.deepStrictEqual(getBestStreak(entries, H), {
    length: 3,
    start: '2026-10-01',
    end: '2026-10-03',
  });
});

test('серия через границу года: 30.12-02.01 -> 4', () => {
  const entries = ci(H, '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02');
  assert.deepStrictEqual(getBestStreak(entries, H), {
    length: 4,
    start: '2026-12-30',
    end: '2027-01-02',
  });
});

test('не отсортировано, дубли, чужие отметки -> та же лучшая серия', () => {
  const messy = [
    ...ci(H, '2026-10-06', '2026-10-05', '2026-10-08'),
    ...ci(OTHER, '2026-10-07'),
    ...ci(H, '2026-10-07', '2026-10-07', '2026-10-05'),
  ];
  assert.deepStrictEqual(getBestStreak(messy, H), {
    length: 4,
    start: '2026-10-05',
    end: '2026-10-08',
  });
});

test('пустые данные и отсутствие отметок привычки -> null, не исключение (кейсы 1, 5)', () => {
  assert.strictEqual(getBestStreak([], H), null);
  assert.strictEqual(getBestStreak(null, H), null);
  assert.strictEqual(getBestStreak(ci(OTHER, TODAY), H), null);
});

// ─── getCompletionRate: позитивные сценарии ─────────────────────────────────────

test('базовый процент: отметки в 2 днях из 4 -> 50', () => {
  const entries = ci(H, '2026-10-01', '2026-10-04');
  const p4 = period('2026-10-01', '2026-10-04');
  assert.deepStrictEqual(getCompletionRate(entries, HB, p4, TODAY), {
    percent: 50,
    done: 2,
    expected: 4,
  });
});

test('границы периода включаются: окно ровно из 2 дней закрыто отметками -> 100 (кейс 16)', () => {
  const entries = ci(H, '2026-10-01', '2026-10-02');
  const p = period('2026-10-01', '2026-10-02');
  assert.deepStrictEqual(getCompletionRate(entries, HB, p, TODAY), {
    percent: 100,
    done: 2,
    expected: 2,
  });
});

test('все дни окна покрыты -> 100', () => {
  const entries = ci(H, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04');
  const p = period('2026-10-01', '2026-10-04');
  assert.deepStrictEqual(getCompletionRate(entries, HB, p, TODAY), {
    percent: 100,
    done: 4,
    expected: 4,
  });
});

test('округление до 1 знака: 1/3 -> 33.3, 2/3 -> 66.7', () => {
  const p3 = period('2026-10-01', '2026-10-03');
  const one = getCompletionRate(ci(H, '2026-10-02'), HB, p3, TODAY);
  const two = getCompletionRate(ci(H, '2026-10-01', '2026-10-02'), HB, p3, TODAY);
  assert.deepStrictEqual(one, { percent: 33.3, done: 1, expected: 3 });
  assert.deepStrictEqual(two, { percent: 66.7, done: 2, expected: 3 });
});

test('today можно передать объектом Date (кейс 9)', () => {
  const p = period('2026-10-01', '2026-10-02');
  const res = getCompletionRate(ci(H, '2026-10-01'), HB, p, new Date('2026-10-02'));
  assert.deepStrictEqual(res, { percent: 50, done: 1, expected: 2 });
});

// ─── getCompletionRate: краевые случаи окна [max(from, createdAt) .. min(to, today)]

test('createdAt внутри периода: дни до создания не обязательны и не в числителе (кейс 14)', () => {
  // окно [02..05], отметки 01 (до создания), 02, 03 -> 2 из 4 = 50
  const created = habit(H, '2026-10-02');
  const entries = ci(H, '2026-10-01', '2026-10-02', '2026-10-03');
  const p = period('2026-10-01', '2026-10-05');
  assert.deepStrictEqual(getCompletionRate(entries, created, p, TODAY), {
    percent: 50,
    done: 2,
    expected: 4,
  });
});

test('period.to позже today: окно обрезается по today, будущее не в знаменателе (кейс 15)', () => {
  // период 01-31, today 09: окно 01..09 (expected 9, а не 31);
  // отметки 01..05 + будущая 20-е -> done 5, будущая не в числителе
  const entries = ci(
    H, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-20'
  );
  const p = period('2026-10-01', '2026-10-31');
  assert.deepStrictEqual(getCompletionRate(entries, HB, p, TODAY), {
    percent: 55.6, // 5 из 9
    done: 5,
    expected: 9,
  });
});

test('пустое окно (период целиком в будущем) -> percent 0, не NaN/Infinity (кейс 13)', () => {
  const p = period('2026-11-01', '2026-11-30');
  assert.deepStrictEqual(getCompletionRate(ci(H, '2026-11-05'), HB, p, TODAY), {
    percent: 0,
    done: 0,
    expected: 0,
  });
});

test('пустое окно (период целиком до создания привычки) -> percent 0 (кейсы 13-14)', () => {
  const created = habit(H, '2026-10-10');
  const p = period('2026-10-01', '2026-10-05');
  assert.deepStrictEqual(getCompletionRate(ci(H, '2026-10-03'), created, p, TODAY), {
    percent: 0,
    done: 0,
    expected: 0,
  });
});

test('период с from > to -> пустое окно, percent 0', () => {
  const p = period('2026-10-10', '2026-10-01');
  assert.deepStrictEqual(getCompletionRate([], HB, p, TODAY), { percent: 0, done: 0, expected: 0 });
});

test('нет отметок (в т.ч. null) -> done 0, expected = размер окна', () => {
  assert.deepStrictEqual(getCompletionRate(null, HB, P_WEEK, TODAY), {
    percent: 0,
    done: 0,
    expected: 5,
  });
});

test('дубли, чужие и внеоконные отметки не накручивают percent выше 100', () => {
  const entries = [
    ...ci(H, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'),
    ...ci(H, '2026-10-03', '2026-10-03'), // дубли схлопываются
    ...ci(OTHER, '2026-10-02', 'не-дата'), // чужие, включая битую дату
    ...ci(H, '2026-09-30', '2026-10-15'), // до окна и после today
  ];
  assert.deepStrictEqual(getCompletionRate(entries, HB, P_WEEK, TODAY), {
    percent: 100,
    done: 5,
    expected: 5,
  });
});

test('високосное окно: 27.02-01.03.2024 -> expected 4 (29 февраля считается)', () => {
  const h2024 = habit(H, '2024-01-01');
  const entries = ci(H, '2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01');
  const p = period('2024-02-27', '2024-03-01');
  assert.deepStrictEqual(getCompletionRate(entries, h2024, p, '2024-03-05'), {
    percent: 100,
    done: 4,
    expected: 4,
  });
});

// ─── groupByWeeks: позитивные сценарии ──────────────────────────────────────────

test('по умолчанию неделя пн-вс: воскресенье попадает к понедельнику той же недели', () => {
  const buckets = groupByWeeks(ci(H, '2026-10-11'), H); // вс 11.10
  assert.deepStrictEqual(buckets, [
    { weekStart: '2026-10-05', weekEnd: '2026-10-11', dates: ['2026-10-11'], count: 1 },
  ]);
});

test("weekStartsOn: 'sun' — воскресенье начинает новую неделю", () => {
  const buckets = groupByWeeks(ci(H, '2026-10-11'), H, { weekStartsOn: 'sun' });
  assert.deepStrictEqual(buckets, [
    { weekStart: '2026-10-11', weekEnd: '2026-10-17', dates: ['2026-10-11'], count: 1 },
  ]);
});

test('полная неделя пн-вс — одна корзина на все 7 отметок', () => {
  const entries = ci(
    H, '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10',
    '2026-10-11'
  );
  assert.deepStrictEqual(groupByWeeks(entries, H), [
    {
      weekStart: '2026-10-05',
      weekEnd: '2026-10-11',
      dates: [
        '2026-10-05', '2026-10-06', '2026-10-07',
        '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
      ],
      count: 7,
    },
  ]);
});

test('одни и те же даты режутся по-разному при mon и sun (кейс 18)', () => {
  // вс 25.10 - сб 31.10: при 'mon' две корзины, при 'sun' одна
  const dates = [
    '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30',
    '2026-10-31',
  ];
  assert.deepStrictEqual(groupByWeeks(ci(H, ...dates), H), [
    { weekStart: '2026-10-19', weekEnd: '2026-10-25', dates: ['2026-10-25'], count: 1 },
    {
      weekStart: '2026-10-26',
      weekEnd: '2026-11-01', // подпись недели переходит в ноябрь
      dates: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'],
      count: 6,
    },
  ]);
  assert.deepStrictEqual(groupByWeeks(ci(H, ...dates), H, { weekStartsOn: 'sun' }), [
    {
      weekStart: '2026-10-25',
      weekEnd: '2026-10-31',
      dates: [
        '2026-10-25', '2026-10-26', '2026-10-27',
        '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
      ],
      count: 7,
    },
  ]);
});

// ─── groupByWeeks: краевые случаи ───────────────────────────────────────────────

test('неделя на стыке месяцев — одна корзина (кейс 17)', () => {
  const buckets = groupByWeeks(ci(H, '2026-09-30', '2026-10-01'), H); // ср + чт
  assert.deepStrictEqual(buckets, [
    {
      weekStart: '2026-09-28',
      weekEnd: '2026-10-04',
      dates: ['2026-09-30', '2026-10-01'],
      count: 2,
    },
  ]);
});

test('неделя на стыке годов — одна корзина (кейс 17)', () => {
  const buckets = groupByWeeks(ci(H, '2026-12-31', '2027-01-01'), H); // чт + пт
  assert.deepStrictEqual(buckets, [
    {
      weekStart: '2026-12-28',
      weekEnd: '2027-01-03',
      dates: ['2026-12-31', '2027-01-01'],
      count: 2,
    },
  ]);
});

test('пустые недели корзин не образуют; корзины по возрастанию weekStart (кейс 19)', () => {
  // недели 28.09-04.10 и 12-18.10; между ними пустая неделя 05-11.10
  const entries = ci(H, '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-13');
  assert.deepStrictEqual(groupByWeeks(entries, H), [
    {
      weekStart: '2026-09-28',
      weekEnd: '2026-10-04',
      dates: ['2026-09-30', '2026-10-01', '2026-10-02'],
      count: 3,
    },
    { weekStart: '2026-10-12', weekEnd: '2026-10-18', dates: ['2026-10-13'], count: 1 },
  ]);
});

test('period обрезает dates/count, но подписи недели остаются полными 7 дней (кейс 18)', () => {
  const entries = ci(
    H,
    '2026-10-05', '2026-10-06', // до from — не попадают
    '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    '2026-10-12', '2026-10-13',
    '2026-10-14', '2026-10-15' // после to — не попадают
  );
  const buckets = groupByWeeks(entries, H, { period: period('2026-10-07', '2026-10-13') });
  assert.deepStrictEqual(buckets, [
    {
      weekStart: '2026-10-05', // полная подпись, хотя 05-06.10 отрезаны периодом
      weekEnd: '2026-10-11',
      dates: ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
      count: 5,
    },
    {
      weekStart: '2026-10-12',
      weekEnd: '2026-10-18', // полная подпись, хотя 14-15.10 отрезаны периодом
      dates: ['2026-10-12', '2026-10-13'],
      count: 2,
    },
  ]);
});

test('period с from > to -> пустой результат (кейс 15)', () => {
  const res = groupByWeeks(ci(H, TODAY), H, { period: period('2026-10-19', '2026-10-05') });
  assert.deepStrictEqual(res, []);
});

test('options: null / {} / period: null -> значения по умолчанию', () => {
  const expected = [
    { weekStart: '2026-10-05', weekEnd: '2026-10-11', dates: ['2026-10-09'], count: 1 },
  ];
  assert.deepStrictEqual(groupByWeeks(ci(H, TODAY), H, null), expected);
  assert.deepStrictEqual(groupByWeeks(ci(H, TODAY), H, {}), expected);
  assert.deepStrictEqual(groupByWeeks(ci(H, TODAY), H, { period: null }), expected);
});

test('дубли и порядок входа нормализуются: dates уникальны и по возрастанию', () => {
  const messy = [...ci(H, '2026-10-09', '2026-10-07', '2026-10-09'), ...ci(OTHER, '2026-10-08')];
  assert.deepStrictEqual(groupByWeeks(messy, H), [
    {
      weekStart: '2026-10-05',
      weekEnd: '2026-10-11',
      dates: ['2026-10-07', '2026-10-09'],
      count: 2,
    },
  ]);
});

test('чужие отметки игнорируются, их битые даты не валидируются (кейс 4)', () => {
  const entries = [...ci(OTHER, 'не-дата'), ...ci(H, '2026-10-09')];
  assert.deepStrictEqual(groupByWeeks(entries, H), [
    { weekStart: '2026-10-05', weekEnd: '2026-10-11', dates: ['2026-10-09'], count: 1 },
  ]);
});

test('пустые данные и отсутствие отметок привычки -> [] (кейсы 1, 5)', () => {
  assert.deepStrictEqual(groupByWeeks([], H), []);
  assert.deepStrictEqual(groupByWeeks(null, H), []);
  assert.deepStrictEqual(groupByWeeks(ci(OTHER, TODAY), H), []);
});

// ─── Ошибки (fail fast) ─────────────────────────────────────────────────────────

test('нестроковый habitId -> TypeError во всех функциях', () => {
  assert.throws(() => getCurrentStreak([], 42, TODAY), TypeError);
  assert.throws(() => getBestStreak([], 42), TypeError);
  assert.throws(() => getCompletionRate([], habit(42, '2026-09-01'), P_WEEK, TODAY), TypeError);
  assert.throws(() => groupByWeeks([], 42), TypeError);
});

test('checkIns — не массив -> TypeError (fail fast)', () => {
  assert.throws(() => getCurrentStreak('2026-10-09', H, TODAY), TypeError);
  assert.throws(() => getBestStreak('2026-10-09', H), TypeError);
  assert.throws(() => getCompletionRate('x', HB, P_WEEK, TODAY), TypeError);
  assert.throws(() => groupByWeeks('x', H), TypeError);
});

test('невалидный формат даты отметки -> TypeError', () => {
  for (const bad of ['05.10.2026', '2026-10-9', '2026-10', '20261009']) {
    assert.throws(() => getCurrentStreak(ci(H, bad), H, TODAY), TypeError, `формат: ${bad}`);
  }
});

test('несуществующая календарная дата отметки -> TypeError', () => {
  for (const bad of ['2027-02-29', '2026-11-31', '2026-04-31', '2026-13-01']) {
    assert.throws(() => getBestStreak(ci(H, bad), H), TypeError, `дата: ${bad}`);
  }
});

test('невалидный today (строка или Date) -> TypeError', () => {
  assert.throws(() => getCurrentStreak([], H, '05.10.2026'), TypeError);
  assert.throws(() => getCurrentStreak([], H, 'вчера'), TypeError);
  assert.throws(() => getCompletionRate([], HB, P_WEEK, new Date('nope')), TypeError);
});

test('TypeError: habit не объект или без строкового id', () => {
  assert.throws(() => getCompletionRate([], null, P_WEEK, TODAY), TypeError);
  assert.throws(() => getCompletionRate([], 'water', P_WEEK, TODAY), TypeError);
  assert.throws(() => getCompletionRate([], { title: 'без id' }, P_WEEK, TODAY), TypeError);
});

test('TypeError: period не объект или с невалидными датами', () => {
  assert.throws(() => getCompletionRate([], HB, null, TODAY), TypeError);
  assert.throws(() => getCompletionRate([], HB, 'октябрь', TODAY), TypeError);
  assert.throws(() => getCompletionRate([], HB, period('05.10.2026', '2026-10-05'), TODAY), TypeError);
  assert.throws(() => getCompletionRate([], HB, period('2026-10-01', '2026-10-32'), TODAY), TypeError);
});

test('TypeError: невалидный createdAt или дата отметки в getCompletionRate', () => {
  const created = habit(H, '2027-02-29');
  assert.throws(() => getCompletionRate([], created, P_WEEK, TODAY), TypeError);
  assert.throws(() => getCompletionRate(ci(H, '2026-10-5'), HB, P_WEEK, TODAY), TypeError);
});

test('TypeError: недопустимый weekStartsOn или options не объект', () => {
  assert.throws(() => groupByWeeks([], H, { weekStartsOn: 'tue' }), TypeError);
  assert.throws(() => groupByWeeks([], H, 'mon'), TypeError);
});

test('TypeError: невалидный period в options groupByWeeks', () => {
  assert.throws(() => groupByWeeks([], H, { period: 'октябрь' }), TypeError);
  assert.throws(() => groupByWeeks([], H, { period: period('2026-02-30', '2026-03-01') }), TypeError);
});

test('TypeError: невалидная дата отметки в groupByWeeks', () => {
  assert.throws(() => groupByWeeks(ci(H, '2026-10-09', '2026-10-40'), H), TypeError);
});

// ─── Инвариант чистоты ──────────────────────────────────────────────────────────

test('чистота: функции не мутируют входной массив отметок', () => {
  const input = [...ci(H, '2026-10-09', '2026-10-07'), ...ci(OTHER, '2026-10-08')];
  const snapshot = JSON.parse(JSON.stringify(input));
  getCurrentStreak(input, H, TODAY);
  getBestStreak(input, H);
  getCompletionRate(input, HB, period('2026-10-01', '2026-10-09'), TODAY);
  groupByWeeks(input, H);
  assert.deepStrictEqual(input, snapshot);
});
