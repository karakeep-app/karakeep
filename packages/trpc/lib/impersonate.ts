import { eq } from "drizzle-orm";

import { db } from "@karakeep/db";
import { users } from "@karakeep/db/schema";

import { AuthedContext } from "..";

export async function buildImpersonatingAuthedContext(
  userId: string,
): Promise<AuthedContext> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) {
    throw new Error("User not found");
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    db,
    req: {
      ip: null,
    },
  };
}
