import type { FilterQuery } from 'mongoose';
import { EventModel } from '../models/Event.js';

const DEFAULT_PAGE_SIZE = 20;
const SENSITIVE_QUERY_KEYS = /(?:token|auth|password|passwd|email|phone|mobile|ssn|secret|code|api[_-]?key|jwt|user(?:name|id)?|customer(?:name|id)?|first[_-]?name|last[_-]?name|address|birth(?:day|date)?|dob|postal|zip)/i;

type EventPayload = {
  eventId?: string;
  websiteId: string;
  sessionId: string;
  eventType: 'page_view' | 'click';
  pageUrl: string;
  timestamp: string;
  clickX?: number;
  clickY?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  documentWidth?: number;
  documentHeight?: number;
  scrollX?: number;
  scrollY?: number;
  devicePixelRatio?: number;
  coordinateMode?: 'document' | 'viewport';
  pageTitle?: string;
  elementTag?: string;
  elementId?: string;
};

function normalizePageUrl(value: string) {
  const url = new URL(value);
  url.hash = '';
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  for (const key of Array.from(url.searchParams.keys())) {
    if (SENSITIVE_QUERY_KEYS.test(key)) {
      url.searchParams.set(key, '[redacted]');
    }
  }
  return url.href;
}

function pageUrlMatch(value: string) {
  const normalized = normalizePageUrl(value);
  const url = new URL(normalized);
  const legacyTrailingSlash = new URL(normalized);
  if (legacyTrailingSlash.pathname !== '/') {
    legacyTrailingSlash.pathname += '/';
  }
  return { $in: [normalized, legacyTrailingSlash.href] };
}

function buildDateMatch(filters: { from?: string; to?: string }) {
  const dateMatch: Record<string, any> = {};
  if (filters.from) {
    dateMatch.$gte = new Date(filters.from);
  }
  if (filters.to) {
    dateMatch.$lte = new Date(filters.to);
  }

  return Object.keys(dateMatch).length > 0 ? { timestamp: dateMatch } : {};
}

export async function createEvent(payload: EventPayload) {
  const event = await EventModel.create({
    ...payload,
    pageUrl: normalizePageUrl(payload.pageUrl),
    timestamp: new Date(payload.timestamp),
  });

  return event.toObject();
}

export async function getSessionSummaries({ websiteId, from, to, page, limit, search, sortBy, sortOrder }: {
  websiteId?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
  search?: string;
  sortBy: 'lastSeen' | 'firstSeen' | 'totalEvents' | 'pageViews' | 'clicks';
  sortOrder: 'asc' | 'desc';
}) {
  const match: Record<string, any> = {};
  if (websiteId) match.websiteId = websiteId;
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    match.sessionId = { $regex: escapedSearch, $options: 'i' };
  }
  const dateMatch = buildDateMatch({ from, to });
  Object.assign(match, dateMatch);

  const pipeline: any[] = [
    { $match: match },
    {
      $group: {
        _id: { websiteId: '$websiteId', sessionId: '$sessionId' },
        websiteId: { $first: '$websiteId' },
        sessionId: { $first: '$sessionId' },
        firstSeen: { $min: '$timestamp' },
        lastSeen: { $max: '$timestamp' },
        totalEvents: { $sum: 1 },
        pageViews: {
          $sum: { $cond: [{ $eq: ['$eventType', 'page_view'] }, 1, 0] },
        },
        clicks: {
          $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] },
        },
        uniquePages: { $addToSet: '$pageUrl' },
      },
    },
    {
      $project: {
        _id: 0,
        websiteId: 1,
        sessionId: 1,
        firstSeen: 1,
        lastSeen: 1,
        totalEvents: 1,
        pageViews: 1,
        clicks: 1,
        uniquePages: { $size: '$uniquePages' },
      },
    },
    { $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1, sessionId: 1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ];

  const sessions = await EventModel.aggregate(pipeline);
  const totalSessions = await EventModel.aggregate([
    { $match: match },
    { $group: { _id: { websiteId: '$websiteId', sessionId: '$sessionId' } } },
    { $count: 'count' },
  ]);

  return {
    data: sessions,
    pagination: {
      page,
      limit,
      total: totalSessions[0]?.count || 0,
      totalPages: Math.ceil((totalSessions[0]?.count || 0) / limit),
    },
  };
}

