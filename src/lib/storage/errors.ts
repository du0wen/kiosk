export type StorageErrorCode =
  | "invalid_configuration"
  | "invalid_key"
  | "object_conflict"
  | "object_too_large"
  | "access_denied"
  | "timeout"
  | "unavailable"
  | "credential_error"
  | "profile_not_found"
  | "profile_name_conflict"
  | "profile_enabled"
  | "profile_unhealthy"
  | "profile_is_default"
  | "profile_referenced"
  | "storage_unavailable";

export class StorageError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}
