export abstract class PersistenceNotFoundError extends Error {
  public readonly code = "PERSISTENCE_NOT_FOUND";

  protected constructor(
    message: string,
    public readonly resource: "thread" | "version",
    public readonly resourceId: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class PersistenceThreadNotFoundError extends PersistenceNotFoundError {
  public constructor(threadId: string) {
    super(`Thread '${threadId}' not found.`, "thread", threadId);
  }
}

export class PersistenceVersionNotFoundError extends PersistenceNotFoundError {
  public constructor(versionId: string) {
    super(`Version '${versionId}' not found.`, "version", versionId);
  }
}

export function isPersistenceNotFoundError(error: unknown): error is PersistenceNotFoundError {
  return error instanceof PersistenceNotFoundError;
}
