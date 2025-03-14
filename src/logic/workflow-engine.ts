/**
 * Workflow Engine
 * State machine for entity workflows defined in YAML
 */

import { Workflow, WorkflowState, WorkflowTransition, HookContext, Logger } from '../core/types';
import { EntityConfig, EntityDao } from '../entity';
import { HookError } from './hook-context';

/**
 * Workflow transition result
 */
export interface WorkflowTransitionResult {
	/** Success flag */
	success: boolean;
	/** Entity data after transition */
	entity?: any;
	/** Error message (if failed) */
	error?: string;
	/** From state */
	fromState?: string;
	/** To state */
	toState?: string;
}

/**
 * Workflow state change event
 */
export interface WorkflowStateChangeEvent {
	/** Entity ID */
	entityId: number | string;
	/** Entity data */
	entity: any;
	/** Workflow name */
	workflow: string;
	/** From state */
	fromState: string;
	/** To state */
	toState: string;
	/** Action name */
	action: string;
	/** User who performed the action */
	user?: any;
	/** Timestamp */
	timestamp: number;
}

/**
 * State change hook function type
 */
export type StateChangeHook = (
	event: WorkflowStateChangeEvent,
	context: HookContext
) => Promise<any>;

/**
 * Workflow engine class
 * Manages entity state transitions based on workflow definitions
 */
export class WorkflowEngine {
	private readonly logger: Logger;
	private readonly configLoader: any;

	/** Map of entity workflows */
	private readonly workflows: Map<string, Map<string, Workflow>> = new Map();

	/** Map of state change hooks */
	private readonly stateChangeHooks: Map<string, Map<string, Map<string, StateChangeHook>>> = new Map();

	/**
	 * Constructor
	 * @param logger Logger instance
	 * @param configLoader Configuration loader for loading external code
	 */
	constructor(logger: Logger, configLoader: any) {
		this.logger = logger;
		this.configLoader = configLoader;
	}

	/**
	 * Register entity workflows
	 * @param entity Entity configuration
	 */
	async registerWorkflows(entity: EntityConfig): Promise<void> {
		if (!entity.workflows || entity.workflows.length === 0) {
			return;
		}

		if (!this.workflows.has(entity.entity)) {
			this.workflows.set(entity.entity, new Map());
		}

		const entityWorkflows = this.workflows.get(entity.entity)!;

		// Register each workflow
		for (const workflow of entity.workflows) {
			entityWorkflows.set(workflow.name, workflow);

			// Register state change hooks
			await this.registerStateChangeHooks(entity.entity, workflow);

			this.logger.debug(`Registered workflow '${workflow.name}' for entity ${entity.entity}`);
		}
	}

	/**
	 * Register state change hooks for a workflow
	 * @param entityName Entity name
	 * @param workflow Workflow definition
	 */
	private async registerStateChangeHooks(entityName: string, workflow: Workflow): Promise<void> {
		if (!workflow.transitions) {
			return;
		}

		// Initialize hook maps if needed
		if (!this.stateChangeHooks.has(entityName)) {
			this.stateChangeHooks.set(entityName, new Map());
		}

		const entityHooks = this.stateChangeHooks.get(entityName)!;

		if (!entityHooks.has(workflow.name)) {
			entityHooks.set(workflow.name, new Map());
		}

		const workflowHooks = entityHooks.get(workflow.name)!;

		// Register hooks for each transition
		for (const transition of workflow.transitions) {
			const key = `${transition.from}:${transition.to}`;

			// Skip if no hooks defined
			if (!transition.hooks) {
				continue;
			}

			try {
				// Load before hook if defined
				if (transition.hooks.before) {
					const beforeHook = await this.loadStateChangeHook(transition.hooks.before);
					workflowHooks.set(`before:${key}`, beforeHook);
				}

				// Load after hook if defined
				if (transition.hooks.after) {
					const afterHook = await this.loadStateChangeHook(transition.hooks.after);
					workflowHooks.set(`after:${key}`, afterHook);
				}
			} catch (error) {
				this.logger.error(
					`Failed to load state change hooks for transition ${transition.from} -> ${transition.to}:`,
					error
				);
			}
		}
	}

	/**
	 * Load a state change hook implementation
	 * @param hookPath Hook path or implementation
	 * @returns State change hook function
	 */
	private async loadStateChangeHook(hookPath: string): Promise<StateChangeHook> {
		// If implementation is a file path, load it
		if (hookPath.startsWith('./')) {
			const moduleExports = await this.configLoader.loadExternalCode(hookPath);
			return moduleExports.default || moduleExports;
		}

		// Otherwise, it's an inline implementation
		// Convert the string to a function
		return new Function('event', 'context', `
      return (async (event, context) => {
        ${hookPath}
      })(event, context);
    `) as StateChangeHook;
	}

	/**
	 * Get a workflow for an entity
	 * @param entityName Entity name
	 * @param workflowName Workflow name
	 * @returns Workflow definition or undefined if not found
	 */
	getWorkflow(entityName: string, workflowName: string): Workflow | undefined {
		if (!this.workflows.has(entityName)) {
			return undefined;
		}

		return this.workflows.get(entityName)!.get(workflowName);
	}

