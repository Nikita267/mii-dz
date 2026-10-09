// Глобальный setup Vitest: тесты по умолчанию выполняются в Mock-режиме.
// Локальный .env с реальными ключами Supabase не должен влиять на прогоны —
// фасад src/data/api.js выбирает облако по наличию VITE_SUPABASE_URL/ANON_KEY.
// Тесты, которым нужен облачный режим (supabaseBackend, analytics),
// переопределяют эти значения собственными vi.stubEnv.
import { vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
vi.stubEnv('VITE_YM_COUNTER_ID', '');
