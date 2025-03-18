/**
 * YAML-defined Test Executor
 * Executes tests defined in YAML against API endpoints
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { expect } from 'chai';
import * as jsonpath from 'jsonpath';
import { AppContext } from '../core/types';
import { Logger } from '@/logging';

/**
 * Test definition
 */
export interface TestDefinition {
	/** Test name */
	name: string;
	/** Test description */
	description?: string;
	/** Test cases */
	tests: TestCase[];
	/** Test file path (automatically set by executor) */
	file?: string;
}

/**
 * Test case
 */
export interface TestCase {
	/** Test case name */
	name: string;
	/** Test case description */
	description?: string;
	/** Setup steps to run before test */
	setup?: TestStep[];
	/** Test steps */
	steps: TestStep[];
	/** Teardown steps to run after test */
	teardown?: TestStep[];
	/** Whether to skip this test */
	skip?: boolean;
	/** Environment variables for this test */
	env?: Record<string, string>;
}

/**
 * Test step
 */
export interface TestStep {
	/** Step name */
	name: string;
	/** Step type */
	type: 'request' | 'assert' | 'script' | 'wait' | 'log';
	/** HTTP request details (for type: 'request') */
	request?: {
		/** HTTP method */
		method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
		/** Request URL */
		url: string;
		/** Request headers */
		headers?: Record<string, string>;
		/** Request body */
		body?: any;
		/** Request query parameters */
		params?: Record<string, string>;
		/** Request timeout */
		timeout?: number;
		/** Whether to store the response */
		store?: {
			/** Variable name to store response under */
			as: string;
			/** What to store: full response, body, headers, or status */
			what?: 'response' | 'body' | 'headers' | 'status';
		};
	};
	/** Assertions (for type: 'assert') */
	assert?: {
		/** JSONPath expression to evaluate */
		path?: string;
		/** Variable to assert against (preceded by $ to reference variables) */
		against?: string;
		/** Expected value */
		equals?: any;
		/** Expected range (for numbers) */
		range?: [number, number];
		/** Expected pattern (regex) */
		pattern?: string;
		/** Expected content type */
		contentType?: string;
		/** Expected status code */
		status?: number;
		/** Assertion type */
		type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
		/** Custom assertion script */
		script?: string;
	}[];
	/** JavaScript code to execute (for type: 'script') */
	script?: string;
	/** Duration to wait in ms (for type: 'wait') */
	wait?: number;
	/** Message to log (for type: 'log') */
	log?: string;
}

/**
 * Test execution context
 */
export interface TestContext {
	/** Application context */
	appContext: AppContext;
	/** Base URL for API requests */
	baseUrl: string;
	/** Variables for storing values between steps */
	variables: Record<string, any>;
	/** Last response from a request */
	lastResponse?: AxiosResponse;
	/** Current test case */
	currentTest?: TestCase;
	/** Logger instance */
	logger: Logger;
	/** Authentication token */
	authToken?: string;
	/** Environment variables */
	env: Record<string, string>;
	/** Whether to output verbose logs */
	verbose: boolean;
}

/**
 * Test execution result
 */
export interface TestResult {
	/** Test name */
	name: string;
	/** Test file */
	file: string;
	/** Whether the test passed */
	passed: boolean;
	/** Error message if test failed */
	error?: string;
	/** Test case results */
	cases: TestCaseResult[];
	/** Duration in milliseconds */
	duration: number;
	/** Number of steps executed */
	steps: number;
}

/**
 * Test case result
 */
export interface TestCaseResult {
	/** Test case name */
	name: string;
	/** Whether the test case passed */
	passed: boolean;
	/** Error message if test case failed */
	error?: string;
	/** Step results */
	steps: TestStepResult[];
	/** Duration in milliseconds */
	duration: number;
}

/**
 * Test step result
 */
export interface TestStepResult {
	/** Step name */
	name: string;
	/** Whether the step passed */
	passed: boolean;
	/** Error message if step failed */
	error?: string;
	/** Duration in milliseconds */
	duration: number;
	/** Step log messages */
	logs?: string[];
}

/**
 * Test executor
 * Executes tests defined in YAML
 */
export class TestExecutor {
	/** Application context */
	private appContext: AppContext;
	/** Base URL for API requests */
	private baseUrl: string;
	/** Logger instance */
	private logger: Logger;
	/** Whether to output verbose logs */
	private verbose: boolean;
	/** Global environment variables */
	private env: Record<string, string> = {};

