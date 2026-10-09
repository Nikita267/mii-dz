// Расчёт текущей серии (streak) выполнений привычки.
// Версия 2 (итерация 2): сравнение соседних дат переведено на полные даты
// в миллисекундах — исправлен баг версии 1 на границе месяца
// (сравнение getDate() давало 30 -> 1 как разрыв серии).
//
// entries — массив дат отметок в формате 'YYYY-MM-DD' (порядок произвольный).
// today   — «сегодня» (инъектируется для детерминированных тестов).
// Возвращает длину текущей серии: серия считается «живой», если последняя
// отметка — сегодня или вчера; в остальных случаях 0.

'use strict';

function calculateStreak(entries, today) {
  if (!entries || entries.length === 0) return 0;

  const unique = Array.from(new Set(entries)).sort().reverse(); // убывание дат
  const last = new Date(unique[0]);
  const ref = today instanceof Date ? today : new Date(today);

  // серия актуальна, только если последняя отметка — сегодня или вчера
  const dayDiffToRef = Math.round((ref - last) / 86400000);
  if (dayDiffToRef > 1 || dayDiffToRef < 0) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const cur = new Date(unique[i]);
    const dayGap = Math.round((prev - cur) / 86400000);
    if (dayGap === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Экспорт для Node.js; в браузере функция доступна глобально
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateStreak };
}
