import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { AppError } from '../utils/errors.js';
import { authenticate, requireAdminAccess, requireMasterAdmin, asyncHandler, isMasterAdmin } from '../middleware/auth.js';
import {
  listPendingAgents,
  listApprovedAgents,
  listDeniedAgents,
  setAgentStatus,
  getAgentProfileStatus,
  promoteAgent,
  listAllUsers,
  getKpiStats,
  getActivityLog,
  getFeeStats,
  listReviews,
} from '../services/adminService.js';
import { updateListingStatus, listListings } from '../services/listingService.js';
import { getTrustProfilesForAgents } from '../services/trustScoreService.js';

const router = Router();

async function withAgentTrust(listings) {
  const agentIds = [...new Set(listings.map((l) => l.agentId).filter(Boolean))];
  const trustMap = await getTrustProfilesForAgents(agentIds);
  return listings.map((l) => {
    const trust = trustMap[l.agentId];
    return {
      ...l,
      agentTrustScore: trust?.trustScore ?? null,
      agentTrustLabel: trust?.trustLabel ?? null,
      agentTrustTier: trust?.trustTier ?? null,
    };
  });
}

router.use(authenticate, requireAdminAccess);

router.get(
  '/listings/pending',
  asyncHandler(async (req, res) => {
    const listings = await listListings({ status: 'pending', includeUnavailable: true });
    res.json({ listings: await withAgentTrust(listings) });
  })
);

router.get(
  '/listings',
  asyncHandler(async (req, res) => {
    const listings = await listListings({ includeUnavailable: true });
    res.json({ listings: await withAgentTrust(listings) });
  })
);

router.patch(
  '/listings/:id/status',
  param('id').isUUID(),
  body('status').isIn(['verified', 'rejected', 'unavailable', 'pending']),
  body('notes').optional().trim(),
  validate,
  asyncHandler(async (req, res) => {
    if (['rejected', 'unavailable'].includes(req.body.status) && !isMasterAdmin(req.user)) {
      throw new AppError('Master admin access required', 403, 'FORBIDDEN');
    }
    const listing = await updateListingStatus(
      req.params.id,
      req.body.status,
      req.user.id,
      req.body.notes
    );
    res.json({ listing });
  })
);

router.get(
  '/agents/pending',
  asyncHandler(async (req, res) => {
    res.json({ agents: await listPendingAgents() });
  })
);

router.get(
  '/agents/approved',
  asyncHandler(async (req, res) => {
    res.json({ agents: await listApprovedAgents() });
  })
);

router.get(
  '/agents/denied',
  asyncHandler(async (req, res) => {
    res.json({ agents: await listDeniedAgents() });
  })
);

router.patch(
  '/agents/:id/status',
  param('id').isUUID(),
  body('status').isIn(['approved', 'denied', 'pending']),
  validate,
  asyncHandler(async (req, res) => {
    if (req.body.status === 'denied') {
      const current = await getAgentProfileStatus(req.params.id);
      if (current === 'approved' && !isMasterAdmin(req.user)) {
        throw new AppError('Master admin access required to revoke agents', 403, 'FORBIDDEN');
      }
    }
    const result = await setAgentStatus(req.params.id, req.body.status, req.user.id);
    res.json(result);
  })
);

router.post(
  '/agents/:id/promote',
  requireMasterAdmin,
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    await promoteAgent(req.params.id, req.user.id);
    res.json({ message: 'Agent promoted' });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    res.json({ users: await listAllUsers() });
  })
);

router.get(
  '/kpi',
  asyncHandler(async (req, res) => {
    res.json(await getKpiStats());
  })
);

router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    res.json({ events: await getActivityLog() });
  })
);

router.get(
  '/fees',
  asyncHandler(async (req, res) => {
    const stats = await getFeeStats();
    const reviews = await listReviews();
    res.json({ ...stats, reviews });
  })
);

export default router;