	/**
	 * Constructor
	 * @param appContext Application context
	 * @param baseUrl Base URL for API requests
	 * @param logger Logger instance
	 * @param verbose Whether to output verbose logs
	 */
	constructor(
		appContext: AppContext,
		baseUrl: string,
		logger: Logger,
		verbose: boolean = false
	) {
		this.appContext = appContext;
		this.baseUrl = baseUrl;
		this.logger = logger;
		this.verbose = verbose;

		// Load environment variables
		this.loadEnvironmentVariables();
	}

	/**
	 * Load environment variables from .env file
	 */
	private loadEnvironmentVariables(): void {
		try {
			// Load environment variables from process.env
			this.env = { ...process.env as Record<string, string> };
		} catch (error: any) {
			this.logger.warn(`Failed to load environment variables: ${error}`);
		}
	}

	/**
	 * Execute a test file
	 * @param testFile Test file path
	 * @returns Test result
	 */
	async executeTestFile(testFile: string): Promise<TestResult> {
		try {
			const definition = this.loadTestFile(testFile);
			return await this.executeTest(definition);
		} catch (error: any) {
			this.logger.error(`Failed to execute test file ${testFile}: ${error}`);
			return {
				name: path.basename(testFile),
				file: testFile,
				passed: false,
				error: `Failed to execute test file: ${error}`,
				cases: [],
				duration: 0,
				steps: 0
			};
		}
	}

	/**
	 * Execute all test files in a directory
	 * @param testDir Test directory path
	 * @returns Test results
	 */
	async executeTestDirectory(testDir: string): Promise<TestResult[]> {
		try {
			const files = fs.readdirSync(testDir)
				.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
				.map(file => path.join(testDir, file));

			const results: TestResult[] = [];
			for (const file of files) {
				const result = await this.executeTestFile(file);
				results.push(result);
			}

			return results;
		} catch (error: any) {
			this.logger.error(`Failed to execute tests in directory ${testDir}: ${error}`);
			return [];
		}
	}

	/**
	 * Load a test file
	 * @param testFile Test file path
	 * @returns Test definition
	 */
	private loadTestFile(testFile: string): TestDefinition {
		try {
			const content = fs.readFileSync(testFile, 'utf8');
			const definition = yaml.load(content) as TestDefinition;
			definition.file = testFile;
			return definition;
		} catch (error: any) {
			throw new Error(`Failed to load test file ${testFile}: ${error}`);
		}
	}

	/**
	 * Execute a test
	 * @param definition Test definition
	 * @returns Test result
	 */
	async executeTest(definition: TestDefinition): Promise<TestResult> {
		this.logger.info(`Executing test: ${definition.name}`);
		const startTime = Date.now();

		const result: TestResult = {
			name: definition.name,
			file: definition.file || 'unknown',
			passed: true,
			cases: [],
			duration: 0,
			steps: 0
		};

		// Create test context
		const context: TestContext = {
			appContext: this.appContext,
			baseUrl: this.baseUrl,
			variables: {},
			logger: this.logger,
			env: { ...this.env },
			verbose: this.verbose
		};

		try {
			// Execute each test case
			for (const testCase of definition.tests) {
				if (testCase.skip) {
					this.logger.info(`Skipping test case: ${testCase.name}`);
					continue;
				}

				const caseResult = await this.executeTestCase(testCase, context);
				result.cases.push(caseResult);
				result.steps += caseResult.steps.length;

				if (!caseResult.passed) {
					result.passed = false;
				}
			}
		} catch (error: any) {
			result.passed = false;
			result.error = `Test execution failed: ${error}`;
		}

		result.duration = Date.now() - startTime;
		this.logger.info(
			`Test ${definition.name} ${result.passed ? 'passed' : 'failed'} in ${result.duration}ms`
		);

		return result;
	}

