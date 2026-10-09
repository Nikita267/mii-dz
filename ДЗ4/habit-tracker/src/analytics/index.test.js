import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initAnalytics, isAnalyticsEnabled, trackEvent } from './index.js';

/*
 * Тесты модуля аналитики (ДЗ6): без env ничего не грузится и события —
 * полный no-op; с env (vi.stubEnv) вставляется скрипт нужного счётчика,
 * а события уходят в window.dataLayer (GA4) и window.ym (Метрика).
 * Глобалы трекинга подменяются руками — реальная сеть в тестах не участвует.
 */

/** Вставленные скрипты счётчиков и глобалы трекинга — чистим между тестами. */
function cleanupTrackingGlobals() {
  document
    .querySelectorAll('script[data-ht-analytics]')
    .forEach((tag) => tag.remove());
  delete window.gtag;
  delete window.ym;
  delete window.dataLayer;
}

beforeEach(() => {
  cleanupTrackingGlobals();
});

afterEach(() => {
  cleanupTrackingGlobals();
  vi.unstubAllEnvs();
});

/** Скрипты, вставленные модулем в текущем документе. */
function analyticsScripts() {
  return Array.from(document.querySelectorAll('script[data-ht-analytics]'));
}

describe('аналитика — без переменных окружения', () => {
  it('isAnalyticsEnabled возвращает false, initAnalytics не вставляет скриптов', () => {
    expect(isAnalyticsEnabled()).toBe(false);

    initAnalytics();

    expect(analyticsScripts()).toHaveLength(0);
  });

  it('trackEvent — тихий no-op: без env ничего не создаёт и не бросает', () => {
    expect(() => trackEvent('habit_created')).not.toThrow();

    expect(window.dataLayer).toBeUndefined();
    expect(window.gtag).toBeUndefined();
    expect(window.ym).toBeUndefined();
  });
});

describe('аналитика — GA4 (VITE_GA_MEASUREMENT_ID)', () => {
  it('initAnalytics вставляет gtag.js с ID и настраивает поток через dataLayer', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');

    expect(isAnalyticsEnabled()).toBe(true);
    initAnalytics();

    expect(analyticsScripts()).toHaveLength(1);
    expect(analyticsScripts()[0].getAttribute('src')).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-TEST123'
    );
    expect(typeof window.gtag).toBe('function');
    // Официальный сниппет: 'js' с датой и 'config' с идентификатором потока.
    expect(window.dataLayer).toContainEqual(['config', 'G-TEST123']);
  });

  it('trackEvent пушит событие с параметрами в dataLayer', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    initAnalytics();

    trackEvent('habit_toggled', { done: true });

    expect(window.dataLayer.at(-1)).toEqual(['event', 'habit_toggled', { done: true }]);
  });

  it('без вызова initAnalytics (глобалы не готовы) trackEvent — no-op', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');

    expect(() => trackEvent('screen_view', { screen: 'today' })).not.toThrow();
    expect(window.dataLayer).toBeUndefined();
  });

  it('повторный initAnalytics не дублирует скрипт (StrictMode)', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');

    initAnalytics();
    initAnalytics();

    expect(analyticsScripts()).toHaveLength(1);
  });
});

describe('аналитика — Яндекс.Метрика (VITE_YM_COUNTER_ID)', () => {
  it('initAnalytics вставляет tag.js и инициализирует счётчик без вебвизора', () => {
    vi.stubEnv('VITE_YM_COUNTER_ID', '12345678');
    window.ym = vi.fn();

    initAnalytics();

    expect(analyticsScripts()).toHaveLength(1);
    expect(analyticsScripts()[0].getAttribute('src')).toBe(
      'https://mc.yandex.ru/metrika/tag.js'
    );
    expect(window.ym).toHaveBeenCalledWith(
      12345678,
      'init',
      expect.objectContaining({ clickmap: true, accurateTrackBounce: true, webvisor: false })
    );
  });

  it('trackEvent отправляет reachGoal с номером счётчика и параметрами', () => {
    vi.stubEnv('VITE_YM_COUNTER_ID', '12345678');
    window.ym = vi.fn();
    initAnalytics();

    trackEvent('habit_archived');

    expect(window.ym).toHaveBeenCalledWith(12345678, 'reachGoal', 'habit_archived', {});
  });

  it('когда задан только GA, до Метрики события не доходят', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    window.ym = vi.fn();
    initAnalytics();

    trackEvent('habit_created');

    expect(window.ym).not.toHaveBeenCalled();
  });
});

describe('аналитика — оба счётчика сразу', () => {
  it('initAnalytics грузит оба скрипта, события уходят в обе системы', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    vi.stubEnv('VITE_YM_COUNTER_ID', '12345678');
    window.ym = vi.fn();

    initAnalytics();
    trackEvent('screen_view', { screen: 'stats' });

    const sources = analyticsScripts().map((tag) => tag.getAttribute('src'));
    expect(sources).toContain('https://mc.yandex.ru/metrika/tag.js');
    expect(window.dataLayer.at(-1)).toEqual(['event', 'screen_view', { screen: 'stats' }]);
    expect(window.ym).toHaveBeenCalledWith(12345678, 'reachGoal', 'screen_view', {
      screen: 'stats',
    });
  });
});
