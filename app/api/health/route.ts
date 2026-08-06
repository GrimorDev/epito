export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DependencyState = {
  status: "ready" | "disabled" | "error";
  latencyMs?: number;
};

export async function GET() {
  const dependencies: Record<string, DependencyState> = {
    postgres: { status: "disabled" },
    redis: { status: "disabled" },
  };

  if (process.env.EPITO_BACKEND_SERVICES === "required") {
    const [{ checkDatabase }, { checkRedis }] = await Promise.all([
      import("@/lib/server/database"),
      import("@/lib/server/redis"),
    ]);

    const [postgres, redis] = await Promise.allSettled([
      checkDatabase(),
      checkRedis(),
    ]);

    dependencies.postgres =
      postgres.status === "fulfilled"
        ? { status: "ready", latencyMs: postgres.value.latencyMs }
        : { status: "error" };
    dependencies.redis =
      redis.status === "fulfilled"
        ? { status: "ready", latencyMs: redis.value.latencyMs }
        : { status: "error" };
  }

  const ready = Object.values(dependencies).every(
    (dependency) => dependency.status !== "error",
  );

  return Response.json(
    {
      status: ready ? "ok" : "degraded",
      service: "epito",
      dependencies,
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
