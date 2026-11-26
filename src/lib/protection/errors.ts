export class ProtectionStoreError extends Error {
  readonly code = "protection_unavailable";

  constructor() {
    super("Runtime protection is unavailable");
    this.name = "ProtectionStoreError";
  }
}
