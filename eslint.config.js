const security = require('eslint-plugin-security');
const jsdoc = require('eslint-plugin-jsdoc');
const globals = require('globals');

module.exports = [
  {
    files: ['src/**/*.js'],
    plugins: {
      security,
      jsdoc,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Security rules
      ...security.configs.recommended.rules,
      
      // JSDoc rules
      'jsdoc/require-jsdoc': ['error', {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: true,
          FunctionExpression: true,
        }
      }],
      'jsdoc/require-description': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-param': 'error',

      // General quality rules
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'eqeqeq': 'error',
      'curly': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'no-undef': 'error',
      'no-caller': 'error',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-new-wrappers': 'error',
      'no-with': 'error',
    },
  },
  {
    files: ['src/**/*.test.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    rules: {
      // Relax some rules for tests
      'security/detect-non-literal-fs-filename': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',
    }
  }
];