	/**
	 * Get all workflows for an entity
	 * @param entityName Entity name
	 * @returns Map of workflow definitions
	 */
	getEntityWorkflows(entityName: string): Map<string, Workflow> | undefined {
		return this.workflows.get(entityName);
	}

	/**
	 * Get all available transitions for a state
	 * @param entityName Entity name
	 * @param workflowName Workflow name
	 * @param state Current state
	 * @returns Array of available transitions
	 */
	getAvailableTransitions(
		entityName: string,
		workflowName: string,
		state: string
	): WorkflowTransition[] {
		const workflow = this.getWorkflow(entityName, workflowName);

		if (!workflow) {
			return [];
		}

		return workflow.transitions.filter(transition => transition.from === state);
	}

	/**
	 * Get initial state for a workflow
	 * @param entityName Entity name
	 * @param workflowName Workflow name
	 * @returns Initial state or undefined if not found
	 */
	getInitialState(entityName: string, workflowName: string): string | undefined {
		const workflow = this.getWorkflow(entityName, workflowName);

		if (!workflow) {
			return undefined;
		}

		const initialState = workflow.states.find(state => state.initial);

		if (initialState) {
			return initialState.name;
		}

		// Default to first state if no initial state defined
		return workflow.states[0]?.name;
	}

	/**
	 * Initialize a workflow for an entity
	 * @param entityName Entity name
	 * @param workflowName Workflow name
	 * @param entity Entity data
	 * @param stateField State field name
	 * @returns Updated entity with initial state
	 */
	initializeWorkflow(
		entityName: string,
		workflowName: string,
		entity: any,
		stateField: string = 'state'
	): any {
		const initialState = this.getInitialState(entityName, workflowName);

		if (!initialState) {
			throw new Error(`No initial state defined for workflow ${workflowName}`);
		}

		return {
			...entity,
			[stateField]: initialState
		};
	}

