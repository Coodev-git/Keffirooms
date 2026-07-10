import { query, withTransaction } from '../db/pool.js';
import { listingToClient } from '../utils/tokens.js';
import { AppError } from '../utils/errors.js';
import { assertListingContentSafe } from '../utils/listingContent.js';

async function getAgentPhone(agentId) {
  const { rows } = await query('SELECT phone FROM users WHERE id = $1', [agentId]);
  return rows[0]?.phone || null;
}

function nextStatusAfterAgentEdit(currentStatus) {
  if (currentStatus === 'unavailable') return 'unavailable';
  if (currentStatus === 'pending') return 'pending';
  return 'pending';
}

const LISTING_SELECT = `
  SELECT l.*, u.name AS agent_name, u.phone AS agent_phone
  FROM listings l
  JOIN users u ON u.id = l.agent_id
`;

async function getPhotosForListings(listingIds) {
  if (!listingIds.length) return {};
  const { rows } = await query(
    `SELECT * FROM listing_photos WHERE listing_id = ANY($1::uuid[]) ORDER BY sort_order`,
    [listingIds]
  );
  const map = {};
  for (const p of rows) {
    if (!map[p.listing_id]) map[p.listing_id] = [];
    map[p.listing_id].push(p);
  }
  return map;
}

export async function listListings(filters = {}) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (filters.verifiedOnly) {
    conditions.push(`l.status = 'verified'`);
  } else if (filters.publicBrowse) {
    conditions.push(`l.status IN ('verified', 'pending')`);
  } else if (filters.publicOnly) {
    conditions.push(`l.status = 'verified'`);
  } else {
    conditions.push(`l.status NOT IN ('rejected')`);
    if (filters.status) {
      conditions.push(`l.status = $${i++}`);
      params.push(filters.status);
    } else if (!filters.includeUnavailable) {
      conditions.push(`l.status != 'unavailable'`);
    }
  }

  if (filters.area && filters.area !== 'all') {
    conditions.push(`l.area ILIKE $${i++}`);
    params.push(`%${filters.area}%`);
  }

  if (filters.maxPrice) {
    conditions.push(`l.price <= $${i++}`);
    params.push(filters.maxPrice);
  }

  if (filters.q) {
    const serialMatch = String(filters.q).trim().match(/^#?(\d+)$/);
    if (serialMatch) {
      conditions.push(`l.serial_number = $${i++}`);
      params.push(parseInt(serialMatch[1], 10));
    } else {
      conditions.push(`(
      l.title ILIKE $${i} OR l.area ILIKE $${i} OR l.description ILIKE $${i}
      OR l.amenities::text ILIKE $${i}
      OR l.serial_number::text ILIKE $${i}
    )`);
      params.push(`%${filters.q}%`);
      i++;
    }
  }

  if (filters.agentId) {
    conditions.push(`l.agent_id = $${i++}`);
    params.push(filters.agentId);
  }

  const sql = `${LISTING_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY l.created_at DESC`;
  const { rows } = await query(sql, params);
  const photoMap = await getPhotosForListings(rows.map((r) => r.id));
  const hideAgentContact = !!(filters.publicBrowse || filters.publicOnly);
  return rows.map((r) => listingToClient(r, photoMap[r.id] || [], { hideAgentContact }));
}

export async function getListingById(id, { publicOnly = false } = {}) {
  const { rows } = await query(`${LISTING_SELECT} WHERE l.id = $1`, [id]);
  if (!rows[0]) throw new AppError('Listing not found', 404, 'NOT_FOUND');
  if (publicOnly && !['verified', 'pending'].includes(rows[0].status)) {
    throw new AppError('Listing not found', 404, 'NOT_FOUND');
  }
  const photoMap = await getPhotosForListings([id]);
  return listingToClient(rows[0], photoMap[id] || [], { hideAgentContact: publicOnly });
}

export async function getListingBySerial(serialNumber, { publicOnly = false } = {}) {
  const serial = parseInt(serialNumber, 10);
  if (!Number.isFinite(serial) || serial < 1) {
    throw new AppError('Invalid listing number', 400, 'INVALID_SERIAL');
  }
  const { rows } = await query(`${LISTING_SELECT} WHERE l.serial_number = $1`, [serial]);
  if (!rows[0]) throw new AppError('Listing not found', 404, 'NOT_FOUND');
  if (publicOnly && !['verified', 'pending'].includes(rows[0].status)) {
    throw new AppError('Listing not found', 404, 'NOT_FOUND');
  }
  const photoMap = await getPhotosForListings([rows[0].id]);
  return listingToClient(rows[0], photoMap[rows[0].id] || [], { hideAgentContact: publicOnly });
}

export async function createListing(agentId, data, photoRecords) {
  const agentPhone = await getAgentPhone(agentId);
  assertListingContentSafe(data, { agentPhone });

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO listings (agent_id, title, type, price, description, area, landmark, distance, amenities, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
       RETURNING *`,
      [
        agentId,
        data.title,
        data.type,
        data.price,
        data.description || null,
        data.area,
        data.landmark || null,
        data.distance,
        JSON.stringify(data.amenities || []),
      ]
    );
    const listing = rows[0];

    for (let idx = 0; idx < photoRecords.length; idx++) {
      const p = photoRecords[idx];
      await client.query(
        `INSERT INTO listing_photos (listing_id, url, sort_order, gps_lat, gps_lng, gps_acc, device, captured_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          listing.id,
          p.url,
          idx,
          p.gps_lat || null,
          p.gps_lng || null,
          p.gps_acc || null,
          p.device || null,
          p.captured_at || new Date(),
          JSON.stringify(p.metadata || {}),
        ]
      );
    }

    await client.query(
      `INSERT INTO verification_requests (listing_id, action, notes)
       VALUES ($1, 'submitted', 'New listing submitted for verification')`,
      [listing.id]
    );

    const full = await client.query(
      `${LISTING_SELECT} WHERE l.id = $1`,
      [listing.id]
    );
    const photos = await client.query(
      'SELECT * FROM listing_photos WHERE listing_id = $1 ORDER BY sort_order',
      [listing.id]
    );
    return listingToClient(full.rows[0], photos.rows);
  });
}

