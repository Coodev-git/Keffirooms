import { verifyAccessToken } from '../utils/tokens.js';
import { query } from '../db/pool.js';

export async function loadUser(req, res, next) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = verifyAccessToken(token);
    const { rows } = await query(
      `SELECT u.*,
              ap.status AS agent_status,
              ap.is_promoted_admin,
              hop.status AS hotel_owner_status
       FROM users u
       LEFT JOIN agent_profiles ap ON ap.user_id = u.id
       LEFT JOIN hotel_owner_profiles hop ON hop.user_id = u.id
       WHERE u.id = $1 AND u.is_active = TRUE`,
      [decoded.sub]
    );

    if (!rows[0]) {
      req.user = null;
      return next();
    }

    req.user = {
      id: rows[0].id,
      email: rows[0].email,
      phone: rows[0].phone,
      role: rows[0].role,
      name: rows[0].name,
      avatarUrl: rows[0].avatar_url,
      emailVerified: rows[0].email_verified,
      agentStatus: rows[0].agent_status,
      hotelOwnerStatus: rows[0].hotel_owner_status,
      isPromotedAdmin: rows[0].is_promoted_admin,
    };
    next();
  } catch {
    req.user = null;
    next();
  }
}
