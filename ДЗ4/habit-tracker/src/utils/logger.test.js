// Тесты структурированного логгера (Vitest). Консоль мокается: проверяется
// содержимое записей и фильтрация уровней, а сам вывод не засоряет прогон.
// Порог VITE_LOG_LEVEL подменяется через vi.stubEnv — logger читает его
// при каждой записи, поэтому порядок тестов не имеет значения.

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';

import { logDebug, logError, logInfo, logWarning } from './logger.js';

/** Мок console.log — приёмник записей debug/info. */
let logSpy;
/** Мок console.warn — приёмник записей warning. */
let warnSpy;
/** Мок console.error — приёмник записей error. */
let errorSpy;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('logger — JSON-формат записи', () => {
  it('каждая запись — одна строка, парсящаяся как JSON', () => {
    logInfo('app_started');
    logInfo('screen_opened', { screen: 'today' });
    assert.equal(logSpy.mock.calls.length, 2);
    for (const [line] of logSpy.mock.calls) {
      assert.doesNotThrow(() => JSON.parse(line));
    }
  });

  it('запись содержит ts (валидный ISO), level и msg', () => {
    const before = Date.now();
    logInfo('boot');
    const after = Date.now();
    const entry = JSON.parse(logSpy.mock.calls[0][0]);
    assert.equal(entry.level, 'info');
    assert.equal(entry.msg, 'boot');
    const tsMs = Date.parse(entry.ts);
    assert.ok(!Number.isNaN(tsMs), 'ts должен быть валидной ISO-датой');
    assert.ok(tsMs >= before - 1 && tsMs <= after + 1, 'ts — момент записи');
  });

  it('без контекста запись состоит ровно из полей ts, level, msg', () => {
    logWarning('sync_skipped');
    const entry = JSON.parse(warnSpy.mock.calls[0][0]);
    assert.deepEqual(Object.keys(entry).sort(), ['level', 'msg', 'ts']);
  });

  it('контекст расширяет запись своими полями', () => {
    logInfo('habit_created', { habitId: 'h-1', title: 'Зарядка' });
    const entry = JSON.parse(logSpy.mock.calls[0][0]);
    assert.equal(entry.habitId, 'h-1');
    assert.equal(entry.title, 'Зарядка');
    assert.equal(entry.msg, 'habit_created');
  });

  it('warning идёт в console.warn, error — в console.error', () => {
    logWarning('checkin_reverted');
    logError('habits_load_failed');
    assert.equal(warnSpy.mock.calls.length, 1);
    assert.equal(errorSpy.mock.calls.length, 1);
    assert.equal(logSpy.mock.calls.length, 0, 'warning/error не пишутся в console.log');
  });

  it('перевод строки и кавычки экранируются — запись остаётся одной строкой', () => {
    logWarning('multi\nline', { note: 'значение "с кавычками"' });
    const line = warnSpy.mock.calls[0][0];
    assert.ok(!line.includes('\n'), 'в строке не должно быть сырых переводов');
    const entry = JSON.parse(line);
    assert.equal(entry.msg, 'multi\nline');
    assert.equal(entry.note, 'значение "с кавычками"');
  });
});

describe('logger — фильтрация уровней', () => {
  it('по умолчанию (VITE_LOG_LEVEL не задан) debug отбрасывается, info проходит', () => {
    vi.stubEnv('VITE_LOG_LEVEL', undefined);
    logDebug('trace');
    logInfo('state_ready');
    assert.equal(logSpy.mock.calls.length, 1);
    assert.equal(JSON.parse(logSpy.mock.calls[0][0]).msg, 'state_ready');
  });

  it('VITE_LOG_LEVEL=debug пропускает debug-записи', () => {
    vi.stubEnv('VITE_LOG_LEVEL', 'debug');
    logDebug('trace');
    assert.equal(logSpy.mock.calls.length, 1);
  });

  it('VITE_LOG_LEVEL=warning пропускает только warning и error', () => {
    vi.stubEnv('VITE_LOG_LEVEL', 'warning');
    logDebug('trace');
    logInfo('state_ready');
    logWarning('checkin_reverted');
    logError('habits_load_failed');
    assert.equal(logSpy.mock.calls.length, 0, 'debug/info ниже порога');
    assert.equal(warnSpy.mock.calls.length, 1);
    assert.equal(errorSpy.mock.calls.length, 1);
  });

  it('VITE_LOG_LEVEL=error пропускает только error', () => {
    vi.stubEnv('VITE_LOG_LEVEL', 'error');
    logDebug('trace');
    logInfo('state_ready');
    logWarning('checkin_reverted');
    logError('habits_load_failed');
    assert.equal(logSpy.mock.calls.length, 0);
    assert.equal(warnSpy.mock.calls.length, 0);
    assert.equal(errorSpy.mock.calls.length, 1);
  });

  it('неизвестное значение откатывается к info', () => {
    vi.stubEnv('VITE_LOG_LEVEL', 'verbose');
    logDebug('trace');
    logInfo('state_ready');
    assert.equal(logSpy.mock.calls.length, 1);
    assert.equal(JSON.parse(logSpy.mock.calls[0][0]).msg, 'state_ready');
  });
});