export async function getSessionEvents({ sessionId, websiteId, from, to, page, limit }: { sessionId: string; websiteId?: string; from?: string; to?: string; page: number; limit: number }) {
  const search: FilterQuery<any> = { sessionId };
  if (websiteId) {
    search.websiteId = websiteId;
  }
  const dateMatch = buildDateMatch({ from, to });
  if (Object.keys(dateMatch).length > 0) {
    Object.assign(search, dateMatch);
  }

  const total = await EventModel.countDocuments(search);
  const events = await EventModel.find(search)
    .sort({ timestamp: 1, _id: 1 })
    .skip((page - 1) * limit)
    .limit(limit || DEFAULT_PAGE_SIZE)
    .lean();

  return {
    data: events,
    pagination: {
      page,
      limit: limit || DEFAULT_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / (limit || DEFAULT_PAGE_SIZE)),
    },
  };
}

export async function getPageAnalytics({ websiteId, from, to }: { websiteId?: string; from?: string; to?: string }) {
  const match: Record<string, any> = {};
  if (websiteId) match.websiteId = websiteId;
  const dateMatch = buildDateMatch({ from, to });
  Object.assign(match, dateMatch);

  const pages = await EventModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$pageUrl',
        pageUrl: { $first: '$pageUrl' },
        pageViews: {
          $sum: { $cond: [{ $eq: ['$eventType', 'page_view'] }, 1, 0] },
        },
        clicks: {
          $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] },
        },
      },
    },
    { $project: { _id: 0, pageUrl: 1, pageViews: 1, clicks: 1 } },
    { $sort: { clicks: -1 as const, pageViews: -1 as const } },
  ]);

  return pages;
}

function heatmapCoordinatesValidExpression() {
  const docWidth = { $cond: [{ $isNumber: '$documentWidth' }, '$documentWidth', 0] };
  const viewWidth = { $cond: [{ $isNumber: '$viewportWidth' }, '$viewportWidth', 0] };
  const docHeight = { $cond: [{ $isNumber: '$documentHeight' }, '$documentHeight', 0] };
  const viewHeight = { $cond: [{ $isNumber: '$viewportHeight' }, '$viewportHeight', 0] };
  const clickX = { $cond: [{ $isNumber: '$clickX' }, '$clickX', 0] };
  const clickY = { $cond: [{ $isNumber: '$clickY' }, '$clickY', 0] };
  const scrollX = { $cond: [{ $isNumber: '$scrollX' }, '$scrollX', 0] };
  const scrollY = { $cond: [{ $isNumber: '$scrollY' }, '$scrollY', 0] };
  const width = { $max: [docWidth, viewWidth] };
  const height = { $max: [docHeight, viewHeight] };
  const viewportMode = { $eq: ['$coordinateMode', 'viewport'] };
  const x = { $cond: [viewportMode, { $add: [clickX, scrollX] }, clickX] };
  const y = { $cond: [viewportMode, { $add: [clickY, scrollY] }, clickY] };
  return {
    $and: [
      { $isNumber: '$clickX' },
      { $isNumber: '$clickY' },
      { $isNumber: '$viewportWidth' },
      { $isNumber: '$viewportHeight' },
      { $gte: [clickX, 0] },
      { $gte: [clickY, 0] },
      { $gt: [viewWidth, 0] },
      { $gt: [viewHeight, 0] },
      { $gt: [width, 0] },
      { $gt: [height, 0] },
      { $lte: [x, width] },
      { $lte: [y, height] },
      {
        $or: [
          { $ne: ['$coordinateMode', 'viewport'] },
          {
            $and: [
              { $lte: [clickX, viewWidth] },
              { $lte: [clickY, viewHeight] },
            ],
          },
        ],
      },
    ],
  };
}

