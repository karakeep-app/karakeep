/**
 * A token that proves storage quota has been checked and approved.
 * This class cannot be instantiated directly - it can only be created
 * by the checkStorageQuota function.
 */
export class QuotaApproved {
  private constructor(
    public readonly userId: string,
    public readonly approvedSize: number,
  ) {}

  /**
   * Internal method to create a QuotaApproved token.
   * This should only be called by checkStorageQuota.
   */
  static _create(userId: string, approvedSize: number): QuotaApproved {
    return new QuotaApproved(userId, approvedSize);
  }
}
