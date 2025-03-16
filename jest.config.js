export default {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.jest.json", // Use test-specific config
        isolatedModules: true, // Disable type checking for tests
        diagnostics: {
          warnOnly: true, // Convert errors to warnings
          ignoreCodes: [2322, 2345, 2305, 7006, 7031, 7034, 7005, 18048], // Ignore specific errors
        },
      },
    ],
  },
  setupFilesAfterEnv: ["./jest.setup.ts"],
  reporters: [
    "default",
    "jest-summary-reporter",
    [
      "jest-junit",
      {
        outputDirectory: "./trash",
        outputName: "jest-results.xml",
        classNameTemplate: ({ classname, status }) =>
          status === "failed" ? classname : "",
        titleTemplate: ({ title, status }) =>
          status === "failed" ? title : "",
        suiteNameTemplate: ({ suiteName, status }) =>
          status === "failed" ? suiteName : "",
        ancestorSeparator: " > ",
      },
    ],
  ],
  silent: true,
};
