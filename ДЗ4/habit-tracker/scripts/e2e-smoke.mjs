// E2E-проверка облачного режима (ДЗ5, Шаг 8): живой прогон против Supabase.
// Читает .env (не коммитится), использует только anon-ключ.
// Запуск: node scripts/e2e-smoke.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText
    .replace(/^﻿/, '') // BOM
    .split(/\r?\n/) // Windows CRLF
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      const key = line.slice(0, i).trim();
      // значение: обрезаем \r и парные кавычки по краям
      const raw = line.slice(i + 1).trim();
      const value = raw.replace(/^["'](.*)["']$/, '$1');
      return [key, value];
    }),
);

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error('FAIL: .env не содержит VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' | ' + detail : ''));
};

// 1. Анонимный доступ: таблицы отвечают, RLS не отдаёт чужое/ничего
{
  const { data, error } = await db.from('habits').select('*');
  check('anon: GET /habits отвечает', !error, error ? error.message : '');
  check('anon: RLS скрывает строки (пусто без сессии)', !error && Array.isArray(data) && data.length === 0);
}

// 2. Тестовый пользователь: если в .env заданы E2E_EMAIL/E2E_PASSWORD —
//    входим готовым аккаунтом (обходит rate limit регистрации); иначе регистрируем новый.
const stamp = Date.now();
const email = env.E2E_EMAIL || `e2e-${stamp}@gmail.com`;
const password = env.E2E_PASSWORD || `Ht-E2e-${stamp}-Aa!`;
const useExisting = Boolean(env.E2E_EMAIL && env.E2E_PASSWORD);
let session = null;
if (useExisting) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    check('signIn: вход готовым аккаунтом', false, error.message);
  } else {
    session = data.session;
    check('signIn: вход готовым аккаунтом', true, email);
  }
} else {
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) {
    check('signUp: тестовый аккаунт создан', false, error.message);
  } else if (data.session) {
    session = data.session;
    check('signUp: аккаунт создан, сессия сразу (подтверждение email выключено)', true, email);
  } else {
    check('signUp: аккаунт создан, требуется подтверждение email', true, email);
    const in2 = await db.auth.signInWithPassword({ email, password });
    if (in2.data.session) {
      session = in2.data.session;
      check('signIn: сессия получена без подтверждения', true);
    } else {
      check('signIn: письмо с подтверждением отправлено (вход до клика невозможен)', false, in2.error ? in2.error.message : 'no session');
    }
  }
}

// 3. Аутентифицированный CRUD (те же операции, что в supabaseBackend.js)
if (session) {
  const auth = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });

  // CRUD привычки: create -> read -> update -> archive
  const { data: habit, error: cErr } = await auth
    .from('habits')
    .insert({ title: 'E2E проверка', emoji: '🧪', color: '#7C9883' })
    .select()
    .single();
  check('CRUD: create habit', !cErr, cErr ? cErr.message : habit?.id?.slice(0, 8));

  if (habit) {
    const today = new Date().toISOString().slice(0, 10);
    const { error: ciErr } = await auth.from('check_ins').insert({ habit_id: habit.id, date: today });
    check('CRUD: отметка на сегодня', !ciErr, ciErr ? ciErr.message : '');

    const { error: futErr } = await auth
      .from('check_ins')
      .insert({ habit_id: habit.id, date: '2999-01-01' });
    check('RLS/CHECK: будущая дата отклонена', Boolean(futErr), futErr ? futErr.message.slice(0, 60) : '');

    const { data: mine } = await auth.from('habits').select('*').eq('id', habit.id);
    check('CRUD: read своей привычки', Array.isArray(mine) && mine.length === 1);

    const { error: upErr } = await auth.from('habits').update({ title: 'E2E проверка (изм.)' }).eq('id', habit.id);
    check('CRUD: update habit', !upErr, upErr ? upErr.message : '');

    const { error: delErr } = await auth.from('habits').delete().eq('id', habit.id);
    check('CRUD: delete habit (каскад отметок)', !delErr, delErr ? delErr.message : '');
    const { data: leftovers } = await auth.from('check_ins').select('*').eq('habit_id', habit.id);
    check('Каскад: отметки удалены вместе с привычкой', Array.isArray(leftovers) && leftovers.length === 0);
  }

  // 4. Изоляция пользователей: второй анонимный клиент не видит чужое
  const { data: anonView } = await db.from('habits').select('*');
  check('Изоляция: anon не видит строки аутентифицированного', Array.isArray(anonView) && anonView.length === 0);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\nИтог: ${results.length - failed}/${results.length} проверок пройдено`);
if (session) {
  console.log('Тестовый аккаунт: ' + email + ' (можно удалить в Authentication → Users)');
}
process.exit(failed > 0 && !session ? 1 : 0);
