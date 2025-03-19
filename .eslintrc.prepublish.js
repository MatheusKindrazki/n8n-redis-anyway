const baseConfig = require('./.eslintrc.js');

module.exports = {
  ...baseConfig,
  rules: {
    ...baseConfig.rules,
    // Regras mais rigorosas para a publicação
    'no-console': 'error',
    'no-unused-vars': 'error',
    'prefer-const': 'error',
  },
}; 