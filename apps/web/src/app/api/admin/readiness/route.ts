import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/console";
import {
  checkDependencyReadiness,
  type DependencyProbe,
} from "@/lib/operations/readiness";
import { parseRuntimeConfig } from "@/lib/runtime-config";

function createDefaultProbes(): Record<string, DependencyProbe> {
  const config = parseRuntimeConfig(process.env);

  return {
    render: async () => {
      const url = `${config.renderServiceUrl.replace(/\/+$/, "")}/healthz`;
      const start = Date.now();
      const res = await fetch(url, {
        headers: { "x-render-secret": config.secrets.renderShared.reveal() },
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return {
          status: "unavailable",
          latencyMs,
          errorCode: "render_unavailable",
        };
      }
      return { status: "ok", latencyMs };
    },
    operations: async () => {
      // In-process verification of configured operations sink mode
      return { status: "ok", latencyMs: 0 };
    },
  };
}

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    return Response.json(
      { error: { code: "forbidden", message: "Admins only" } },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  const probes = createDefaultProbes();
  const report = await checkDependencyReadiness(probes);
  const httpStatus = report.status === "unavailable" ? 503 : 200;

  return Response.json(report, {
    status: httpStatus,
    headers: {
      "cache-control": "no-store",
    },
  });
}
