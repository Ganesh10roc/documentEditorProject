/**
 * Domain error hierarchy. Every error a service can raise carries the HTTP
 * status and machine-readable code it should map to, so the HTTP layer can
 * translate it generically (`instanceof AppError`) without knowing each type.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  readonly status = 401;
  readonly code = "unauthorized";
  constructor(message = "Authentication required") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = "forbidden";
  constructor(message = "You do not have permission to do that") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = "not_found";
  constructor(message = "Not found") {
    super(message);
  }
}

/** Raised when incoming binary is not a well-formed synchronization payload. */
export class SyncPayloadError extends AppError {
  readonly status = 422;
  readonly code = "invalid_payload";
  constructor(message = "Malformed synchronization payload") {
    super(message);
  }
}
