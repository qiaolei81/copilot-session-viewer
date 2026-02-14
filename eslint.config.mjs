import js from '@eslint/js';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';

export default [
  // Base JavaScript config
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      
      // Error prevention
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-constant-condition': 'warn',
      
      // Best practices
      'eqeqeq': ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'prefer-const': 'warn',
      'no-var': 'warn',
      
      // Style (lenient for now)
      'semi': ['warn', 'always'],
      'quotes': ['warn', 'single', { avoidEscape: true }],
      'indent': 'off', // Too strict for mixed codebases
      'comma-dangle': 'off',
      'no-trailing-spaces': 'off',
    },
  },
  
  // Vue 3 config - use the flat config array from the plugin
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    rules: {
      // Override Vue rules
      'vue/multi-word-component-names': 'off', // Allow single-word component names
      'vue/no-v-html': 'off', // We use v-html for markdown rendering
      'vue/require-default-prop': 'warn',
      'vue/require-prop-types': 'warn',
      'vue/no-unused-vars': 'warn',
      'vue/html-indent': 'off', // Too strict
      'vue/max-attributes-per-line': 'off', // Too strict
    },
  },
  
  // Server-side files (Node.js only)
  {
    files: ['server.js', 'src/**/*.js', '__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest, // For test files
      },
    },
  },
  
  // Test files
  {
    files: ['__tests__/**/*.js', '**/*.spec.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-expressions': 'off', // Common in tests
    },
  },
  
  // Ignore patterns
  {
    ignores: [
      'node_modules/',
      'coverage/',
      'dist/',
      '.git/',
      '*.min.js',
      'public/hyperlist.js', // External library
      'check-*.js', // Debug scripts
      'test-*.js', // Debug scripts
      'debug-*.js', // Debug scripts
      'verify-*.js', // Debug scripts
    ],
  },
];
