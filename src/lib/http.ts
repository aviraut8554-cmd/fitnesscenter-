import { ZodError } from 'zod';

/**
 * Application error with an HTTP status and a stable machine-readable code.
 * Thrown anywhere in a route handler and converted to a JSON response by
 * `handleRoute`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new ApiError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = 'Not permitted') {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, 'not_found', message);
  }
  static conflict(message = 'Conflict', details?: unknown) {
    return new ApiError(409, 'conflict', message, details);
  }
  static unprocessable(message = 'Unprocessable', details?: unknown) {
    return new ApiError(422, 'unprocessable', message, details);
  }
}

export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status });
}

export function jsonError(error: ApiError): Response {
  return Response.json(
    { error: { code: error.code, message: error.message, details: error.details } },
    { status: error.status },
  );
}

/**
 * Wraps a route handler: normalizes thrown errors (ApiError, ZodError, and
 * unexpected errors) into consistent JSON responses. Keeps handlers focused on
 * the happy path.
 */
export function handleRoute(
  handler: (request: Request, context: RouteHandlerContext) => Promise<Response>,
) {
  return async (request: Request, context: RouteHandlerContext): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(error);
      }
      if (error instanceof ZodError) {
        return jsonError(
          ApiError.badRequest('Validation failed', error.flatten()),
        );
      }
      console.error('Unhandled route error:', error);
      return jsonError(new ApiError(500, 'internal_error', 'Internal server error'));
    }
  };
}

export interface RouteHandlerContext {
  params?: Promise<Record<string, string | string[]>>;
}

/** Parse and validate a JSON request body against a Zod schema. */
export async function parseJson<T>(
  request: Request,
  schema: { parse: (v: unknown) => T },
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw ApiError.badRequest('Request body must be valid JSON');
  }
  return schema.parse(body);
}
