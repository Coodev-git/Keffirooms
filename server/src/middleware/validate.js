import { validationResult } from 'express-validator';
import { AppError } from '../utils/errors.js';

export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array()));
  }
  next();
}