	/**
	 * Execute a test case
	 * @param testCase Test case
	 * @param context Test context
	 * @returns Test case result
	 */
	private async executeTestCase(
		testCase: TestCase,
		context: TestContext
	): Promise<TestCaseResult> {
		this.logger.info(`Executing test case: ${testCase.name}`);
		const startTime = Date.now();

		const result: TestCaseResult = {
			name: testCase.name,
			passed: true,
			steps: [],
			duration: 0
		};

		// Set current test case in context
		context.currentTest = testCase;

		// Apply test case environment variables
		if (testCase.env) {
			context.env = { ...context.env, ...testCase.env };
		}

		try {
			// Execute setup steps
			if (testCase.setup && testCase.setup.length > 0) {
				for (const step of testCase.setup) {
					const stepResult = await this.executeStep(step, context);
					result.steps.push(stepResult);

					if (!stepResult.passed) {
						result.passed = false;
						result.error = `Setup step failed: ${stepResult.error}`;
						break;
					}
				}
			}

			// If setup succeeded, execute test steps
			if (result.passed) {
				for (const step of testCase.steps) {
					const stepResult = await this.executeStep(step, context);
					result.steps.push(stepResult);

					if (!stepResult.passed) {
						result.passed = false;
						result.error = `Test step failed: ${stepResult.error}`;
						break;
					}
				}
			}

			// Execute teardown steps (even if test failed)
			if (testCase.teardown && testCase.teardown.length > 0) {
				for (const step of testCase.teardown) {
					try {
						const stepResult = await this.executeStep(step, context);
						result.steps.push(stepResult);
					} catch (error: any) {
						this.logger.warn(`Teardown step failed: ${error}`);
					}
				}
			}
		} catch (error: any) {
			result.passed = false;
			result.error = `Test case execution failed: ${error}`;
		}

		result.duration = Date.now() - startTime;
		this.logger.info(
			`Test case ${testCase.name} ${result.passed ? 'passed' : 'failed'} in ${result.duration}ms`
		);

		return result;
	}

	/**
	 * Execute a test step
	 * @param step Test step
	 * @param context Test context
	 * @returns Test step result
	 */
	private async executeStep(
		step: TestStep,
		context: TestContext
	): Promise<TestStepResult> {
		if (context.verbose) {
			this.logger.debug(`Executing step: ${step.name}`);
		}

		const startTime = Date.now();

		const result: TestStepResult = {
			name: step.name,
			passed: true,
			duration: 0,
			logs: []
		};

		try {
			switch (step.type) {
				case 'request':
					await this.executeRequestStep(step, context, result);
					break;
				case 'assert':
					await this.executeAssertStep(step, context, result);
					break;
				case 'script':
					await this.executeScriptStep(step, context, result);
					break;
				case 'wait':
					await this.executeWaitStep(step, context, result);
					break;
				case 'log':
					await this.executeLogStep(step, context, result);
					break;
				default:
					throw new Error(`Unknown step type: ${(step as any).type}`);
			}
		} catch (error: any) {
			result.passed = false;
			result.error = `Step execution failed: ${error}`;
		}

		result.duration = Date.now() - startTime;
		return result;
	}

	/**
	 * Execute a request step
	 * @param step Request step
	 * @param context Test context
	 * @param result Step result
	 */
	private async executeRequestStep(
		step: TestStep,
		context: TestContext,
		result: TestStepResult
	): Promise<void> {
		if (!step.request) {
			throw new Error('Request step missing request details');
		}

		// Build request configuration
		const config: AxiosRequestConfig = {
			method: step.request.method,
			url: this.resolveValue(step.request.url, context),
			headers: {},
			timeout: step.request.timeout || 30000
		};

		// Add authorization header if auth token is available
		if (context.authToken) {
			config.headers = {
				...config.headers,
				'Authorization': `Bearer ${context.authToken}`
			};
		}

		// Add custom headers (resolve variables)
		if (step.request.headers) {
			config.headers = config.headers || {};
			for (const [key, value] of Object.entries(step.request.headers)) {
				config.headers[key] = this.resolveValue(value, context);
			}
		}

		// Add request body (resolve variables)
		if (step.request.body) {
			config.data = this.resolveValue(step.request.body, context);
		}

		// Add query parameters (resolve variables)
		if (step.request.params) {
			config.params = {};
			for (const [key, value] of Object.entries(step.request.params)) {
				config.params[key] = this.resolveValue(value, context);
			}
		}

		// Prepend base URL if URL is relative
		if (config.url && !config.url.startsWith('http://') && !config.url.startsWith('https://')) {
			config.url = `${context.baseUrl}${config.url}`;
		}

		// Log the request
		if (context.verbose) {
			result.logs?.push(`Request: ${config.method} ${config.url}`);
			result.logs?.push(`Headers: ${JSON.stringify(config.headers)}`);
			if (config.data) {
				result.logs?.push(`Body: ${JSON.stringify(config.data)}`);
			}
		}

		try {
			// Send the request
			const response = await axios(config);
			context.lastResponse = response;

			// Log the response
			if (context.verbose) {
				result.logs?.push(`Response: ${response.status} ${response.statusText}`);
				result.logs?.push(`Headers: ${JSON.stringify(response.headers)}`);
				result.logs?.push(`Body: ${JSON.stringify(response.data)}`);
			}

			// Store the response if requested
			if (step.request.store) {
				const what = step.request.store.what || 'body';
				let value: any;

				switch (what) {
					case 'response':
						value = response;
						break;
					case 'body':
						value = response.data;
						break;
					case 'headers':
						value = response.headers;
						break;
					case 'status':
						value = response.status;
						break;
					default:
						throw new Error(`Invalid store.what value: ${what}`);
				}

				context.variables[step.request.store.as] = value;
				if (context.verbose) {
					result.logs?.push(`Stored ${what} as ${step.request.store.as}: ${JSON.stringify(value)}`);
				}
			}
		} catch (error: any) {
			// Log the error
			if (context.verbose) {
				result.logs?.push(`Request error: ${error}`);
				if ((error as any).response) {
					const response = (error as any).response;
					result.logs?.push(`Response: ${response.status} ${response.statusText}`);
					result.logs?.push(`Headers: ${JSON.stringify(response.headers)}`);
					result.logs?.push(`Body: ${JSON.stringify(response.data)}`);
				}
			}

			throw error;
		}
	}