export async function getHeatmap({ websiteId, pageUrl, from, to, limit = 200, viewportWidth, viewportHeight }: {
  websiteId: string;
  pageUrl: string;
  from?: string;
  to?: string;
  limit?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}) {
  const match: Record<string, any> = { websiteId, pageUrl: pageUrlMatch(pageUrl), eventType: 'click' };
  const dateMatch = buildDateMatch({ from, to });
  Object.assign(match, dateMatch);

  const [diagnostics] = await EventModel.aggregate([
    { $match: match },
    {
      $addFields: {
        _coordinateValid: heatmapCoordinatesValidExpression(),
        _heatmapX: {
          $cond: [
            { $eq: ['$coordinateMode', 'viewport'] },
            { $add: [
              { $cond: [{ $isNumber: '$clickX' }, '$clickX', 0] },
              { $cond: [{ $isNumber: '$scrollX' }, '$scrollX', 0] },
            ] },
            '$clickX',
          ],
        },
        _heatmapY: {
          $cond: [
            { $eq: ['$coordinateMode', 'viewport'] },
            { $add: [
              { $cond: [{ $isNumber: '$clickY' }, '$clickY', 0] },
              { $cond: [{ $isNumber: '$scrollY' }, '$scrollY', 0] },
            ] },
            '$clickY',
          ],
        },
      },
    },
    {
      $facet: {
        viewportBreakdown: [
          { $match: { _coordinateValid: true } },
          {
            $group: {
              _id: { width: '$viewportWidth', height: '$viewportHeight', sessionId: '$sessionId' },
              clicks: { $sum: 1 },
            },
          },
          {
            $group: {
              _id: { width: '$_id.width', height: '$_id.height' },
              clicks: { $sum: '$clicks' },
              sessions: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              viewportWidth: '$_id.width',
              viewportHeight: '$_id.height',
              clicks: 1,
              sessions: 1,
            },
          },
          { $sort: { clicks: -1 as const, viewportWidth: 1 as const, viewportHeight: 1 as const } },
        ],
        invalidCoordinates: [
          { $match: { _coordinateValid: { $ne: true } } },
          { $count: 'count' },
        ],
      },
    },
  ]);

  const viewportBreakdown = diagnostics?.viewportBreakdown || [];
  const requestedViewport = viewportWidth !== undefined && viewportHeight !== undefined
    ? viewportBreakdown.find((viewport: any) => (
      viewport.viewportWidth === viewportWidth && viewport.viewportHeight === viewportHeight
    ))
    : undefined;
  const selectedViewport = viewportWidth !== undefined && viewportHeight !== undefined
    ? requestedViewport
      ? { viewportWidth, viewportHeight }
      : null
    : viewportBreakdown[0]
      ? { viewportWidth: viewportBreakdown[0].viewportWidth, viewportHeight: viewportBreakdown[0].viewportHeight }
      : null;

  if (!selectedViewport) {
    return {
      data: [],
      total: 0,
      sessions: 0,
      invalidCoordinates: diagnostics?.invalidCoordinates[0]?.count || 0,
      viewportBreakdown,
      selectedViewport: null,
    };
  }

  const selectedMatch = {
    ...match,
    viewportWidth: selectedViewport.viewportWidth,
    viewportHeight: selectedViewport.viewportHeight,
    $expr: heatmapCoordinatesValidExpression(),
  };
  const [selected] = await EventModel.aggregate([
    { $match: selectedMatch },
    {
      $addFields: {
        _heatmapX: {
          $cond: [
            { $eq: ['$coordinateMode', 'viewport'] },
            { $add: [
              { $cond: [{ $isNumber: '$clickX' }, '$clickX', 0] },
              { $cond: [{ $isNumber: '$scrollX' }, '$scrollX', 0] },
            ] },
            '$clickX',
          ],
        },
        _heatmapY: {
          $cond: [
            { $eq: ['$coordinateMode', 'viewport'] },
            { $add: [
              { $cond: [{ $isNumber: '$clickY' }, '$clickY', 0] },
              { $cond: [{ $isNumber: '$scrollY' }, '$scrollY', 0] },
            ] },
            '$clickY',
          ],
        },
      },
    },
    {
      $facet: {
        summary: [
          { $count: 'total' },
        ],
        sessions: [
          { $group: { _id: '$sessionId' } },
          { $count: 'count' },
        ],
        events: [
          { $sort: { timestamp: -1 as const, _id: -1 as const } },
          { $limit: limit },
          { $project: { _coordinateValid: 0 } },
        ],
      },
    },
  ]);
  const summary = {
    total: selected?.summary[0]?.total || 0,
    sessions: selected?.sessions[0]?.count || 0,
  };
  const normalized = (selected?.events || []).map((event: any) => {
    const documentWidth = Math.max(Number(event.documentWidth || 0), Number(event.viewportWidth || 0));
    const documentHeight = Math.max(Number(event.documentHeight || 0), Number(event.viewportHeight || 0));
    const { _heatmapX, _heatmapY, ...storedEvent } = event;
    return {
      ...storedEvent,
      normalizedX: (Number(_heatmapX ?? event.clickX) / documentWidth) * 100,
      normalizedY: (Number(_heatmapY ?? event.clickY) / documentHeight) * 100,
    };
  });

  return {
    data: normalized,
    total: summary.total,
    sessions: summary.sessions,
    invalidCoordinates: diagnostics?.invalidCoordinates[0]?.count || 0,
    viewportBreakdown,
    selectedViewport,
  };
}

