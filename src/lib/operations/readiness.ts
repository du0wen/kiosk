import type { OperationalErrorCode } from "./events";

export type DependencyStatus = "ok" | "degraded" | "unavailable";

export type DependencyProbeResult = {
  status: DependencyStatus;
  latencyMs: number;
  errorCode?: OperationalErrorCode;
};

export type DependencyProbe = () => Promise<DependencyProbeResult>;

export type ReadinessReport = {
  status: DependencyStatus;
  checks: Record<string, DependencyProbeResult>;
  timestamp: string;
};

export type CheckReadinessOptions = {
  timeoutMs?: number;
};

function defaultErrorCodeFor(depName: string, isTimeout = false): OperationalErrorCode {
  if (depName === "render") return isTimeout ? "render_timeout" : "render_unavailable";
  if (depName === "database") return "database_unavailable";
  if (depName === "protection") return "protection_unavailable";
  if (depName === "storage") return "storage_unavailable";
  if (depName === "operations") return "operations_sink_unavailable";
  return "internal";
}

export async function checkDependencyReadiness(
  probes: Record<string, DependencyProbe>,
  options?: CheckReadinessOptions,
): Promise<ReadinessReport> {
  const timeoutMs = options?.timeoutMs ?? 3000;
  const entries = Object.entries(probes);

  const results = await Promise.allSettled(
    entries.map(async ([name, probe]) => {
      const start = Date.now();
      let timer: ReturnType<typeof setTimeout> | undefined;

      const timeoutPromise = new Promise<DependencyProbeResult>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`Probe ${name} timed out`);
          (err as { isTimeout?: boolean }).isTimeout = true;
          reject(err);
        }, timeoutMs);
      });

      try {
        const res = await Promise.race([probe(), timeoutPromise]);
        return [name, res] as const;
      } catch (err: unknown) {
        const isTimeout = Boolean((err as { isTimeout?: boolean })?.isTimeout);
        const latency = Date.now() - start;
        const failedResult: DependencyProbeResult = {
          status: "unavailable",
          latencyMs: latency,
          errorCode: defaultErrorCodeFor(name, isTimeout),
        };
        return [name, failedResult] as const;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }),
  );

  const checks: Record<string, DependencyProbeResult> = {};
  let overallStatus: DependencyStatus = "ok";

  for (const item of results) {
    if (item.status === "fulfilled") {
      const [name, result] = item.value;
      checks[name] = result;
      if (result.status === "unavailable") {
        overallStatus = "unavailable";
      } else if (result.status === "degraded" && overallStatus !== "unavailable") {
        overallStatus = "degraded";
      }
    }
  }

  return {
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString(),
  };
}
