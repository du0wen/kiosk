import { parseRuntimeConfig, type RuntimeConfig } from "@/lib/runtime-config";
import { createOperationEvent, type OperationEventInput } from "./events";
import { OperationsLogger } from "./logger";
import {
  HttpOperationsSink,
  StdoutOperationsSink,
  type OperationsSink,
} from "./sinks";

let loggerSingleton: OperationsLogger | undefined;

export function createOperationsSink(config: RuntimeConfig): OperationsSink {
  if (config.operations.sink === "http") {
    if (!config.operations.httpEndpoint) {
      throw new TypeError("HTTP operations sink requires a configured endpoint");
    }
    return new HttpOperationsSink({
      endpoint: config.operations.httpEndpoint,
      ...(config.secrets.operationsHttp ? { token: config.secrets.operationsHttp } : {}),
      timeoutMs: config.operations.httpTimeoutMs,
    });
  }
  return new StdoutOperationsSink();
}

export function createOperationsLogger(config: RuntimeConfig): OperationsLogger {
  return new OperationsLogger({
    releaseId: config.releaseId,
    sink: createOperationsSink(config),
    ...(config.operations.sink === "http"
      ? { fallbackSink: new StdoutOperationsSink() }
      : {}),
  });
}

export function getOperationsLogger(): OperationsLogger {
  loggerSingleton ??= createOperationsLogger(parseRuntimeConfig(process.env));
  return loggerSingleton;
}

export async function emitOperationalEvent(input: OperationEventInput): Promise<void> {
  try {
    await getOperationsLogger().emit(input);
  } catch {
    const fallback = createOperationEvent(
      {
        name: "operations.sink_failed",
        errorCode: "operations_sink_unavailable",
      },
      { releaseId: "unconfigured" },
    );
    try {
      await new StdoutOperationsSink().write(fallback);
    } catch {
      // Operational reporting must not replace the product failure being handled.
    }
  }
}
