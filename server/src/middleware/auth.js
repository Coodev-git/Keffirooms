import { AppError } from '../utils/errors.js';

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function authenticate(req, res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  }
  next();
}

export function optionalAuth(req, res, next) {
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }
    next();
  };
}

export function requireAgentApproved(req, res, next) {
  if (req.user.role === 'admin') return next();
  if (req.user.role !== 'agent') {
    return next(new AppError('Agent access required', 403, 'FORBIDDEN'));
  }
  if (req.user.agentStatus !== 'approved') {
    return next(new AppError('Agent account not yet approved', 403, 'AGENT_NOT_APPROVED'));
  }
  next();
}

/** Master admin or agent promoted to admin */
export function requireAdminAccess(req, res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  }
  if (req.user.role === 'admin' || req.user.isPromotedAdmin) {
    return next();
  }
  return next(new AppError('Admin access required', 403, 'FORBIDDEN'));
}

/** Master admin only — not promoted agents */
export function requireMasterAdmin(req, res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  }
  if (req.user.role === 'admin') {
    return next();
  }
  return next(new AppError('Master admin access required', 403, 'FORBIDDEN'));
}

export function isMasterAdmin(user) {
  return !!(user && user.role === 'admin');
}
