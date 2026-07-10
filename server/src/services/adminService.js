import { query } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { sanitizeUser } from '../utils/tokens.js';
import { config } from '../config/index.js';
import { getTrustProfilesForAgents } from './trustScoreService.js';

async function enrichAgentsWithTrust(agents) {
  const ids = agents.map((a) => a.id);
  const trustMap = await getTrustProfilesForAgents(ids);
  return agents.map((a) => {
    const trust = trustMap[a.id];
    return trust ? { ...a, ...trust } : a;
  });
}

export async function listPendingAgents() {
  const { rows } = await query(
    `SELECT u.id, u.name, u.phone, u.email, u.created_at AS at, ap.status, ap.is_promoted_admin AS "isAdmin"
     FROM users u
     JOIN agent_profiles ap ON ap.user_id = u.id
     WHERE ap.status = 'pending'
     ORDER BY u.created_at DESC`
  );
  const agents = rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    status: r.status,
    isAdmin: r.isAdmin,
    at: r.at,
  }));
  return enrichAgentsWithTrust(agents);
}

export async function listApprovedAgents() {
  const { rows } = await query(
    `SELECT u.id, u.name, u.phone, u.email, u.created_at AS at, ap.status, ap.is_promoted_admin AS "isAdmin"
     FROM users u
     JOIN agent_profiles ap ON ap.user_id = u.id
     WHERE ap.status = 'approved'
     ORDER BY u.created_at DESC`
  );
  const agents = rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    status: r.status,
    isAdmin: r.isAdmin,
    at: r.at,
  }));
  return enrichAgentsWithTrust(agents);
}

export async function listDeniedAgents() {
  const { rows } = await query(
    `SELECT u.id, u.name, u.phone, u.email, ap.status, u.created_at AS at
     FROM users u JOIN agent_profiles ap ON ap.user_id = u.id
     WHERE ap.status = 'denied'`
  );
  const agents = rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    status: r.status,
    at: r.at,
  }));
  return enrichAgentsWithTrust(agents);
}

export async function getAgentProfileStatus(agentUserId) {
  const { rows } = await query(
    `SELECT status FROM agent_profiles WHERE user_id = $1`,
    [agentUserId]
  );
  return rows[0]?.status || null;
}

export async function setAgentStatus(agentUserId, status, adminId) {
  const { rows } = await query(
    `UPDATE agent_profiles SET
       status = $1::agent_status,
       approved_at = CASE WHEN $1::text = 'approved' THEN NOW() ELSE approved_at END,
       approved_by = CASE WHEN $1::text = 'approved' THEN $2::uuid ELSE approved_by END,
       updated_at = NOW()
     WHERE user_id = $3 RETURNING *`,
    [status, adminId, agentUserId]
  );
  if (!rows[0]) throw new AppError('Agent not found', 404, 'NOT_FOUND');

  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, metadata)
     VALUES ($1, $2, 'agent', $3, $4)`,
    [adminId, `agent_${status}`, agentUserId, JSON.stringify({ status })]
  );

  const user = await query('SELECT name FROM users WHERE id = $1', [agentUserId]);
  return { name: user.rows[0]?.name, status };
}

export async function promoteAgent(agentUserId, adminId) {
  await query(
    `UPDATE agent_profiles SET is_promoted_admin = TRUE, updated_at = NOW() WHERE user_id = $1`,
    [agentUserId]
  );
  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, metadata)
     VALUES ($1, 'agent_promote', 'agent', $2, '{}')`,
    [adminId, agentUserId]
  );
}

export async function listAllUsers() {
  const agents = await query(
    `SELECT u.id, u.name, u.phone, u.created_at, 'Agent' AS role FROM users u WHERE u.role = 'agent'`
  );
  const seekers = await query(
    `SELECT u.id, u.name, u.phone, u.created_at, 'Seeker' AS role FROM users u WHERE u.role = 'seeker'`
  );
  return [...agents.rows, ...seekers.rows];
}

export async function getKpiStats() {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM listings) AS total_listings,
      (SELECT COUNT(*)::int FROM listings WHERE status = 'verified') AS verified,
      (SELECT COUNT(*)::int FROM agent_profiles WHERE status = 'approved') AS agents,
      (SELECT COUNT(*)::int FROM users WHERE role = 'seeker') AS seekers,
      (SELECT COALESCE(SUM(price), 0)::bigint FROM listings WHERE status = 'verified') AS verified_value
  `);
  return rows[0];
}

export async function getActivityLog(limit = 20) {
  const events = [];

  const listings = await query(
    `SELECT l.title, l.status, l.updated_at, l.created_at FROM listings l ORDER BY l.updated_at DESC LIMIT 50`
  );
  for (const l of listings.rows) {
    events.push({
      type: l.status === 'verified' ? 'em' : l.status === 'rejected' ? 'r' : 'g',
      text: `Listing "${l.title}" ${l.status}`,
      time: l.updated_at || l.created_at,
    });
  }

  const agents = await query(
    `SELECT u.name, u.phone, ap.status, u.created_at FROM users u
     JOIN agent_profiles ap ON ap.user_id = u.id ORDER BY u.created_at DESC LIMIT 30`
  );
  for (const a of agents.rows) {
    events.push({
      type: a.status === 'approved' ? 'em' : a.status === 'denied' ? 'r' : 't',
      text: `Agent ${a.name} (${a.phone}) — ${a.status}`,
      time: a.created_at,
    });
  }

  const seekers = await query(
    `SELECT phone, created_at FROM users WHERE role = 'seeker' ORDER BY created_at DESC LIMIT 20`
  );
  for (const s of seekers.rows) {
    events.push({
      type: 't',
      text: `New seeker registered: ${s.phone || 'via email'}`,
      time: s.created_at,
    });
  }

  events.sort((a, b) => new Date(b.time) - new Date(a.time));
  return events.slice(0, limit);
}

export async function getFeeStats() {
  const perConnection = config.platform.fees.totalPerConnection;
  const { rows } = await query(
    `SELECT COUNT(*)::int AS connections,
            COALESCE(SUM(CASE WHEN fee_eligible THEN $1 ELSE 0 END), 0)::int AS total_estimated
     FROM reviews`,
    [perConnection]
  );
  const pending = await query(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'seeker'`);
  return {
    connections: rows[0].connections,
    totalEstimated: rows[0].total_estimated,
    pending: Math.max(0, pending.rows[0].c - rows[0].connections),
    fees: config.platform.fees,
  };
}

export async function listReviews() {
  const { rows } = await query(
    `SELECT r.*, l.title AS listing_title FROM reviews r
     LEFT JOIN listings l ON l.id = r.listing_id
     ORDER BY r.created_at DESC LIMIT 50`
  );
  return rows.map((r) => ({
    rating: r.rating,
    comment: r.comment,
    at: r.created_at,
    listing: r.listing_title,
  }));
}
