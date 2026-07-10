import { query } from '../db/pool.js';

export async function createReview({ listingId, seekerId, inquiryId, rating, comment }) {
  const { rows } = await query(
    `INSERT INTO reviews (listing_id, seeker_id, inquiry_id, rating, comment, fee_eligible)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *`,
    [listingId || null, seekerId || null, inquiryId || null, rating, comment || null]
  );
  return rows[0];
}

export async function listReviewsForAdmin() {
  const { rows } = await query(
    `SELECT * FROM reviews ORDER BY created_at DESC LIMIT 100`
  );
  return rows;
}

export async function toggleFavorite(userId, listingId) {
  const existing = await query(
    'SELECT 1 FROM favorites WHERE user_id = $1 AND listing_id = $2',
    [userId, listingId]
  );
  if (existing.rows.length) {
    await query('DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2', [userId, listingId]);
    return { loved: false };
  }
  await query('INSERT INTO favorites (user_id, listing_id) VALUES ($1, $2)', [userId, listingId]);
  return { loved: true };
}

export async function listFavorites(userId) {
  const { rows } = await query(
    'SELECT listing_id FROM favorites WHERE user_id = $1',
    [userId]
  );
  return rows.map((r) => r.listing_id);
}
