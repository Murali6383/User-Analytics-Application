import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useParams } from 'react-router-dom';
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
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch } from './lib/api';
import { products } from './data/products';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const sidebarItems = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Sessions', to: '/dashboard/sessions', icon: Users },
  { label: 'Store Demo', to: '/store', icon: ShoppingBag },
];

function shortId(value: string) {
  if (!value) return '—';
  return value.length > 12 ? `${value.slice(0, 10)}…` : value;
}

function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
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

function HeatmapPanel() {
  const [points, setPoints] = useState<any[]>([]);
  const [pageUrl, setPageUrl] = useState(() => `${window.location.origin}/store/products`);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<{ data: any[]; total: number }>(`/heatmap?websiteId=demo-store&pageUrl=${encodeURIComponent(pageUrl)}&limit=40`);
        setPoints(data.data || []);
      } catch {
        setPoints([]);
      }
    };

    load();
  }, [pageUrl]);

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Heatmap</p>
          <h3 className="text-lg font-semibold text-slate-900">Click intensity</h3>
        </div>
        <select
          value={pageUrl}
          onChange={(event) => setPageUrl(event.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        >
          <option value={`${window.location.origin}/store/products`}>Product Listing</option>
          <option value={`${window.location.origin}/store`}>Home</option>
          <option value={`${window.location.origin}/store/cart`}>Cart</option>
        </select>
      </div>

      <div className="relative h-72 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100">
        {points.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">No clicks yet for this page.</div>
        ) : (
          points.map((point, index) => (
            <span
              key={`${point._id || index}-${index}`}
              className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/80 shadow-lg shadow-brand-500/20"
              style={{
                left: `${Math.min(Math.max(point.normalizedX || 0, 2), 98)}%`,
                top: `${Math.min(Math.max(point.normalizedY || 0, 2), 98)}%`,
              }}
              title={`click at ${point.clickX}, ${point.clickY}`}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DashboardOverview() {
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await apiFetch<any>(`/analytics/overview?websiteId=demo-store`);
        setSummary(response);
      } catch {
        setSummary({
          totalSessions: 0,
          totalEvents: 0,
          pageViews: 0,
          clicks: 0,
          uniquePages: 0,
          clickThroughRate: 0,
          trend: [],
          error: true,
        });
      }
    };

    load();
  }, []);

  const chartData = summary?.trend || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Performance overview</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Website analytics</h1>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          Last refresh: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Sessions" value={formatNumber(summary?.totalSessions || 0)} accent="bg-sky-50 text-sky-700" />
        <StatCard label="Events" value={formatNumber(summary?.totalEvents || 0)} accent="bg-violet-50 text-violet-700" />
        <StatCard label="Page views" value={formatNumber(summary?.pageViews || 0)} accent="bg-emerald-50 text-emerald-700" />
        <StatCard label="Clicks" value={formatNumber(summary?.clicks || 0)} accent="bg-amber-50 text-amber-700" />
        <StatCard label="Unique pages" value={formatNumber(summary?.uniquePages || 0)} accent="bg-rose-50 text-rose-700" />
        <StatCard label="CTR" value={`${(summary?.clickThroughRate || 0).toFixed(2)}%`} accent="bg-indigo-50 text-indigo-700" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Trend</p>
              <h2 className="text-xl font-semibold text-slate-900">Event volume</h2>
            </div>
            <span className="flex items-center gap-2 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
              <TrendingUp size={12} />
              Live data
            </span>
          </div>

          <div className="h-72">
            {chartData.length ? (
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
                  <Area type="monotone" dataKey="totalEvents" stroke="#2563eb" fill="url(#trendFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">No event data available yet.</div>
            )}
          </div>
        </div>

        <HeatmapPanel />
      </div>
    </div>
  );
}

function DashboardSessions() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      const response = await apiFetch<any>(`/sessions?websiteId=demo-store&page=${page}&limit=10`);
      setSessions(response.data || []);
      setLastPage(response.pagination?.totalPages || 1);
    };
    load();
  }, [page]);

  const filtered = sessions.filter((session) => session.sessionId.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Sessions</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Explorer</h1>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none ring-offset-0 focus:border-brand-500"
            placeholder="Search session ID"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">First seen</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3">Events</th>
                <th className="px-4 py-3">Page views</th>
                <th className="px-4 py-3">Clicks</th>
                <th className="px-4 py-3">Pages</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-sm text-slate-500" colSpan={8}>No sessions match the current filter.</td>
                </tr>
              ) : (
                filtered.map((session) => (
                  <tr key={session.sessionId} className="border-t border-slate-100 transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-slate-900">{shortId(session.sessionId)}</span>
                        <button
                          className="inline-flex items-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-brand-500 hover:text-brand-600"
                          onClick={() => navigator.clipboard.writeText(session.sessionId)}
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
                      <Link to={`/dashboard/session/${encodeURIComponent(session.sessionId)}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
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
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!sessionId) return;
      const response = await apiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/events?websiteId=demo-store&page=1&limit=40`);
      setEvents(response.data || []);
    };

    load();
  }, [sessionId]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Journey</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Session {shortId(sessionId || '')}</h1>
      </div>

      <div className="card">
        <div className="space-y-4">
          {events.length === 0 ? (
            <div className="text-sm text-slate-500">No events available for this session.</div>
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
            <div className="rounded-2xl bg-white/8 p-4 backdrop-blur-sm">
              <p className="text-sm text-slate-300">Active sessions</p>
              <p className="mt-2 text-3xl font-semibold">1,248</p>
            </div>
            <div className="rounded-2xl bg-white/8 p-4 backdrop-blur-sm">
              <p className="text-sm text-slate-300">CTR</p>
              <p className="mt-2 text-3xl font-semibold">7.4%</p>
            </div>
            <div className="rounded-2xl bg-white/8 p-4 backdrop-blur-sm md:col-span-2">
              <p className="text-sm text-slate-300">Top conversion path</p>
              <p className="mt-2 text-xl font-semibold">Home → Product list → Detail → Cart</p>
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const script = document.createElement('script');
    script.src = '/sdk/insighttrack.js';
    script.async = true;
    script.dataset.insighttrackSdk = 'true';
    document.body.appendChild(script);

    const initialize = () => {
      const tracker = (window as any).InsightTrack;
      if (tracker) {
        tracker.init({
          apiUrl: API_BASE,
          websiteId: 'demo-store',
          respectDoNotTrack: true,
        });
      }
    };

    if (document.readyState === 'complete') {
      initialize();
    } else {
      window.addEventListener('load', initialize, { once: true });
    }

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
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
