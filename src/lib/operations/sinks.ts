import type { SecretValue } from "@/lib/runtime-config";
import { parseOperationEnvelope, type OperationEvent } from "./events";

export interface OperationsSink {
  write(event: OperationEvent): Promise<void>;
}

export class OperationsSinkError extends Error {
  constructor() {
    super("Operations sink is unavailable");
    this.name = "OperationsSinkError";
  }
}

type LineWriter = (line: string) => void;

export class StdoutOperationsSink implements OperationsSink {
  constructor(private readonly writer: LineWriter = (line) => process.stdout.write(line)) {}

  async write(event: OperationEvent): Promise<void> {
    this.writer(`${JSON.stringify(parseOperationEnvelope(event))}\n`);
  }
}

export class MemoryOperationsSink implements OperationsSink {
  readonly #events: OperationEvent[] = [];

  get events(): readonly OperationEvent[] {
    return Object.freeze([...this.#events]);
  }

  async write(event: OperationEvent): Promise<void> {
    this.#events.push(Object.freeze(structuredClone(parseOperationEnvelope(event))));
  }
}

type HttpOperationsSinkOptions = {
  endpoint: string;
  token?: SecretValue;
  timeoutMs: number;
  fetcher?: typeof fetch;
};

export class HttpOperationsSink implements OperationsSink {
  readonly #endpoint: string;
  readonly #token?: SecretValue;
  readonly #timeoutMs: number;
  readonly #fetcher: typeof fetch;

  constructor(options: HttpOperationsSinkOptions) {
    this.#endpoint = options.endpoint;
    this.#token = options.token;
    this.#timeoutMs = options.timeoutMs;
    this.#fetcher = options.fetcher ?? fetch;
  }

  async write(event: OperationEvent): Promise<void> {
    try {
      const validatedEvent = parseOperationEnvelope(event);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.#token) headers.authorization = `Bearer ${this.#token.reveal()}`;
      const response = await this.#fetcher(this.#endpoint, {
        method: "POST",
        redirect: "error",
        headers,
        body: JSON.stringify(validatedEvent),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) throw new OperationsSinkError();
    } catch {
      throw new OperationsSinkError();
    }
  }
}
