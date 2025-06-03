import type {
  Flow,
  ParameterValues,
  Parameterized,
  SomeParameterType,
} from "./types";

export const FlowSpecSymbol = Symbol("FlowSpec");

/**
 * Method decorator: attaches flow specification metadata to a class method.
 * D – plain domain params record written by the user.
 */
export function flow<D extends Record<string, SomeParameterType>>(spec: Flow<D>) {
  return function (
    originalMethod: (params: ParameterValues<Parameterized<D>>, ...restArgs: any[]) => any,
    context: ClassMethodDecoratorContext,
  ): ((params: ParameterValues<Parameterized<D>>, ...restArgs: any[]) => any) | void {
    if (context.kind !== "method") {
      console.error(`@flow can only be applied to methods; got ${context.kind} on ${String(context.name)}`);
      return;
    }
    if (typeof originalMethod !== "function") {
      console.error(`@flow applied to '${String(context.name)}' which is not a function.`);
      return;
    }

    // attach metadata
    Object.defineProperty(originalMethod, FlowSpecSymbol, {
      value: { spec, originalUserMethod: originalMethod },
      writable: false,
      enumerable: false,
      configurable: false,
    });
    return originalMethod;
  };
}

/**
 * Base class for Agents.
 */
export abstract class AgentBase {
  abstract getName(): Promise<string>;
  abstract getDescription(): Promise<string>;

  public async run(): Promise<void> {
    const name = await this.getName();
    const description = await this.getDescription();

    console.log(`Running agent: ${name}`);
    console.log(`Description: ${description}`);
    console.log("Available flows:");

    const logged = new Set<string>();
    let proto: any = Object.getPrototypeOf(this);

    while (proto && proto !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === "constructor") continue;
        try {
          const value = (this as any)[key];
          if (Object.prototype.hasOwnProperty.call(value, FlowSpecSymbol)) {
            if (!logged.has(key)) {
              console.log(`- ${key}`);
              logged.add(key);
            }
          }
        } catch (e) {
          const protoName = proto.constructor ? proto.constructor.name : "<anon>";
          console.warn(`Could not inspect '${key}' on prototype '${protoName}':`, e);
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
  }
}