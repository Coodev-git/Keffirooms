# KeffiRooms API Reference

Base URL: `/api`

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Service status |

## Auth `/api/auth`

| Method | Path | Auth | Body | Description |
|--------|------|------|------|-------------|
| POST | `/login` | No | `{ identifier, password }` | Login (email or phone) |
| POST | `/register/seeker` | No | `{ email, password, name, phone? }` | Student signup |
| POST | `/register/agent` | No | `{ email, password, name, phone }` | Agent application |
| POST | `/refresh` | Cookie | — | Refresh access token |
| POST | `/logout` | Optional | — | Revoke refresh token |
| GET | `/me` | Bearer | — | Current user profile |
| POST | `/forgot-password` | No | `{ email }` | Request reset link |
| POST | `/reset-password` | No | `{ token, password }` | Set new password |
| POST | `/admin/request-otp` | No | `{ email }` | Send 6-digit admin login code |
| POST | `/admin/verify-otp` | No | `{ email, code }` | Verify code and issue JWT |
| GET | `/google` | No | `?role=seeker` | Start Google OAuth |
| GET | `/google/callback` | No | — | OAuth callback (redirect) |

## Listings `/api/listings`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/stats` | No | Public counts (total, verified, agents) |
| GET | `/featured` | No | One featured verified listing |
| GET | `/` | No | List with filters: `area`, `maxPrice`, `verifiedOnly`, `q` (#1043 or text), `status` |
| GET | `/mine` | Agent | Agent's own listings |
| GET | `/config/platform` | No | WhatsApp/phone contact config |
| GET | `/by-serial/:serial` | No | Lookup listing by number e.g. `1043` |
| GET | `/:id` | No | Single listing with photos |
| POST | `/` | Agent (approved) | Create listing (multipart: photos + fields) |

### Create Listing (multipart/form-data)

| Field | Required | Notes |
|-------|----------|-------|
| title, type, price, area, distance | Yes | |
| description, landmark | No | |
| amenities | No | JSON string array |
| photoMetadata | No | JSON array of GPS metadata |
| photos | Yes (≥5) | Image files |

## Admin `/api/admin` (admin role required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/listings/pending` | Pending verification queue |
| GET | `/listings` | All listings |
| PATCH | `/listings/:id/status` | `{ status, notes? }` — verified/rejected/unavailable |
| GET | `/agents/pending` | Pending agent applications |
| GET | `/agents/approved` | Approved agents |
| GET | `/agents/denied` | Denied/blacklisted agents |
| PATCH | `/agents/:id/status` | `{ status }` — approved/denied |
| POST | `/agents/:id/promote` | Grant admin privileges |
| GET | `/users` | All seekers + agents |
| GET | `/kpi` | Dashboard KPI stats |
| GET | `/activity` | Activity log events |
| GET | `/fees` | Fee tracker + reviews |

## Social `/api`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/inquiries` | Optional | `{ listingId, message? }` — start inquiry |
| GET | `/conversations/:id` | Bearer | Get conversation + messages |
| POST | `/conversations/:id/messages` | Bearer | `{ body }` — send message |
| POST | `/reviews` | Optional | `{ rating, comment?, listingId? }` |
| GET | `/favorites` | Bearer | List saved listing IDs |
| POST | `/favorites/:listingId` | Bearer | Toggle favorite |

## Error Format

```json
{
  "error": "Human readable message",
  "code": "ERROR_CODE",
  "details": []
}
```

## Status Codes

- `400` Validation error
- `401` Unauthorized
- `403` Forbidden (wrong role / agent not approved)
- `404` Not found
- `409` Duplicate email/phone
- `429` Rate limited
- `500` Server error
