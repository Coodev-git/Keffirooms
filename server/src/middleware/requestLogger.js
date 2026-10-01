/**
 * Request logging middleware — logs method, path, status, duration, and userId.
 * JSON format in production for structured log ingestion.
 * Avoids logging request bodies (passwords, secrets, PII).
 */

const isProd = process.env.NODE_ENV === 'production';

export function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const userId = req.user?.id || null;

    if (isProd) {
      // Structured JSON for production log ingestion
      const entry = {
        ts: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status,
        duration,
        userId,
        ip: req.ip,
        ua: req.get('user-agent') || null,
      };
      process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      // Human-readable for development
      const userTag = userId ? ` [${userId.slice(0, 8)}…]` : '';
      const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
      const reset = '\x1b[0m';
      console.log(
        `${color}${req.method} ${req.path} ${status}${reset} ${duration}ms${userTag}`
      );
    }
  });

  next();
}
