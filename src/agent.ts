import type { Flow, Parameter, ParameterValues } from "./types";

export const FlowSpecSymbol = Symbol("FlowSpec");

/**
 * Decorator factory for methods that are part of an agent's flow.
 * It type-checks that the decorated method's first parameter expects an unwrapped version
 * of the parameters defined by the flow specification.
 * The actual unwrapping and calling will be handled by the agent's execution logic.
 *
 * @param spec The flow specification, conforming to Flow<P>.
 */
export function flow<P extends Record<string, Parameter<any>>>(spec: Flow<P>) {
  return function (
    originalMethod: (params: ParameterValues<P>, ...restArgs: any[]) => any,
    context: ClassMethodDecoratorContext
  ): ((params: ParameterValues<P>, ...restArgs: any[]) => any) | void {
    if (context.kind !== "method") {
      console.error(`Flow decorator can only be applied to methods. Context kind: ${context.kind} on ${String(context.name)}`);
      return;
    }
    if (typeof originalMethod !== 'function') {
      console.error(`Flow decorator applied to '${String(context.name)}', which is not a function.`);
      return;
    }
    Object.defineProperty(originalMethod, FlowSpecSymbol, {
      value: { spec: spec, originalUserMethod: originalMethod },
      writable: false,
      enumerable: false,
      configurable: false,
    });
    return originalMethod;
  };
}

/**
 * Base class for agents, providing common structure and a run method.
 * Subclasses MUST implement `getName` and `getDescription` methods, which should return Promises.
 */
export abstract class AgentBase {
  abstract getName(): Promise<string>;
  abstract getDescription(): Promise<string>;

  public async run(): Promise<void> {
    const agentName = await this.getName();
    const agentDescription = await this.getDescription();

    console.log(`Running agent: ${agentName}`);
    console.log(`Description: ${agentDescription}`);
    console.log("Available flows:");

    const loggedFlowNames = new Set<string>();
    let currentPrototype = Object.getPrototypeOf(this);

    // Walk up the prototype chain until Object.prototype or null
    while (currentPrototype && currentPrototype !== Object.prototype) {
      for (const propertyName of Object.getOwnPropertyNames(currentPrototype)) {
        // Exclude constructor and methods from AgentBase itself if we only want flows from subclasses
        // For this iteration, we will log any flow method found on any prototype up to AgentBase.
        if (propertyName === 'constructor') {
          continue;
        }

        try {
          // Access the property value via the instance, which will resolve to the prototype method.
          const propertyValue = (this as any)[propertyName];
          
          if (Object.prototype.hasOwnProperty.call(propertyValue, FlowSpecSymbol)) {
            if (!loggedFlowNames.has(propertyName)) {
              console.log(`- ${propertyName}`);
              loggedFlowNames.add(propertyName);
            }
          }
        } catch (e) {
          // It's good to get a bit more context for the warning if possible.
          const protoConstructorName = currentPrototype.constructor ? currentPrototype.constructor.name : 'UnknownPrototype';
          console.warn(`Could not inspect property '${propertyName}' on prototype '${protoConstructorName}'. Error: ${e}`);
        }
      }
      currentPrototype = Object.getPrototypeOf(currentPrototype);
    }
  }
}
