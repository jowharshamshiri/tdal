module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/tests/**/*.test.ts'],
	moduleNameMapper: {
	  '^@/(.*)$': '<rootDir>/src/$1' 
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  };