export async function updateListing(listingId, agentId, data) {
  const { rows } = await query('SELECT * FROM listings WHERE id = $1', [listingId]);
  const listing = rows[0];
  if (!listing) throw new AppError('Listing not found', 404, 'NOT_FOUND');
  if (listing.agent_id !== agentId) {
    throw new AppError('You can only edit your own listings', 403, 'FORBIDDEN');
  }
  if (!['pending', 'verified', 'unavailable', 'rejected'].includes(listing.status)) {
    throw new AppError('This listing cannot be edited', 400, 'INVALID_STATUS');
  }

  const agentPhone = await getAgentPhone(agentId);
  assertListingContentSafe(data, { agentPhone });

  const newStatus = nextStatusAfterAgentEdit(listing.status);
  const wasVerified = listing.status === 'verified';
  const wasRejected = listing.status === 'rejected';

  await query(
    `UPDATE listings SET
       title = $1, type = $2, price = $3, description = $4,
       area = $5, landmark = $6, distance = $7, amenities = $8,
       status = $9, updated_at = NOW()
     WHERE id = $10`,
    [
      data.title,
      data.type,
      data.price,
      data.description || null,
      data.area,
      data.landmark || null,
      data.distance,
      JSON.stringify(data.amenities || []),
      newStatus,
      listingId,
    ]
  );

  let auditNote = 'Agent updated listing details';
  if (wasVerified) auditNote = 'Agent edited verified listing — pending re-verification';
  else if (wasRejected) auditNote = 'Agent updated rejected listing — resubmitted for verification';

  await query(
    `INSERT INTO verification_requests (listing_id, action, notes)
     VALUES ($1, 'submitted', $2)`,
    [listingId, auditNote]
  );

  return getListingById(listingId);
}

export async function updateListingStatus(listingId, status, adminId, notes, meta = {}) {
  const actionMap = {
    verified: 'approved',
    rejected: 'rejected',
    unavailable: 'unavailable',
    pending: 'submitted',
  };

  const { rows } = await query(
    `UPDATE listings SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, listingId]
  );
  if (!rows[0]) throw new AppError('Listing not found', 404, 'NOT_FOUND');

  const auditNote = notes || meta.defaultNote || null;
  await query(
    `INSERT INTO verification_requests (listing_id, admin_id, action, notes)
     VALUES ($1, $2, $3, $4)`,
    [listingId, adminId || null, actionMap[status] || 'flagged', auditNote]
  );

  if (adminId) {
    await query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, metadata)
       VALUES ($1, $2, 'listing', $3, $4)`,
      [adminId, `listing_${status}`, listingId, JSON.stringify({ status, ...meta })]
    );
  }

  return getListingById(listingId);
}

export async function unlistListing(listingId, actorId, actorRole, notes) {
  const { rows } = await query('SELECT id, agent_id, status, title FROM listings WHERE id = $1', [listingId]);
  const listing = rows[0];
  if (!listing) throw new AppError('Listing not found', 404, 'NOT_FOUND');

  if (actorRole === 'agent' && listing.agent_id !== actorId) {
    throw new AppError('You can only unlist your own listings', 403, 'FORBIDDEN');
  }
  if (!['verified', 'pending'].includes(listing.status)) {
    throw new AppError('Only active or pending listings can be unlisted', 400, 'INVALID_STATUS');
  }

  const auditNote = notes
    || (actorRole === 'agent'
      ? 'Unlisted by agent — property no longer available'
      : 'Unlisted by admin — property no longer available');

  return updateListingStatus(
    listingId,
    'unavailable',
    actorRole === 'admin' ? actorId : null,
    auditNote,
    { actorRole, actorId }
  );
}

export async function relistListing(listingId, actorId) {
  const { rows } = await query('SELECT id, agent_id, status FROM listings WHERE id = $1', [listingId]);
  const listing = rows[0];
  if (!listing) throw new AppError('Listing not found', 404, 'NOT_FOUND');
  if (listing.agent_id !== actorId) {
    throw new AppError('You can only relist your own listings', 403, 'FORBIDDEN');
  }
  if (listing.status !== 'unavailable') {
    throw new AppError('Only unlisted properties can be relisted', 400, 'INVALID_STATUS');
  }

  return updateListingStatus(
    listingId,
    'pending',
    null,
    'Relisted by agent — pending admin verification',
    { actorRole: 'agent', actorId }
  );
}

export async function getPublicStats() {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM listings WHERE status = 'verified') AS total,
      (SELECT COUNT(*)::int FROM listings WHERE status = 'verified') AS verified,
      (SELECT COUNT(*)::int FROM agent_profiles WHERE status = 'approved') AS agents,
      (SELECT COUNT(*)::int FROM users WHERE role = 'seeker') AS seekers
  `);
  return rows[0];
}

export async function getFeaturedListing() {
  const items = await listListings({ verifiedOnly: true, publicBrowse: true });
  return items.find((l) => l.photos?.length) || items[0] || null;
}
