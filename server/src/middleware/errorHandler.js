import { AppError } from '../utils/errors.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Database connection errors (PostgreSQL / Neon)
  const isDbDown = err.code === 'ECONNREFUSED'
    || err.code === '57P01'
    || err.code === '57P02'
    || err.code === '57P03'
    || err.code === 'P1001'
    || err.code === 'P1017'
    || err.errors?.some?.((e) => e.code === 'ECONNREFUSED' || e.code === 'P1001');

  if (isDbDown) {
    return res.status(503).json({
      success: false,
      error: 'Database is unavailable. Please try again shortly.',
      code: 'DATABASE_UNAVAILABLE',
    });
  }

  // Multer file errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'Image file too large (max 10MB)',
      code: 'FILE_TOO_LARGE',
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      error: 'Too many images uploaded',
      code: 'TOO_MANY_FILES',
    });
  }

  const isOperational = err instanceof AppError || (Boolean(err.statusCode) && err.statusCode < 500);
  const status = isOperational ? (err.statusCode || 400) : 500;
  const isProd = process.env.NODE_ENV === 'production';

  // In production, mask unexpected 500 internal server / SQL errors
  const clientMessage = isOperational
    ? (err.message || 'Request failed')
    : (isProd ? 'Something went wrong. Please try again.' : (err.message || 'Internal server error'));

  const clientCode = isOperational
    ? (err.code || 'BAD_REQUEST')
    : 'INTERNAL_SERVER_ERROR';

  const payload = {
    success: false,
    error: clientMessage,
    code: clientCode,
  };

  if (err.details) payload.details = err.details;
  if (!isProd && status === 500) {
    payload.stack = err.stack;
  }

  console.error(`[${req.method} ${req.path}] ${status} -`, err.stack || err.message);
  res.status(status).json(payload);
}

export function notFound(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'API route not found', code: 'NOT_FOUND' });
  }
  res.status(404).send('Not found');
}

