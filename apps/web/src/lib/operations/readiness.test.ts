import { describe, expect, it } from "vitest";
import { checkDependencyReadiness, type DependencyProbe } from "./readiness";

describe("checkDependencyReadiness", () => {
  it("aggregates status when all probes succeed", async () => {
    const probes: Record<string, DependencyProbe> = {
      database: async () => ({ status: "ok", latencyMs: 5 }),
      protection: async () => ({ status: "ok", latencyMs: 2 }),
      storage: async () => ({ status: "ok", latencyMs: 10 }),
      render: async () => ({ status: "ok", latencyMs: 8 }),
      operations: async () => ({ status: "ok", latencyMs: 1 }),
    };

    const report = await checkDependencyReadiness(probes);

    expect(report.status).toBe("ok");
    expect(report.checks.database.status).toBe("ok");
    expect(report.checks.database.latencyMs).toBe(5);
    expect(report.checks.protection.status).toBe("ok");
    expect(report.checks.render.status).toBe("ok");
  });

  it("marks overall status as unavailable when a critical probe fails", async () => {
    const probes: Record<string, DependencyProbe> = {
      database: async () => {
        throw new Error("Connection refused: postgres://secret_pw@host:5432");
      },
      protection: async () => ({ status: "ok", latencyMs: 2 }),
    };

    const report = await checkDependencyReadiness(probes);

    expect(report.status).toBe("unavailable");
    expect(report.checks.database.status).toBe("unavailable");
    expect(report.checks.database.errorCode).toBe("database_unavailable");
    // Ensure sensitive details like connection strings/passwords are NOT leaked
    expect(JSON.stringify(report)).not.toContain("secret_pw");
    expect(JSON.stringify(report)).not.toContain("postgres://");
  });

  it("times out slow probes without hanging", async () => {
    const probes: Record<string, DependencyProbe> = {
      render: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return { status: "ok", latencyMs: 5000 };
      },
      database: async () => ({ status: "ok", latencyMs: 3 }),
    };

    const report = await checkDependencyReadiness(probes, { timeoutMs: 50 });

    expect(report.status).toBe("unavailable");
    expect(report.checks.render.status).toBe("unavailable");
    expect(report.checks.render.errorCode).toBe("render_timeout");
    expect(report.checks.database.status).toBe("ok");
  });
});
