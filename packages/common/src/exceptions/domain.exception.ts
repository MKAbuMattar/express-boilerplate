/**
 * Errors the business layer throws. They say what went wrong, not which HTTP
 * status to send: GlobalErrorFilter maps them, so a queue job or a script that
 * calls the same service never handles an HTTP response.
 */
export class DomainException extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> | null = null,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundException extends DomainException {}

export class ConflictException extends DomainException {}

/** Input broke a business rule; `fields` names each failing field. */
export class ValidationException extends DomainException {
  constructor(fields: Record<string, string>) {
    super('Validation failed', fields);
  }
}
