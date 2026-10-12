import type {
  ApiErrorCode,
  ApiErrorResponse,
  ValidationIssue,
} from '../shared/contracts.ts';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: ValidationIssue[] | undefined;
  readonly headers: Record<string, string> | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details?: ValidationIssue[],
    headers?: Record<string, string>,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.headers = headers;
  }
}

export function json(
  data: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function errorResponse(error: unknown): Response {
  const failure =
    error instanceof ApiError
      ? error
      : new ApiError(
          'INTERNAL_ERROR',
          'An unexpected backend failure occurred.',
          500,
        );
  const body: ApiErrorResponse = {
    ok: false,
    error: {
      code: failure.code,
      message: failure.message,
      ...(failure.details ? { details: failure.details } : {}),
    },
  };
  return json(body, failure.status, failure.headers);
}

export function invalid(message: string, path: string): never {
  throw new ApiError('VALIDATION_ERROR', message, 400, [{ path, message }]);
}