	/**
	 * Transition an entity to a new state
	 * @param entityName Entity name
	 * @param workflowName Workflow name
	 * @param entityId Entity ID
	 * @param action Action name
	 * @param context Hook context
	 * @param stateField State field name
	 * @returns Transition result
	 */
	async transition(
		entityName: string,
		workflowName: string,
		entityId: number | string,
		action: string,
		context: HookContext,
		stateField: string = 'state'
	): Promise<WorkflowTransitionResult> {
		try {
			// Get entity data
			const entityDao = context.entityDao as EntityDao<any>;
			const entity = await entityDao.findById(entityId);

			if (!entity) {
				return {
					success: false,
					error: `Entity ${entityName} with ID ${entityId} not found`
				};
			}

			// Get current state
			const currentState = entity[stateField];

			if (!currentState) {
				return {
					success: false,
					error: `Entity does not have a state in field '${stateField}'`
				};
			}

			// Get workflow
			const workflow = this.getWorkflow(entityName, workflowName);

			if (!workflow) {
				return {
					success: false,
					error: `Workflow '${workflowName}' not found for entity ${entityName}`
				};
			}

			// Find transition
			const transition = workflow.transitions.find(
				t => t.from === currentState && t.action === action
			);

			if (!transition) {
				return {
					success: false,
					error: `No transition found from state '${currentState}' with action '${action}'`
				};
			}

			// Check permissions
			if (transition.permissions && transition.permissions.length > 0) {
				const user = context.user;

				if (!user) {
					return {
						success: false,
						error: 'Authentication required for this transition'
					};
				}

				const userRole = user.role;

				if (!transition.permissions.includes(userRole)) {
					return {
						success: false,
						error: `User does not have permission to perform this transition`
					};
				}
			}

			// Create state change event
			const event: WorkflowStateChangeEvent = {
				entityId,
				entity,
				workflow: workflowName,
				fromState: currentState,
				toState: transition.to,
				action,
				user: context.user,
				timestamp: Date.now()
			};

			// Execute before hook if defined
			await this.executeStateChangeHook(
				entityName,
				workflowName,
				'before',
				currentState,
				transition.to,
				event,
				context
			);

			// Update entity state
			const updatedEntity = {
				...entity,
				[stateField]: transition.to
			};

			await entityDao.update(entityId, { [stateField]: transition.to });

			// Execute after hook if defined
			await this.executeStateChangeHook(
				entityName,
				workflowName,
				'after',
				currentState,
				transition.to,
				{
					...event,
					entity: updatedEntity
				},
				context
			);

			// Log transition
			this.logger.info(
				`Transitioned ${entityName} ${entityId} from '${currentState}' to '${transition.to}' via action '${action}'`
			);

			return {
				success: true,
				entity: updatedEntity,
				fromState: currentState,
				toState: transition.to
			};
		} catch (error) {
			this.logger.error(
				`Error transitioning ${entityName} ${entityId} in workflow ${workflowName}:`,
				error
			);

			return {
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Execute a state change hook
	 * @param entityName Entity name
	 * @param workflowName Workflow name
	 * @param hookType Hook type (before or after)
	 * @param fromState From state
	 * @param toState To state
	 * @param event State change event
	 * @param context Hook context
	 */
	private async executeStateChangeHook(
		entityName: string,
		workflowName: string,
		hookType: 'before' | 'after',
		fromState: string,
		toState: string,
		event: WorkflowStateChangeEvent,
		context: HookContext
	): Promise<void> {
		// Check if hook is defined
		if (
			!this.stateChangeHooks.has(entityName) ||
			!this.stateChangeHooks.get(entityName)!.has(workflowName)
		) {
			return;
		}

		const workflowHooks = this.stateChangeHooks.get(entityName)!.get(workflowName)!;
		const key = `${hookType}:${fromState}:${toState}`;

		const hook = workflowHooks.get(key);

		if (!hook) {
			return;
		}

		try {
			await hook(event, context);
		} catch (error) {
			this.logger.error(
				`Error executing ${hookType} hook for ${entityName} transition ${fromState} -> ${toState}:`,
				error
			);

			throw new HookError(
				`Error in workflow ${hookType} hook: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Validate workflow defintion
	 * @param workflow Workflow definition
	 * @returns Validation result
	 */
	validateWorkflow(workflow: Workflow): { valid: boolean; errors?: string[] } {
		const errors: string[] = [];

		// Check states
		if (!workflow.states || workflow.states.length === 0) {
			errors.push('Workflow must have at least one state');
		}

		// Check transitions
		if (!workflow.transitions || workflow.transitions.length === 0) {
			errors.push('Workflow must have at least one transition');
		}

		// Check initial state
		const initialStates = workflow.states?.filter(state => state.initial);

		if (initialStates && initialStates.length > 1) {
			errors.push('Workflow cannot have multiple initial states');
		}

		if (workflow.states && workflow.states.length > 0 && initialStates?.length === 0) {
			errors.push('Workflow must have an initial state');
		}

		// Check transition references
		const stateNames = new Set(workflow.states?.map(state => state.name));

		for (const transition of workflow.transitions || []) {
			if (!stateNames.has(transition.from)) {
				errors.push(`Transition references non-existent 'from' state: ${transition.from}`);
			}

			if (!stateNames.has(transition.to)) {
				errors.push(`Transition references non-existent 'to' state: ${transition.to}`);
			}
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined
		};
	}

	/**
	 * Get the state machine graph for a workflow
	 * Useful for visualization
	 * 
	 * @param entityName Entity name
	 * @param workflowName Workflow name
	 * @returns Graph representation of the workflow
	 */
	getWorkflowGraph(entityName: string, workflowName: string): any {
		const workflow = this.getWorkflow(entityName, workflowName);

		if (!workflow) {
			return null;
		}

		const nodes = workflow.states.map(state => ({
			id: state.name,
			label: state.name,
			initial: state.initial || false
		}));

		const edges = workflow.transitions.map(transition => ({
			source: transition.from,
			target: transition.to,
			label: transition.action,
			permissions: transition.permissions || []
		}));

		return {
			nodes,
			edges
		};
	}

	/**
	 * Get all possible paths through a workflow
	 * @param entityName Entity name
	 * @param workflowName Workflow name
	 * @returns Array of possible paths
	 */
	getAllPaths(entityName: string, workflowName: string): string[][] {
		const workflow = this.getWorkflow(entityName, workflowName);

		if (!workflow) {
			return [];
		}

		const initialState = this.getInitialState(entityName, workflowName);

		if (!initialState) {
			return [];
		}

		const paths: string[][] = [];
		const visited = new Set<string>();

		// Depth-first search to find all paths
		const dfs = (current: string, path: string[]) => {
			// Avoid cycles
			if (visited.has(current)) {
				return;
			}

			visited.add(current);
			path.push(current);

			// Get transitions from current state
			const transitions = workflow.transitions.filter(t => t.from === current);

			if (transitions.length === 0) {
				// Terminal state, add path
				paths.push([...path]);
			} else {
				// Continue traversal
				for (const transition of transitions) {
					dfs(transition.to, [...path]);
				}
			}

			visited.delete(current);
		};

		dfs(initialState, []);

		return paths;
	}
}

/**
 * Create a workflow transition action
 * Helper function to create an action that transitions a workflow
 * 
 * @param entityName Entity name
 * @param workflowName Workflow name
 * @param action Action name
 * @param stateField State field name
 * @returns Action implementation function
 */
export function createWorkflowTransitionAction(
	entityName: string,
	workflowName: string,
	action: string,
	stateField: string = 'state'
): (req: any, context: HookContext) => Promise<any> {
	return async (req: any, context: HookContext) => {
		// Get ID from request params
		const entityId = req.params.id;

		if (!entityId) {
			throw new HookError('Entity ID is required', 400);
		}

		// Get workflow engine from context
		const workflowEngine = context.services.workflowEngine as WorkflowEngine;

		if (!workflowEngine) {
			throw new HookError('Workflow engine not available', 500);
		}

		// Execute transition
		const result = await workflowEngine.transition(
			entityName,
			workflowName,
			entityId,
			action,
			context,
			stateField
		);

		if (!result.success) {
			throw new HookError(result.error || 'Transition failed', 400);
		}

		return result;
	};
}