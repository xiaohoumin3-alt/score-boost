module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        wx: 'readonly',
        App: 'readonly',
        getApp: 'readonly',
        Page: 'readonly',
        Component: 'readonly',
        Behavior: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Promise: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
      },
      ecmaVersion: 2022,
      sourceType: 'script',
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
];
