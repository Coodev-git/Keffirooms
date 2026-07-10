import { query } from '../db/pool.js';

export function computeTrustScore(metrics = {}) {
  const status = metrics.agentStatus || 'pending';

  if (status === 'denied') {
    return { trustScore: 0, trustLabel: 'Access denied', trustTier: 'denied' };
  }
  if (status === 'pending') {
    return { trustScore: 40, trustLabel: 'Awaiting approval', trustTier: 'pending' };
  }

  let score = 55;
  const verified = metrics.verifiedCount || 0;
  const rejected = metrics.rejectedCount || 0;
  const reviewCount = metrics.reviewCount || 0;
  const avgRating = Number(metrics.avgRating) || 0;
  const gpsListings = metrics.gpsListings || 0;
  const inquiries = metrics.inquiryCount || 0;

  score += Math.min(verified * 4, 20);
  score -= rejected * 12;
  if (reviewCount > 0) {
    score += (avgRating - 3) * 8;
    score += Math.min(reviewCount, 5);
  }
  score += Math.min(gpsListings * 2, 8);
  score += Math.min(inquiries, 10);

  const trustScore = Math.round(Math.max(0, Math.min(100, score)));

  let trustLabel;
  let trustTier;
  if (trustScore >= 85) {
    trustLabel = 'Excellent record';
    trustTier = 'excellent';
  } else if (trustScore >= 70) {
    trustLabel = 'Good standing';
    trustTier = 'good';
  } else if (trustScore >= 50) {
    trustLabel = 'Building trust';
    trustTier = 'building';
  } else {
    trustLabel = 'Needs improvement';
    trustTier = 'low';
  }

  return { trustScore, trustLabel, trustTier };
}

const TRUST_METRICS_SQL = `
  SELECT
    u.id AS agent_id,
    ap.status AS agent_status,
    COALESCE(ls.verified_count, 0)::int AS verified_count,
    COALESCE(ls.rejected_count, 0)::int AS rejected_count,
    COALESCE(ls.unavailable_count, 0)::int AS unavailable_count,
    COALESCE(ls.pending_count, 0)::int AS pending_count,
    COALESCE(rv.review_count, 0)::int AS review_count,
    COALESCE(rv.avg_rating, 0)::float AS avg_rating,
    COALESCE(iq.inquiry_count, 0)::int AS inquiry_count,
    COALESCE(gp.gps_listings, 0)::int AS gps_listings
  FROM users u
  JOIN agent_profiles ap ON ap.user_id = u.id
  LEFT JOIN (
    SELECT agent_id,
      COUNT(*) FILTER (WHERE status = 'verified') AS verified_count,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
      COUNT(*) FILTER (WHERE status = 'unavailable') AS unavailable_count,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending_count
    FROM listings
    GROUP BY agent_id
  ) ls ON ls.agent_id = u.id
  LEFT JOIN (
    SELECT l.agent_id, COUNT(r.id) AS review_count, AVG(r.rating) AS avg_rating
    FROM reviews r
    JOIN listings l ON l.id = r.listing_id
    GROUP BY l.agent_id
  ) rv ON rv.agent_id = u.id
  LEFT JOIN (
    SELECT l.agent_id, COUNT(i.id) AS inquiry_count
    FROM inquiries i
    JOIN listings l ON l.id = i.listing_id
    GROUP BY l.agent_id
  ) iq ON iq.agent_id = u.id
  LEFT JOIN (
    SELECT l.agent_id, COUNT(DISTINCT l.id) AS gps_listings
    FROM listings l
    JOIN listing_photos p ON p.listing_id = l.id
    WHERE p.gps_lat IS NOT NULL AND p.gps_lng IS NOT NULL
    GROUP BY l.agent_id
  ) gp ON gp.agent_id = u.id
`;

function metricsFromRow(row) {
  if (!row) return null;
  const base = {
    agentStatus: row.agent_status,
    verifiedCount: row.verified_count,
    rejectedCount: row.rejected_count,
    unavailableCount: row.unavailable_count,
    pendingCount: row.pending_count,
    reviewCount: row.review_count,
    avgRating: row.avg_rating,
    inquiryCount: row.inquiry_count,
    gpsListings: row.gps_listings,
  };
  const { trustScore, trustLabel, trustTier } = computeTrustScore(base);
  return { ...base, trustScore, trustLabel, trustTier };
}

export async function getAgentTrustProfile(agentId) {
  const { rows } = await query(`${TRUST_METRICS_SQL} WHERE u.id = $1`, [agentId]);
  return metricsFromRow(rows[0]);
}

export async function getTrustProfilesForAgents(agentIds) {
  if (!agentIds?.length) return {};
  const { rows } = await query(`${TRUST_METRICS_SQL} WHERE u.id = ANY($1::uuid[])`, [agentIds]);
  const map = {};
  for (const row of rows) {
    map[row.agent_id] = metricsFromRow(row);
  }
  return map;
}
