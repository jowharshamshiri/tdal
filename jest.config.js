export default {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testPathIgnorePatterns: ['/node_modules/', '/dist/'],
	extensionsToTreatAsEsm: ['.ts'],
	moduleNameMapper: {
	  '^(\\.{1,2}/.*)\\.js$': '$1',
	},
	transform: {
	  '^.+\\.(ts|tsx)$': ['ts-jest', {
		useESM: true,
	  }],
	},
	setupFilesAfterEnv: ['./jest.setup.ts'],
  };