	/**
	 * Execute an assert step
	 * @param step Assert step
	 * @param context Test context
	 * @param result Step result
	 */
	private async executeAssertStep(
		step: TestStep,
		context: TestContext,
		result: TestStepResult
	): Promise<void> {
		if (!step.assert || step.assert.length === 0) {
			throw new Error('Assert step missing assertions');
		}

		// Get the last response
		const response = context.lastResponse;
		if (!response) {
			throw new Error('No response to assert against');
		}

		// Execute each assertion
		for (const assertion of step.assert) {
			try {
				// Determine the value to assert against
				let value: any = response.data;

				// Apply JSONPath if provided
				if (assertion.path) {
					const path = this.resolveValue(assertion.path, context);
					try {
						const matches = jsonpath.query(value, path);
						value = matches.length === 1 ? matches[0] : matches;
					} catch (error: any) {
						throw new Error(`Invalid JSONPath expression: ${path}`);
					}
				}

				// Check variable reference if provided
				if (assertion.against && assertion.against.startsWith('$')) {
					const varName = assertion.against.slice(1);
					if (!(varName in context.variables)) {
						throw new Error(`Variable not found: ${varName}`);
					}
					const expected = context.variables[varName];
					expect(value).to.deep.equal(expected);
				}

				// Check equals assertion
				if (assertion.equals !== undefined) {
					const expected = this.resolveValue(assertion.equals, context);
					expect(value).to.deep.equal(expected);
				}

				// Check range assertion (for numbers)
				if (assertion.range) {
					const [min, max] = assertion.range;
					expect(value).to.be.a('number');
					expect(value).to.be.at.least(min);
					expect(value).to.be.at.most(max);
				}

				// Check pattern assertion (regex)
				if (assertion.pattern) {
					const pattern = new RegExp(assertion.pattern);
					expect(value.toString()).to.match(pattern);
				}

				// Check type assertion
				if (assertion.type) {
					expect(value).to.be.a(assertion.type);
				}

				// Check status code assertion
				if (assertion.status) {
					expect(response.status).to.equal(assertion.status);
				}

				// Check content type assertion
				if (assertion.contentType) {
					const contentType = response.headers['content-type'] || '';
					expect(contentType).to.include(assertion.contentType);
				}

				// Execute custom assertion script
				if (assertion.script) {
					const scriptFn = new Function('value', 'expect', 'context', assertion.script);
					await scriptFn(value, expect, context);
				}
			} catch (error: any) {
				throw new Error(`Assertion failed: ${error}`);
			}
		}
	}

	/**
	 * Execute a script step
	 * @param step Script step
	 * @param context Test context
	 * @param result Step result
	 */
	private async executeScriptStep(
		step: TestStep,
		context: TestContext,
		result: TestStepResult
	): Promise<void> {
		if (!step.script) {
			throw new Error('Script step missing script');
		}

		// Create a function from the script
		const scriptFn = new Function(
			'context',
			'axios',
			'jsonpath',
			'expect',
			'log',
			step.script
		);

		// Execute the script
		const log = (message: string) => {
			result.logs = result.logs || [];
			result.logs.push(message);
		};

		await scriptFn(context, axios, jsonpath, expect, log);
	}

	/**
	 * Execute a wait step
	 * @param step Wait step
	 * @param context Test context
	 * @param result Step result
	 */
	private async executeWaitStep(
		step: TestStep,
		context: TestContext,
		result: TestStepResult
	): Promise<void> {
		if (!step.wait) {
			throw new Error('Wait step missing wait duration');
		}

		// Resolve the wait duration
		const duration = this.resolveValue(step.wait, context);
		if (typeof duration !== 'number') {
			throw new Error('Wait duration must be a number');
		}

		// Log the wait
		if (context.verbose) {
			result.logs?.push(`Waiting for ${duration}ms`);
		}

		// Wait for the specified duration
		await new Promise(resolve => setTimeout(resolve, duration));
	}

