import { query, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';

export async function createInquiry({ listingId, seekerId, message, guestPhone, guestName }) {
  return withTransaction(async (client) => {
    const listing = await client.query('SELECT id, agent_id, status FROM listings WHERE id = $1', [listingId]);
    if (!listing.rows[0]) throw new AppError('Listing not found', 404, 'NOT_FOUND');
    if (!['verified', 'pending'].includes(listing.rows[0].status)) {
      throw new AppError('This listing is not available for inquiry.', 403, 'LISTING_NOT_AVAILABLE');
    }

    const { rows } = await client.query(
      `INSERT INTO inquiries (listing_id, seeker_id, message, guest_phone, guest_name, contacted_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [listingId, seekerId || null, message || null, guestPhone || null, guestName || null]
    );
    const inquiry = rows[0];

    const conv = await client.query(
      `INSERT INTO conversations (inquiry_id, listing_id, seeker_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [inquiry.id, listingId, seekerId || null]
    );

    await client.query(
      `INSERT INTO messages (conversation_id, sender_role, body)
       VALUES ($1, 'system', $2)`,
      [
        conv.rows[0].id,
        listing.rows[0].status === 'verified'
          ? 'Thank you for your inquiry. Our coordinator will connect you with the verified agent via WhatsApp shortly.'
          : 'Thank you for your inquiry. This listing is pending verification — our coordinator will confirm availability and connect you with the agent via WhatsApp.',
      ]
    );

    return { inquiry: inquiry, conversationId: conv.rows[0].id };
  });
}

export async function getConversation(conversationId, userId) {
  const { rows } = await query(
    `SELECT c.* FROM conversations c WHERE c.id = $1`,
    [conversationId]
  );
  if (!rows[0]) throw new AppError('Conversation not found', 404, 'NOT_FOUND');

  const conv = rows[0];
  if (userId && conv.seeker_id && conv.seeker_id !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  const messages = await query(
    `SELECT m.*, u.name AS sender_name FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 ORDER BY m.created_at ASC`,
    [conversationId]
  );

  return { conversation: conv, messages: messages.rows };
}

export async function sendMessage(conversationId, senderId, senderRole, body) {
  const { rows } = await query(
    `INSERT INTO messages (conversation_id, sender_id, sender_role, body)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [conversationId, senderId || null, senderRole, body]
  );
  await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
  return rows[0];
}

export async function getOrCreateConversationForListing(listingId, seekerId) {
  const existing = await query(
    `SELECT c.id FROM conversations c
     JOIN inquiries i ON i.id = c.inquiry_id
     WHERE c.listing_id = $1 AND ($2::uuid IS NULL OR c.seeker_id = $2)
     ORDER BY c.created_at DESC LIMIT 1`,
    [listingId, seekerId || null]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const result = await createInquiry({ listingId, seekerId });
  return result.conversationId;
}
