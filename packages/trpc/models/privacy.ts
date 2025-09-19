import { AuthedContext } from "..";

export interface PrivacyAware {
  ensureCanAccess(ctx: AuthedContext): void;
}
