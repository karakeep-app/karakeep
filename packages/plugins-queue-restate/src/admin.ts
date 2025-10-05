import { z } from "zod";

export class AdminClient {
  constructor(private addr: string) {}

  async upsertDeployment(deploymentAddr: string) {
    const res = await fetch(`${this.addr}/deployments`, {
      method: "POST",
      body: JSON.stringify({
        uri: deploymentAddr,
        force: true,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to upsert deployment: ${res.status}`);
    }
  }

  async getStats(serviceName: string) {
    const query = `select status, count(*) as count from sys_invocation where target_service_name='${serviceName}' group by status`;
    const res = await fetch(`${this.addr}/query`, {
      method: "POST",
      body: JSON.stringify({
        query,
      }),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to get stats: ${res.status}`);
    }
    const zStatus = z.enum([
      "pending",
      "scheduled",
      "ready",
      "running",
      "paused",
      "backing-off",
      "suspended",
      "completed",
    ]);
    const zSchema = z.object({
      rows: z.array(
        z.object({
          status: zStatus,
          count: z.number(),
        }),
      ),
    });

    return zSchema.parse(await res.json()).rows.reduce(
      (acc, cur) => {
        acc[cur.status] = cur.count;
        return acc;
      },
      {
        pending: 0,
        scheduled: 0,
        ready: 0,
        running: 0,
        paused: 0,
        "backing-off": 0,
        suspended: 0,
        completed: 0,
      } as Record<z.infer<typeof zStatus>, number>,
    );
  }
}
