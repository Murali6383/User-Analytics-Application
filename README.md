# InsightTrack — Web Session Analytics & Click Heatmap

InsightTrack is a full-stack web analytics product that captures page views and clicks via a lightweight browser SDK, stores events in MongoDB, and surfaces a SaaS analytics dashboard.

## Stack

- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: Node.js + Express + TypeScript
- Database: MongoDB + Mongoose
- Validation: Zod
- Charts: Recharts

## Workspace layout

- `backend/` — Express API with MongoDB-backed analytics endpoints
- `frontend/` — React dashboard and demo storefront
- `sdk/` — Standalone JavaScript tracking SDK for any website

## Quick start

1. Install dependencies:

   npm install

2. Copy example environment files:

   - `backend/.env.example` -> `backend/.env`
   - `frontend/.env.example` -> `frontend/.env`

3. Start MongoDB locally and ensure it is running on the default port.

4. Launch the app:

   npm run dev

   - Frontend: http://localhost:5173
   - Backend: http://localhost:5000

## SDK integration example

```html
<script src="https://cdn.example.com/insighttrack.js"></script>
<script>
  InsightTrack.init({
    apiUrl: 'http://localhost:5000/api',
    websiteId: 'demo-store',
    respectDoNotTrack: true,
    optOut: false,
  });
</script>
```

Or, to use the local SDK file in this repo:

```html
<script src="/sdk/insighttrack.js"></script>
<script>
  InsightTrack.init({
    apiUrl: 'http://localhost:5000/api',
    websiteId: 'demo-store',
    respectDoNotTrack: true,
  });
</script>
```

The SDK uses `sessionStorage` to keep a stable session ID for the active tab and resets it after 30 minutes of inactivity. The same-tab session is not a unique-person identifier and is intended to represent a browsing session rather than an identity.

## Backend API overview

- `POST /api/events` — store page view or click events
- `GET /api/sessions` — grouped session summaries
- `GET /api/sessions/:sessionId/events` — session timeline
- `GET /api/pages` — page-level analytics
- `GET /api/heatmap` — click heatmap points and normalized percentages
- `GET /api/analytics/overview` — KPI summary
- `GET /api/health` — service health and database status

## Demo storefront

The React app includes a storefront with Home, Product Listing, Product Detail, and Cart pages. It initializes the tracking SDK and logs product clicks, navigation, and session events for testing and demonstration.

## Notes

- URLs are validated and canonicalized without silently merging distinct query strings.
- The SDK uses a cryptographically strong UUID with a graceful fallback for older browsers.
- Requests are sent with `sendBeacon` when available and fall back to `fetch` with `keepalive`.