	/**
	 * Execute a log step
	 * @param step Log step
	 * @param context Test context
	 * @param result Step result
	 */
	private async executeLogStep(
		step: TestStep,
		context: TestContext,
		result: TestStepResult
	): Promise<void> {
		if (!step.log) {
			throw new Error('Log step missing log message');
		}

		// Resolve the log message
		const message = this.resolveValue(step.log, context);

		// Add to step logs
		result.logs = result.logs || [];
		result.logs.push(message);

		// Also log to console
		this.logger.info(message);
	}

	/**
	 * Resolve a value containing variable references
	 * @param value Value to resolve
	 * @param context Test context
	 * @returns Resolved value
	 */
	private resolveValue(value: any, context: TestContext): any {
		if (typeof value === 'string') {
			// Replace environment variables first
			let result = value.replace(/\$\{env\.([^}]+)\}/g, (match, name) => {
				return context.env[name] || '';
			});

			// Replace context variables
			result = result.replace(/\$\{([^}]+)\}/g, (match, path) => {
				return this.getValueByPath(context.variables, path) || '';
			});

			return result;
		} else if (Array.isArray(value)) {
			return value.map(item => this.resolveValue(item, context));
		} else if (value !== null && typeof value === 'object') {
			const result: Record<string, any> = {};
			for (const [key, val] of Object.entries(value)) {
				result[key] = this.resolveValue(val, context);
			}
			return result;
		}

		return value;
	}

	/**
	 * Get a value from an object by path
	 * @param obj Object to get value from
	 * @param path Path to value (e.g. 'user.name')
	 * @returns Value at path
	 */
	private getValueByPath(obj: any, path: string): any {
		const parts = path.split('.');
		let value = obj;

		for (const part of parts) {
			if (value === null || value === undefined) {
				return undefined;
			}
			value = value[part];
		}

		return value;
	}

	/**
	 * Generate a test report
	 * @param results Test results
	 * @returns Test report
	 */
	generateReport(results: TestResult[]): string {
		let report = '# Test Report\n\n';

		// Summary
		const totalTests = results.length;
		const passedTests = results.filter(r => r.passed).length;
		const totalCases = results.reduce((sum, r) => sum + r.cases.length, 0);
		const passedCases = results.reduce(
			(sum, r) => sum + r.cases.filter(c => c.passed).length,
			0
		);
		const totalSteps = results.reduce((sum, r) => sum + r.steps, 0);
		const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

		report += `## Summary\n\n`;
		report += `- **Tests**: ${passedTests}/${totalTests} passed\n`;
		report += `- **Cases**: ${passedCases}/${totalCases} passed\n`;
		report += `- **Steps**: ${totalSteps} executed\n`;
		report += `- **Duration**: ${(totalDuration / 1000).toFixed(2)}s\n\n`;

		// Test details
		report += `## Test Details\n\n`;

		for (const result of results) {
			report += `### ${result.name}\n\n`;
			report += `- **File**: ${result.file}\n`;
			report += `- **Status**: ${result.passed ? '✅ Passed' : '❌ Failed'}\n`;
			if (result.error) {
				report += `- **Error**: ${result.error}\n`;
			}
			report += `- **Duration**: ${(result.duration / 1000).toFixed(2)}s\n\n`;

			// Test cases
			report += `#### Test Cases\n\n`;

			for (const caseResult of result.cases) {
				report += `##### ${caseResult.name}\n\n`;
				report += `- **Status**: ${caseResult.passed ? '✅ Passed' : '❌ Failed'}\n`;
				if (caseResult.error) {
					report += `- **Error**: ${caseResult.error}\n`;
				}
				report += `- **Duration**: ${(caseResult.duration / 1000).toFixed(2)}s\n`;
				report += `- **Steps**: ${caseResult.steps.length} executed\n\n`;

				// Failed steps
				const failedSteps = caseResult.steps.filter(s => !s.passed);
				if (failedSteps.length > 0) {
					report += `###### Failed Steps\n\n`;

					for (const step of failedSteps) {
						report += `- **${step.name}**: ${step.error}\n`;
						if (step.logs && step.logs.length > 0) {
							report += `  - Logs:\n`;
							for (const log of step.logs) {
								report += `    - ${log}\n`;
							}
						}
					}

					report += `\n`;
				}
			}
		}

		return report;
	}
}