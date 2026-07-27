import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.error('[Error]', err.message);

  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    res.status(400).json({
      error: 'Validation error',
      details: messages,
    });
    return;
  }

  // Prisma unique constraint violation
  if ((err as any).code === 'P2002') {
    res.status(409).json({ error: 'A record with this value already exists.' });
    return;
  }

  // Prisma record not found
  if ((err as any).code === 'P2025') {
    res.status(404).json({ error: 'Record not found.' });
    return;
  }

  const status = (err as any).statusCode || 500;
  const code = (err as any).code as string | undefined;

  // Only mask messages for unexpected 5xx server errors.
  // 4xx errors (validation, auth, business logic) always return their real message
  // so the frontend can display exactly what went wrong.
  const message =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected server error occurred. Please try again.'
      : err.message;

  res.status(status).json({ error: message, ...(code ? { code } : {}) });
}

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
