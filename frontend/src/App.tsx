import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Copy,
  Home,
  LayoutDashboard,
  Monitor,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { API_BASE, apiFetch } from './lib/api';
import { buildHeatmapDensity, getPreviewScale, validHeatmapClicks, type HeatmapClick } from './lib/heatmap';
import { products } from './data/products';

type TrendPoint = { date: string; totalEvents: number; pageViews: number; clicks: number };
type DateRange = 'all' | '7d' | '30d';
type PageMetric = { pageUrl: string; pageViews: number; clicks: number };
type Overview = {
  totalSessions: number;
  totalEvents: number;
  pageViews: number;
  clicks: number;
  uniquePages: number;
  clickThroughRate: number | null;
  trend: TrendPoint[];
};
type SessionSummary = {
  sessionId: string;
  firstSeen: string;
  lastSeen: string;
  totalEvents: number;
  pageViews: number;
  clicks: number;
  uniquePages: number;
};
type TrackedEvent = {
  _id: string;
  eventType: 'page_view' | 'click';
  timestamp: string;
  pageUrl: string;
  clickX?: number;
  clickY?: number;
  elementTag?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function dateRangeQuery(range: DateRange) {
  if (range === 'all') return '';
  const days = range === '7d' ? 7 : 30;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const from = new Date(todayUtc - (days - 1) * 24 * 60 * 60 * 1000);
  const to = new Date(todayUtc + 24 * 60 * 60 * 1000 - 1);
  return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

function rangeQuerySuffix(range: DateRange) {
  const query = dateRangeQuery(range);
  return query ? `?${query}` : '';
}

function DateRangeSelect({ value, onChange }: { value: DateRange; onChange: (value: DateRange) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span>Date range</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as DateRange)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        aria-label="Analytics date range"
      >
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="all">All time</option>
      </select>
    </label>
  );
}

const sidebarItems = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Sessions', to: '/dashboard/sessions', icon: Users },
  { label: 'Store Demo', to: '/store', icon: ShoppingBag },
];

type Tracker = {
  init: (config: { apiUrl: string; websiteId: string; respectDoNotTrack: boolean; development: boolean; ignorePaths: string[] }) => { enabled: boolean };
  isOptedOut: () => boolean;
};

let trackingSdkPromise: Promise<void> | null = null;

