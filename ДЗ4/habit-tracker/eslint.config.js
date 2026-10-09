// ESLint 9 flat config — единая конфигурация линтинга проекта «Трекер привычек».
// Запуск: npm run lint (eslint . из корня проекта).
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  // Служебные каталоги сборки не линтим (node_modules ESLint игнорирует сам).
  {
    ignores: ['dist/', 'coverage/'],
  },

  // Базовые рекомендации ESLint для современных ES-модулей.
  js.configs.recommended,

  // Правила React: рекомендуемый набор плагина (flat-вариант).
  react.configs.flat.recommended,

  // Правила хуков: rules-of-hooks, exhaustive-deps и сопутствующие (flat-вариант).
  reactHooks.configs.flat.recommended,

  // Настройки проекта: браузерный код, но тесты и скрипты используют Node API.
  // files обязателен: без него ESLint по умолчанию линтит только *.js/*.mjs и
  // молча пропускает компоненты *.jsx.
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Длина строки ≤ 100 символов (правило проекта); URL и строки в кавычках
      // не считаются — русские тексты UI и длинные литералы бывают громоздкими.
      'max-len': [
        'error',
        {
          code: 100,
          ignoreUrls: true,
          ignoreStrings: true,
        },
      ],

      // console.error/warn допустимы в коде обработки ошибок; обычный log — warn.
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // React 19 + автоматический JSX-transform: импорт React не требуется.
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',

      // Пропсы описываются JSDoc-контрактами (правило 3 CLAUDE.md), пакет
      // prop-types в проекте не используется и не добавляется (правило 8).
      'react/prop-types': 'off',
    },
  },

  // CLI-скрипты (scripts/) печатают отчёт в stdout через console.log —
  // для них запрет console не имеет смысла.
  {
    files: ['scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },

  // Логгер — единственное место приложения, имеющее право писать в консоль
  // на любом уровне (error/warn разрешены глобально, log/info — только здесь).
  {
    files: ['src/utils/logger.js'],
    rules: {
      'no-console': 'off',
    },
  },
];
