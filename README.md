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

   The backend reads `backend/.env` (`MONGODB_URI`, `PORT`, and `FRONTEND_ORIGIN`); the frontend reads `frontend/.env` (`VITE_API_URL`). The defaults are `mongodb://127.0.0.1:27017/insighttrack`, port `5000`, `http://localhost:5173`, and `http://localhost:5000/api`.

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
It automatically tracks the initial page, SPA history navigation, browser back/forward, and clicks on links and buttons. It never records form values or element text, skips form controls, honors Do Not Track, and redacts common sensitive query parameter names.

## Backend API overview

- `POST /api/events` — store page view or click events
- `GET /api/sessions` — grouped session summaries
- `GET /api/sessions/:sessionId/events` — session timeline
- `GET /api/pages` — page-level analytics
- `GET /api/heatmap` — click heatmap points and normalized percentages
- `GET /api/analytics/overview` — KPI summary
- `GET /api/health` — service health and database status

Events are stored in MongoDB's `events` collection. Overview CTR is calculated consistently as `clicks / pageViews * 100` (zero when there are no page views); heatmap coordinates are document-relative click positions normalized to percentages.
The dashboard routes are excluded from SDK event collection, and dashboard API reads use uncached GET requests only. API reads and tracking-event writes have separate rate limits so routine analytics refreshes do not consume the event-ingestion allowance.

## Demo storefront

The React app includes a storefront with Home, Product Listing, Product Detail, and Cart pages. It initializes the tracking SDK and logs product clicks, navigation, and session events for testing and demonstration.

## Notes

- URLs are validated and canonicalized without silently merging distinct query strings.
- The SDK uses a cryptographically strong UUID with a graceful fallback for older browsers.
- Events are sent to `POST /api/events` with `fetch` and `keepalive`; development failures are reported to the browser console.
- To verify end to end, open `/store`, use **Explore products**, open a product and click **Add to cart**, navigate to **View cart**, then open **Overview** or **Sessions**. The dashboard should show the persisted session, events, and click heatmap points.
