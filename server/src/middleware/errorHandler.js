import { AppError } from '../utils/errors.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Database connection errors (Prisma / Neon / PostgreSQL)
  const isDbDown = err.code === 'ECONNREFUSED'
    || err.code === 'P1001'
    || err.code === 'P1017'
    || err.errors?.some?.((e) => e.code === 'ECONNREFUSED' || e.code === 'P1001');
  if (isDbDown) {
    return res.status(503).json({
      error: 'Database is unavailable. Check DATABASE_URL and Neon connection.',
      code: 'DATABASE_UNAVAILABLE',
    });
  }

  // Multer file errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'Image file too large',
      code: 'FILE_TOO_LARGE',
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      error: 'Too many images uploaded',
      code: 'TOO_MANY_FILES',
    });
  }

  const status = err.statusCode || 500;
  const payload = {
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
  };

  if (err.details) payload.details = err.details;

  if (process.env.NODE_ENV !== 'production' && status === 500) {
    payload.stack = err.stack;
  }

  console.error(`[${req.method} ${req.path}]`, err.message);
  res.status(status).json(payload);
}

export function notFound(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found', code: 'NOT_FOUND' });
  }
  res.status(404).send('Not found');
}
