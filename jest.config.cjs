/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'utils/**/*.ts',
    'lib/**/*.ts',
    '!**/*.test.ts',
  ],
};

module.exports = config;
