// Тесты утилит форматирования: node:test, без внешних зависимостей.
// Контрольное «сегодня» передаётся вторым аргументом, чтобы проверки
// не зависели от реальной даты запуска.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatStreak, weekLabel } from './format.js';

// Среда 3 сентября 2025: текущая неделя — пн 01.09 – вс 07.09.
const NOW = new Date(2025, 8, 3, 12, 0, 0);

describe('formatStreak', () => {
  it('0 и «пустые» данные — «нет серии»', () => {
    assert.equal(formatStreak(0), 'нет серии');
    assert.equal(formatStreak(-1), 'нет серии');
    assert.equal(formatStreak(-100), 'нет серии');
    assert.equal(formatStreak(NaN), 'нет серии');
    assert.equal(formatStreak(undefined), 'нет серии');
    assert.equal(formatStreak(null), 'нет серии');
  });

  it('1 — «1 день»', () => {
    assert.equal(formatStreak(1), '1 день');
  });

  it('2–4 — «N дня»', () => {
    assert.equal(formatStreak(2), '2 дня');
    assert.equal(formatStreak(3), '3 дня');
    assert.equal(formatStreak(4), '4 дня');
  });

  it('5–20 — «N дней»', () => {
    assert.equal(formatStreak(5), '5 дней');
    assert.equal(formatStreak(6), '6 дней');
    assert.equal(formatStreak(20), '20 дней');
  });

  it('11–14 — исключение: всегда «дней»', () => {
    assert.equal(formatStreak(11), '11 дней');
    assert.equal(formatStreak(12), '12 дней');
    assert.equal(formatStreak(14), '14 дней');
  });

  it('21, 22, 25 — формы по последней цифре, а не «5+ дней»', () => {
    assert.equal(formatStreak(21), '21 день');
    assert.equal(formatStreak(22), '22 дня');
    assert.equal(formatStreak(24), '24 дня');
    assert.equal(formatStreak(25), '25 дней');
  });

  it('длинные серии: 101 и 111 — разные формы', () => {
    assert.equal(formatStreak(101), '101 день');
    assert.equal(formatStreak(111), '111 дней');
    assert.equal(formatStreak(121), '121 день');
  });

  it('дробное значение округляется вниз', () => {
    assert.equal(formatStreak(2.9), '2 дня');
  });
});

describe('weekLabel — текущая неделя', () => {
  it('сегодня — «эта неделя»', () => {
    assert.equal(weekLabel(new Date(2025, 8, 3), NOW), 'эта неделя');
  });

  it('вчера внутри той же недели — «эта неделя»', () => {
    assert.equal(weekLabel(new Date(2025, 8, 2), NOW), 'эта неделя');
  });

  it('границы недели: полночь понедельника и 23:59 воскресенья', () => {
    assert.equal(weekLabel(new Date(2025, 8, 1, 0, 0, 0), NOW), 'эта неделя');
    assert.equal(weekLabel(new Date(2025, 8, 7, 23, 59, 59), NOW), 'эта неделя');
  });
});

describe('weekLabel — прошлая неделя', () => {
  it('воскресенье прошлой недели (вчера относительно понедельника)', () => {
    const mondayNow = new Date(2025, 8, 1, 9, 0, 0);
    assert.equal(weekLabel(new Date(2025, 8, 3), mondayNow), 'эта неделя');
    assert.equal(weekLabel(new Date(2025, 7, 31), mondayNow), 'прошлая неделя');
  });

  it('понедельник прошлой недели', () => {
    assert.equal(weekLabel(new Date(2025, 7, 25), NOW), 'прошлая неделя');
  });
});

describe('weekLabel — диапазоны дат', () => {
  it('неделя двумя раньше — диапазон без года', () => {
    assert.equal(weekLabel(new Date(2025, 7, 24), NOW), '18 – 24 августа');
  });

  it('переход месяца внутри недели — как в примере ТЗ', () => {
    const laterNow = new Date(2025, 9, 15);
    assert.equal(weekLabel(new Date(2025, 9, 1), laterNow), '29 сентября – 5 октября');
  });

  it('переход года внутри недели — с годами на обоих концах', () => {
    const januaryNow = new Date(2025, 0, 20);
    assert.equal(
      weekLabel(new Date(2025, 0, 1), januaryNow),
      '30 декабря 2024 – 5 января 2025'
    );
  });

  it('будущая неделя — тоже диапазон', () => {
    assert.equal(weekLabel(new Date(2025, 8, 8), NOW), '8 – 14 сентября');
  });
});

describe('weekLabel — некорректный ввод', () => {
  it('выбрасывает TypeError для не-Date и битых дат', () => {
    assert.throws(() => weekLabel(null, NOW), TypeError);
    assert.throws(() => weekLabel('2025-09-03', NOW), TypeError);
    assert.throws(() => weekLabel(new Date('битая строка'), NOW), TypeError);
  });
});
