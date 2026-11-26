import { createOperationEvent, type OperationEventInput } from "./events";
import type { OperationsSink } from "./sinks";

type OperationsLoggerOptions = {
  releaseId: string;
  sink: OperationsSink;
  fallbackSink?: OperationsSink;
  now?: () => Date;
};

export class OperationsLogger {
  readonly #releaseId: string;
  readonly #sink: OperationsSink;
  readonly #fallbackSink?: OperationsSink;
  readonly #now?: () => Date;

  constructor(options: OperationsLoggerOptions) {
    this.#releaseId = options.releaseId;
    this.#sink = options.sink;
    this.#fallbackSink = options.fallbackSink;
    this.#now = options.now;
  }

  async emit(input: OperationEventInput): Promise<void> {
    const event = createOperationEvent(input, {
      releaseId: this.#releaseId,
      ...(this.#now ? { now: this.#now } : {}),
    });
    try {
      await this.#sink.write(event);
    } catch {
      if (!this.#fallbackSink) return;
      const fallback = createOperationEvent(
        {
          name: "operations.sink_failed",
          errorCode: "operations_sink_unavailable",
        },
        {
          releaseId: this.#releaseId,
          ...(this.#now ? { now: this.#now } : {}),
        },
      );
      try {
        await this.#fallbackSink.write(fallback);
      } catch {
        // A fallback sink cannot report its own failure without recursion.
      }
    }
  }
}
