import type { Config } from '@jest/types';

// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  testTimeout: 30000,
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  coverageReporters: ['text', 'cobertura', 'html']
};

export default config;