function loadTrackingSdk() {
  const tracker = (window as Window & { InsightTrack?: Tracker }).InsightTrack;
  if (tracker) return Promise.resolve();
  if (trackingSdkPromise) return trackingSdkPromise;

  trackingSdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.querySelector<HTMLScriptElement>('script[data-insighttrack-sdk]') || document.createElement('script');
    script.src = '/sdk/insighttrack.js';
    script.async = true;
    script.dataset.insighttrackSdk = 'true';
    script.addEventListener('load', () => {
      if ((window as Window & { InsightTrack?: Tracker }).InsightTrack) resolve();
      else reject(new Error('The tracking SDK loaded but did not expose InsightTrack.'));
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${script.src}.`)), { once: true });
    if (!script.isConnected) document.head.appendChild(script);
  }).catch((error: unknown) => {
    trackingSdkPromise = null;
    throw error;
  });

  return trackingSdkPromise;
}

function shortId(value: string) {
  if (!value) return '—';
  return value.length > 12 ? `${value.slice(0, 10)}…` : value;
}

function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card">
      <div className={`mb-4 inline-flex rounded-full px-2 py-1 text-xs font-medium ${accent}`}>{label}</div>
      <div className="text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}

export function HeatmapPanel({ refreshToken, range }: { refreshToken: number; range: DateRange }) {
  const [points, setPoints] = useState<Array<HeatmapClick & { _id: string }>>([]);
  const [pageUrl, setPageUrl] = useState(() => `${window.location.origin}/store/products`);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [invalidCoordinates, setInvalidCoordinates] = useState(0);
  const [viewportBreakdown, setViewportBreakdown] = useState<Array<{ viewportWidth: number; viewportHeight: number; clicks: number; sessions: number }>>([]);
  const [selectedViewport, setSelectedViewport] = useState<{ viewportWidth: number; viewportHeight: number } | null>(null);
  const [retry, setRetry] = useState(0);
  const [previewHeight, setPreviewHeight] = useState(900);
  const [previewError, setPreviewError] = useState('');
  const [previewWidth, setPreviewWidth] = useState(0);
  const previewContainer = useRef<HTMLDivElement | null>(null);
  const previewObserver = useRef<ResizeObserver | null>(null);
  const skipAutomaticViewportReload = useRef('');
  const previewUrl = new URL(pageUrl);
  previewUrl.searchParams.set('insighttrackPreview', '1');
  const validPoints = validHeatmapClicks(points);
  const densityPoints = buildHeatmapDensity(validPoints);
  const viewportKey = selectedViewport
    ? `${selectedViewport.viewportWidth}x${selectedViewport.viewportHeight}`
    : '';
  const loadRequestKey = `${pageUrl}|${range}|${refreshToken}|${retry}|${viewportKey}`;
  const previewScale = selectedViewport
    ? getPreviewScale(selectedViewport.viewportWidth, previewWidth)
    : 1;

  useEffect(() => {
    if (skipAutomaticViewportReload.current === loadRequestKey) {
      skipAutomaticViewportReload.current = '';
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const rangeQuery = dateRangeQuery(range);
        const viewportQuery = selectedViewport
          ? `&viewportWidth=${selectedViewport.viewportWidth}&viewportHeight=${selectedViewport.viewportHeight}`
          : '';
        const data = await apiFetch<{
          data: typeof points;
          total: number;
          sessions: number;
          invalidCoordinates: number;
          viewportBreakdown: typeof viewportBreakdown;
          selectedViewport: typeof selectedViewport;
        }>(`/heatmap?websiteId=demo-store&pageUrl=${encodeURIComponent(pageUrl)}&limit=200${rangeQuery ? `&${rangeQuery}` : ''}${viewportQuery}`);
        if (!active) return;
        setPoints(data.data);
        setTotal(data.total);
        setSessionCount(data.sessions);
        setInvalidCoordinates(data.invalidCoordinates);
        setViewportBreakdown(data.viewportBreakdown);
        if (data.selectedViewport) {
          if (!selectedViewport) {
            skipAutomaticViewportReload.current = `${pageUrl}|${range}|${refreshToken}|${retry}|${data.selectedViewport.viewportWidth}x${data.selectedViewport.viewportHeight}`;
          }
          setSelectedViewport(data.selectedViewport);
        } else if (selectedViewport) {
          skipAutomaticViewportReload.current = `${pageUrl}|${range}|${refreshToken}|${retry}|`;
          setSelectedViewport(null);
        }
      } catch (loadError) {
        if (!active) return;
        setError(errorMessage(loadError));
        setPoints([]);
        setTotal(0);
        setSessionCount(0);
        setInvalidCoordinates(0);
        setViewportBreakdown([]);
      }
      if (active) setLoading(false);
    };

    void load();
    return () => { active = false; };
  }, [loadRequestKey]);

  useEffect(() => {
    setPreviewHeight(900);
    setPreviewError('');
    setSelectedViewport(null);
    setViewportBreakdown([]);
    return () => previewObserver.current?.disconnect();
  }, [pageUrl]);

  useEffect(() => {
    const container = previewContainer.current;
    if (!container) return;
    const measureWidth = () => setPreviewWidth(container.clientWidth);
    measureWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Heatmap</p>
          <h3 className="text-lg font-semibold text-slate-900">Click intensity {loading ? '' : `(${total})`}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRetry((value) => value + 1)} className="rounded-lg border border-slate-200 p-2 text-slate-600" aria-label="Refresh heatmap">
            <RefreshCw size={15} />
          </button>
          <select
            value={pageUrl}
            onChange={(event) => {
              setPageUrl(event.target.value);
              setPoints([]);
              setTotal(0);
              setSessionCount(0);
              setInvalidCoordinates(0);
              setSelectedViewport(null);
              setViewportBreakdown([]);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            aria-label="Heatmap page"
          >
            <option value={`${window.location.origin}/store/products`}>Product Listing</option>
            <option value={`${window.location.origin}/store`}>Home</option>
            <option value={`${window.location.origin}/store/cart`}>Cart</option>
          </select>
          <select
            value={viewportKey}
            onChange={(event) => {
              const [width, height] = event.target.value.split('x').map(Number);
              setSelectedViewport(width && height ? { viewportWidth: width, viewportHeight: height } : null);
            }}
            className="max-w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            aria-label="Heatmap viewport"
            disabled={viewportBreakdown.length === 0}
          >
            {viewportBreakdown.length === 0 && <option value="">No viewport data</option>}
            {viewportBreakdown.map((viewport) => (
              <option
                key={`${viewport.viewportWidth}x${viewport.viewportHeight}`}
                value={`${viewport.viewportWidth}x${viewport.viewportHeight}`}
              >
                {viewport.viewportWidth} × {viewport.viewportHeight} ({formatNumber(viewport.clicks)} clicks)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div ref={previewContainer} className="relative h-72 overflow-auto rounded-2xl border border-slate-200 bg-slate-100">
        <div
          style={{
            width: selectedViewport ? selectedViewport.viewportWidth * previewScale : '100%',
            height: previewHeight * previewScale,
          }}
        >
          <div
            style={{
              width: selectedViewport?.viewportWidth || '100%',
              height: previewHeight,
              transform: `scale(${previewScale})`,
              transformOrigin: 'top left',
              position: 'relative',
            }}
          >
            <iframe
              key={`${pageUrl}-${viewportKey}`}
              src={previewUrl.href}
              title={`Full-page preview at ${selectedViewport?.viewportWidth || 'current'}px viewport width: ${new URL(pageUrl).pathname}`}
              className="pointer-events-none block border-0"
              style={{ height: previewHeight, width: selectedViewport?.viewportWidth || '100%' }}
              aria-hidden="true"
              tabIndex={-1}
              onLoad={(event) => {
                try {
                  const previewDocument = event.currentTarget.contentDocument;
                  if (previewDocument) {
                    const measureHeight = () => setPreviewHeight(Math.max(
                      previewDocument.documentElement.scrollHeight,
                      previewDocument.body?.scrollHeight || 0,
                      288,
                    ));
                    measureHeight();
                    previewObserver.current?.disconnect();
                    if (typeof ResizeObserver !== 'undefined') {
                      previewObserver.current = new ResizeObserver(measureHeight);
                      previewObserver.current.observe(previewDocument.documentElement);
                      if (previewDocument.body) previewObserver.current.observe(previewDocument.body);
                    }
                  } else {
                    setPreviewError('The selected page preview is unavailable.');
                  }
                } catch (previewError) {
                  setPreviewError('The selected page preview could not be measured.');
                  console.error('Could not measure the selected heatmap page preview:', previewError);
                }
              }}
              onError={() => setPreviewError('The selected page preview could not be loaded.')}
            />
            {densityPoints.length > 0 && (
              <div className="pointer-events-none absolute left-0 top-0 z-10 w-full" style={{ height: previewHeight }}>
                {densityPoints.map((point, index) => {
                  const diameter = Math.min(64, 24 + Math.sqrt(point.count - 1) * 10);
                  const style = {
                    left: point.left,
                    top: point.top,
                    width: `${diameter}px`,
                    height: `${diameter}px`,
                    opacity: Math.min(0.9, 0.55 + Math.log2(point.count) * 0.12),
                  };
                  return (
                    <span
                      key={`${point.left}-${point.top}-${index}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-500 shadow-lg shadow-brand-500/30"
                      style={style}
                      title={`${point.count} stored click${point.count === 1 ? '' : 's'} at ${point.clickX}, ${point.clickY} CSS pixels`}
                    >
                      {point.count > 1 && (
                        <span className="flex h-full items-center justify-center text-[10px] font-semibold text-white">
                          {formatNumber(point.count)}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-slate-500">Loading click data…</div>
        ) : error ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 px-4 text-center text-sm text-rose-700">
            <span>Could not load heatmap: {error}</span>
            <button onClick={() => setRetry((value) => value + 1)} className="font-medium underline">Retry</button>
          </div>
        ) : validPoints.length === 0 ? (
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-white/90 px-3 py-2 text-sm text-slate-600 shadow">
            {total > 0 ? 'Click events were found, but none have valid coordinates.' : 'No valid clicks yet for this page and viewport.'}
          </div>
        ) : null}
        {previewError && !loading && !error && (
          <div role="status" className="pointer-events-none absolute bottom-2 left-2 z-20 rounded-lg bg-white/90 px-3 py-2 text-xs text-amber-800 shadow">
            {previewError}
          </div>
        )}
      </div>
      {!loading && !error && (
        <div className="mt-3 space-y-1 text-xs text-slate-500">
          <p>{formatNumber(total)} clicks across {formatNumber(sessionCount)} sessions · viewport client coordinates mapped to the full page · {selectedViewport ? `${selectedViewport.viewportWidth} × ${selectedViewport.viewportHeight} CSS-pixel viewport` : 'viewport not available'}</p>
          {validPoints.length < total && (
            <p>Showing the {formatNumber(validPoints.length)} most recent valid click points from this filtered total.</p>
          )}
          <p className="break-all">Selected URL: {pageUrl}</p>
          {invalidCoordinates > 0 && (
            <p role="status" className="text-amber-700">{formatNumber(invalidCoordinates)} click events excluded because their coordinates or viewport metadata are invalid.</p>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardOverview() {
  const [summary, setSummary] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [range, setRange] = useState<DateRange>('30d');
  const [pages, setPages] = useState<PageMetric[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const rangeQuery = dateRangeQuery(range);
        const query = `?websiteId=demo-store${rangeQuery ? `&${rangeQuery}` : ''}`;
        const [response, pageResponse] = await Promise.all([
          apiFetch<Overview>(`/analytics/overview${query}`),
          apiFetch<{ data: PageMetric[] }>(`/pages${query}`),
        ]);
        if (!active) return;
        setSummary(response);
        setPages(pageResponse.data);
        setLastRefresh(new Date());
      } catch (loadError) {
        if (!active) return;
        setError(errorMessage(loadError));
      }
      if (active) setLoading(false);
    };

    void load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refreshToken, range]);

  const chartData = summary?.trend || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Performance overview</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Website analytics</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeSelect value={range} onChange={setRange} />
          <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            Last refresh: {lastRefresh?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '—'}
          </div>
          <button onClick={() => setRefreshToken((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load analytics: {error}</div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Sessions" value={summary ? formatNumber(summary.totalSessions) : '—'} accent="bg-sky-50 text-sky-700" />
        <StatCard label="Events" value={summary ? formatNumber(summary.totalEvents) : '—'} accent="bg-violet-50 text-violet-700" />
        <StatCard label="Page views" value={summary ? formatNumber(summary.pageViews) : '—'} accent="bg-emerald-50 text-emerald-700" />
        <StatCard label="Clicks" value={summary ? formatNumber(summary.clicks) : '—'} accent="bg-amber-50 text-amber-700" />
        <StatCard label="Unique pages" value={summary ? formatNumber(summary.uniquePages) : '—'} accent="bg-rose-50 text-rose-700" />
        <StatCard label="CTR" value={summary ? (summary.clickThroughRate === null ? 'N/A' : `${summary.clickThroughRate.toFixed(2)}%`) : '—'} accent="bg-indigo-50 text-indigo-700" />
      </div>
      {loading && !summary ? <p className="text-sm text-slate-500">Loading analytics…</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Trend</p>
              <h2 className="text-xl font-semibold text-slate-900">Event volume</h2>
            </div>
            <span className={`flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <TrendingUp size={12} />
              {error ? 'Unavailable' : loading ? 'Loading' : 'Live data'}
            </span>
          </div>

          <div className="h-72">
            {error ? (
              <div className="flex h-full items-center justify-center text-sm text-rose-600">Trend data is unavailable.</div>
            ) : loading && !summary ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading event data…</div>
            ) : chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="totalEvents" name="Events" stroke="#2563eb" fill="url(#trendFill)" strokeWidth={3} />
                  <Area type="monotone" dataKey="pageViews" name="Page views" stroke="#059669" fill="transparent" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">No event data available yet.</div>
            )}
          </div>
        </div>

        <HeatmapPanel refreshToken={refreshToken} range={range} />
      </div>
      <div className="card">
        <div className="mb-4">
          <p className="text-sm font-medium text-slate-500">Content performance</p>
          <h2 className="text-xl font-semibold text-slate-900">Page breakdown</h2>
          <p className="mt-1 text-sm text-slate-500">Unique pages are canonical URLs, counted within this website and date range.</p>
        </div>
        {loading && pages.length === 0 ? <p className="text-sm text-slate-500">Loading page metrics…</p> : pages.length === 0 ? (
          <p className="text-sm text-slate-500">No page activity in this date range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr><th className="px-4 py-3">Page URL</th><th className="px-4 py-3">Page views</th><th className="px-4 py-3">Clicks</th></tr>
              </thead>
              <tbody>
                {pages.slice(0, 10).map((page) => (
                  <tr key={page.pageUrl} className="border-t border-slate-100">
                    <td className="max-w-xl truncate px-4 py-3 text-sm text-slate-700" title={page.pageUrl}>{page.pageUrl}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(page.pageViews)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(page.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardSessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [range, setRange] = useState<DateRange>('30d');
  const [sortBy, setSortBy] = useState<'lastSeen' | 'firstSeen' | 'totalEvents' | 'pageViews' | 'clicks'>('lastSeen');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const rangeQuery = dateRangeQuery(range);
        const params = new URLSearchParams({
          websiteId: 'demo-store',
          page: String(page),
          limit: '10',
          sortBy,
          sortOrder,
        });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (rangeQuery) new URLSearchParams(rangeQuery).forEach((value, key) => params.set(key, value));
        const response = await apiFetch<{ data: SessionSummary[]; pagination?: { totalPages: number } }>(`/sessions?${params.toString()}`);
        if (!active) return;
        setSessions(response.data || []);
        setLastPage(response.pagination?.totalPages || 1);
      } catch (loadError) {
        if (!active) return;
        setError(errorMessage(loadError));
        setSessions([]);
      }
      if (active) setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [page, retry, range, debouncedSearch, sortBy, sortOrder]);

  function toggleSort(column: typeof sortBy) {
    if (sortBy === column) setSortOrder((order) => order === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(column);
      setSortOrder(column === 'firstSeen' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  function sortLabel(column: typeof sortBy, label: string) {
    return (
      <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1 hover:text-slate-800" aria-label={`Sort by ${label}`}>
        {label}{sortBy === column ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Sessions</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Explorer</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeSelect value={range} onChange={(nextRange) => { setRange(nextRange); setPage(1); }} />
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none ring-offset-0 focus:border-brand-500"
              placeholder="Search session ID"
              aria-label="Search session ID"
            />
          </div>
          <button onClick={() => setRetry((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load sessions: {error}</div> : null}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">{sortLabel('firstSeen', 'First seen')}</th>
                <th className="px-4 py-3">{sortLabel('lastSeen', 'Last seen')}</th>
                <th className="px-4 py-3">{sortLabel('totalEvents', 'Events')}</th>
                <th className="px-4 py-3">{sortLabel('pageViews', 'Page views')}</th>
                <th className="px-4 py-3">{sortLabel('clicks', 'Clicks')}</th>
                <th className="px-4 py-3">Pages</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-8 text-sm text-slate-500" colSpan={8}>Loading sessions…</td></tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-sm text-slate-500" colSpan={8}>{error ? 'Session data is unavailable.' : 'No sessions match the current filter.'}</td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.sessionId} className="border-t border-slate-100 transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-slate-900">{shortId(session.sessionId)}</span>
                        <button
                          className="inline-flex items-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-brand-500 hover:text-brand-600"
                          onClick={() => { void navigator.clipboard?.writeText(session.sessionId).catch((copyError) => console.error('Could not copy session ID:', copyError)); }}
                          aria-label="Copy session ID"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDate(session.firstSeen)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDate(session.lastSeen)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{session.totalEvents}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{session.pageViews}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{session.clicks}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{session.uniquePages}</td>
                    <td className="px-4 py-3">
                      <Link to={`/dashboard/session/${encodeURIComponent(session.sessionId)}${rangeQuerySuffix(range)}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                        View <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <button
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-50"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">Page {page} of {lastPage}</span>
          <button
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-50"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= lastPage}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardSessionDetail() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState<TrackedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!sessionId) {
        setEvents([]);
        setError('A session ID is required.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ websiteId: 'demo-store', page: String(page), limit: '40' });
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const response = await apiFetch<{ data: TrackedEvent[]; pagination?: { totalPages: number } }>(`/sessions/${encodeURIComponent(sessionId)}/events?${params.toString()}`);
        if (!active) return;
        setEvents(response.data || []);
        setTotalPages(response.pagination?.totalPages || 1);
      } catch (loadError) {
        if (!active) return;
        setError(errorMessage(loadError));
        setEvents([]);
      }
      if (active) setLoading(false);
    };

    void load();
    return () => { active = false; };
  }, [sessionId, retry, page, searchParams]);

  useEffect(() => {
    setPage(1);
  }, [sessionId, searchParams]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Journey</p>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Session {shortId(sessionId || '')}</h1>
          <button onClick={() => setRetry((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load session events: {error}</div> : null}
      <div className="card">
        <div className="space-y-4">
          {loading ? (
            <div className="text-sm text-slate-500">Loading session events…</div>
          ) : events.length === 0 ? (
            <div className="text-sm text-slate-500">{error ? 'Session events are unavailable.' : 'No events available for this session.'}</div>
          ) : (
            events.map((event, index) => (
              <div key={`${event._id || index}`} className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {event.eventType === 'click' ? 'C' : 'P'}
                </div>
                <div className="flex-1">
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div className="font-medium text-slate-900">
                      {event.eventType === 'click' ? 'Click event' : 'Page view'}
                    </div>
                    <time className="text-sm text-slate-500">{formatDate(event.timestamp)}</time>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{event.pageUrl}</div>
                  {event.eventType === 'click' ? (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                      <span className="rounded-full bg-white px-2 py-1">X: {event.clickX}</span>
                      <span className="rounded-full bg-white px-2 py-1">Y: {event.clickY}</span>
                      <span className="rounded-full bg-white px-2 py-1">Element: {event.elementTag || 'Unknown'}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
        {!loading && !error && events.length > 0 ? (
          <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
            <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-50" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</button>
            <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
            <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-50" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>Next</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StorefrontHome() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 p-8 text-white shadow-soft">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.8),transparent_35%)]" />
        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.14em] text-slate-200">
              <Sparkles size={14} />
              Built for product insight
            </div>
            <h1 className="text-4xl font-semibold tracking-tight">See what shoppers click, explore, and buy.</h1>
            <p className="mt-4 max-w-lg text-slate-300">
              InsightTrack records each page visit and click in context so your team can improve product discovery and conversion.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/store/products" className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-3 font-medium text-white shadow-lg shadow-brand-500/30">
                Explore products <ArrowRight size={16} />
              </Link>
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-3 font-medium text-white">
                Open dashboard <Monitor size={16} />
              </Link>
            </div>
          </div>
          <div className="grid w-full max-w-md gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white/8 p-4 backdrop-blur-sm md:col-span-2">
              <p className="text-sm text-slate-300">Track the complete shopper journey</p>
              <p className="mt-2 text-xl font-semibold">Home → Product list → Detail → Cart</p>
              <p className="mt-2 text-sm text-slate-300">Live session and click data appears in your dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Featured</p>
            <h2 className="text-2xl font-semibold text-slate-900">Best sellers</h2>
          </div>
          <Link to="/store/products" className="inline-flex items-center gap-2 text-sm font-medium text-brand-600">
            View all <ChevronRight size={16} />
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => (
            <div key={product.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className={`h-56 bg-gradient-to-br ${product.accent} p-4`}>
                <img src={product.image} alt={product.name} className="h-full w-full rounded-2xl object-cover" />
              </div>
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.12em] text-slate-500">
                  <span>{product.category}</span>
                  <span>★ {product.rating}</span>
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{product.name}</h3>
                <p className="mt-2 text-sm text-slate-600">{product.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xl font-semibold">${product.price}</span>
                  <Link to={`/store/product/${product.id}`} className="inline-flex items-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">
                    View
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StorefrontProducts() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Shop</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Product collection</h1>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {products.map((product) => (
          <div key={product.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className={`h-60 bg-gradient-to-br ${product.accent} p-4`}>
              <img src={product.image} alt={product.name} className="h-full w-full rounded-2xl object-cover" />
            </div>
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.12em] text-slate-500">
                <span>{product.category}</span>
                <span>★ {product.rating}</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900">{product.name}</h3>
              <p className="mt-2 text-sm text-slate-600">{product.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xl font-semibold">${product.price}</span>
                <Link to={`/store/product/${product.id}`} className="inline-flex items-center rounded-xl bg-brand-500 px-3 py-2 text-sm font-medium text-white">
                  Details
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StorefrontProductDetail() {
  const { productId } = useParams();
  const product = products.find((item) => item.id === productId) || products[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className={`h-[420px] bg-gradient-to-br ${product.accent} p-5`}>
          <img src={product.image} alt={product.name} className="h-full w-full rounded-3xl object-cover" />
        </div>
      </div>

      <div className="card">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{product.category}</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">{product.name}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <span>★ {product.rating}</span>
          <span>•</span>
          <span>500+ reviews</span>
        </div>
        <p className="mt-5 text-slate-600">{product.description}</p>
        <div className="mt-6 flex items-end gap-3">
          <span className="text-3xl font-bold text-slate-900">${product.price}</span>
          <span className="text-sm text-slate-500 line-through">${product.price + 40}</span>
        </div>

        <div className="mt-7 flex gap-3">
          <button data-insighttrack-id="add-to-cart" className="flex-1 rounded-xl bg-slate-900 px-4 py-3 font-medium text-white">
            Add to cart
          </button>
          <Link to="/store/cart" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700">
            View cart
          </Link>
        </div>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-900">Included</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Free delivery over $50</li>
            <li>30-day returns</li>
            <li>2-year warranty</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function StorefrontCart() {
  const cartProducts = products.slice(0, 2);
  const subtotal = cartProducts.reduce((sum, product) => sum + product.price, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Cart</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Your items</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
        <div className="space-y-4">
          {cartProducts.map((product) => (
            <div key={product.id} className="flex gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <img src={product.image} alt={product.name} className="h-28 w-28 rounded-2xl object-cover" />
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold text-slate-900">{product.name}</h2>
                    <span className="font-medium text-slate-900">${product.price}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{product.description}</p>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                  <span>Qty: 1</span>
                  <button className="text-brand-600">Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card h-fit">
          <h2 className="text-xl font-semibold text-slate-900">Summary</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex justify-between"><span>Subtotal</span><span>${subtotal}</span></div>
            <div className="flex justify-between"><span>Shipping</span><span>Free</span></div>
            <div className="flex justify-between"><span>Tax</span><span>$12</span></div>
          </div>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-slate-900">Total</span>
              <span className="text-lg font-semibold text-slate-900">${subtotal + 12}</span>
            </div>
            <button className="mt-5 w-full rounded-xl bg-brand-500 px-4 py-3 font-medium text-white">
              Checkout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  const [trackingError, setTrackingError] = useState('');

  useEffect(() => {
    let active = true;
    void loadTrackingSdk().then(() => {
      if (!active) return;
      const tracker = (window as Window & { InsightTrack?: Tracker }).InsightTrack;
      if (!tracker) throw new Error('InsightTrack is unavailable after the SDK loaded.');
      const config = tracker.init({
        apiUrl: API_BASE,
        websiteId: 'demo-store',
        respectDoNotTrack: true,
        development: import.meta.env.DEV,
        ignorePaths: ['/dashboard'],
      });
      if (!config.enabled && !tracker.isOptedOut()) {
        throw new Error('InsightTrack initialization did not enable event collection.');
      }
      setTrackingError('');
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('InsightTrack could not start:', error);
      setTrackingError(errorMessage(error));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        {trackingError && import.meta.env.DEV ? (
          <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Analytics tracking could not start: {trackingError}
          </div>
        ) : null}
        <header className="panel mb-6 flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
              <BarChart3 size={20} />
            </div>
            <div>
              <div className="text-lg font-semibold">InsightTrack</div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Session analytics</div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            {sidebarItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="pb-12">
          <Routes>
            <Route path="/" element={<StorefrontHome />} />
            <Route path="/store" element={<StorefrontHome />} />
            <Route path="/store/products" element={<StorefrontProducts />} />
            <Route path="/store/product/:productId" element={<StorefrontProductDetail />} />
            <Route path="/store/cart" element={<StorefrontCart />} />
            <Route path="/dashboard" element={<DashboardOverview />} />
            <Route path="/dashboard/sessions" element={<DashboardSessions />} />
            <Route path="/dashboard/session/:sessionId" element={<DashboardSessionDetail />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return <BrowserRouter><AppShell /></BrowserRouter>;
}