export async function getOverview({ websiteId, from, to }: { websiteId?: string; from?: string; to?: string }) {
  const match: Record<string, any> = {};
  if (websiteId) match.websiteId = websiteId;
  const dateMatch = buildDateMatch({ from, to });
  Object.assign(match, dateMatch);

  const [result] = await EventModel.aggregate([
    { $match: match },
    {
      $facet: {
        metrics: [{
          $group: {
            _id: null,
            totalEvents: { $sum: 1 },
            pageViews: { $sum: { $cond: [{ $eq: ['$eventType', 'page_view'] }, 1, 0] } },
            clicks: { $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] } },
          },
        }, { $project: { _id: 0 } }],
        sessions: [
          { $group: { _id: { websiteId: '$websiteId', sessionId: '$sessionId' } } },
          { $count: 'count' },
        ],
        pages: [
          { $group: { _id: { websiteId: '$websiteId', pageUrl: '$pageUrl' } } },
          { $count: 'count' },
        ],
      },
    },
    {
      $project: {
        metrics: { $arrayElemAt: ['$metrics', 0] },
        totalSessions: { $ifNull: [{ $arrayElemAt: ['$sessions.count', 0] }, 0] },
        uniquePages: { $ifNull: [{ $arrayElemAt: ['$pages.count', 0] }, 0] },
      },
    },
  ]);

  const summary = {
    totalEvents: result?.metrics?.totalEvents || 0,
    pageViews: result?.metrics?.pageViews || 0,
    clicks: result?.metrics?.clicks || 0,
    totalSessions: result?.totalSessions || 0,
    uniquePages: result?.uniquePages || 0,
  };
  return {
    ...summary,
    clickThroughRate: null,
  };
}

export async function getTrendData({ websiteId, from, to }: { websiteId?: string; from?: string; to?: string }) {
  const match: Record<string, any> = {};
  if (websiteId) match.websiteId = websiteId;
  const dateMatch = buildDateMatch({ from, to });
  Object.assign(match, dateMatch);

  const trend = await EventModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        totalEvents: { $sum: 1 },
        pageViews: {
          $sum: { $cond: [{ $eq: ['$eventType', 'page_view'] }, 1, 0] },
        },
        clicks: {
          $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 as const } },
  ]);

  return trend.map((entry) => ({
    date: entry._id,
    totalEvents: entry.totalEvents,
    pageViews: entry.pageViews,
    clicks: entry.clicks,
  }));
}
