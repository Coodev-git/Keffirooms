import { Router } from 'express';
import { config } from '../config/index.js';
import { asyncHandler } from '../middleware/auth.js';
import { listActiveHotelsForSitemap } from '../services/hotelService.js';

const router = Router();

/** Canonical public site origin for sitemap / robots (prefer www). */
export function getPublicSiteOrigin() {
  if (process.env.SITEMAP_BASE_URL) {
    return String(process.env.SITEMAP_BASE_URL).trim().replace(/\/$/, '');
  }
  const raw = String(config.clientUrl || config.appUrl || 'https://www.keffirooms.ng').trim();
  try {
    const url = new URL(raw);
    if (url.hostname === 'keffirooms.ng' || url.hostname === 'www.keffirooms.ng') {
      return 'https://www.keffirooms.ng';
    }
    return `${url.protocol}//${url.host}`.replace(/\/$/, '');
  } catch {
    return config.isProd ? 'https://www.keffirooms.ng' : 'http://localhost:3000';
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toLastmod(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Public marketing / browse pages only — not dashboards or auth callbacks. */
const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/seeker.html', changefreq: 'daily', priority: '0.9' },
  { path: '/seeker.html?mode=stay', changefreq: 'daily', priority: '0.9' },
  { path: '/auth-seeker.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/auth-agent.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/auth-hotel.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/terms.html', changefreq: 'monthly', priority: '0.4' },
];

function urlEntry(loc, { lastmod, changefreq, priority } = {}) {
  const parts = [`  <url>`, `    <loc>${escapeXml(loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  parts.push('  </url>');
  return parts.join('\n');
}

router.get('/robots.txt', (req, res) => {
  const origin = getPublicSiteOrigin();
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    'Disallow: /api/',
    'Disallow: /admin.html',
    'Disallow: /auth-admin.html',
    'Disallow: /agent.html',
    'Disallow: /hotel-owner.html',
    'Disallow: /chat.html',
    'Disallow: /auth-callback.html',
    'Disallow: /reset-password.html',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');

  res
    .status(200)
    .type('text/plain; charset=utf-8')
    .set('Cache-Control', 'public, max-age=3600')
    .send(body);
});

router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  try {
    const origin = getPublicSiteOrigin();
    const today = new Date().toISOString().slice(0, 10);
    const entries = STATIC_PAGES.map((page) => urlEntry(`${origin}${page.path}`, {
      lastmod: today,
      changefreq: page.changefreq,
      priority: page.priority,
    }));

    try {
      const hotels = await listActiveHotelsForSitemap();
      for (const hotel of hotels) {
        entries.push(urlEntry(`${origin}/hotel.html?id=${hotel.id}`, {
          lastmod: toLastmod(hotel.updatedAt) || toLastmod(hotel.createdAt) || today,
          changefreq: 'weekly',
          priority: '0.8',
        }));
      }
    } catch (err) {
      console.error('sitemap: failed to load hotels', err.message);
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries,
      '</urlset>',
      '',
    ].join('\n');

    res
      .status(200)
      .set('Content-Type', 'application/xml; charset=utf-8')
      .set('Cache-Control', 'public, max-age=3600')
      .send(xml);
  } catch (err) {
    console.error('sitemap: unexpected failure', err.message);
    const fallback = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urlEntry('https://www.keffirooms.ng/', { priority: '1.0' }),
      '</urlset>',
      '',
    ].join('\n');
    res
      .status(200)
      .set('Content-Type', 'application/xml; charset=utf-8')
      .send(fallback);
  }
}));

export default router;
