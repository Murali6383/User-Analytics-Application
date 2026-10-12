import type { FilterQuery } from 'mongoose';
import { EventModel } from '../models/Event.js';

const DEFAULT_PAGE_SIZE = 20;

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

export async function createEvent(payload: any) {
  const event = await EventModel.create({
    ...payload,
    timestamp: new Date(payload.timestamp),
  });

  return event.toObject();
}

export async function getSessionSummaries({ websiteId, from, to, page, limit }: { websiteId?: string; from?: string; to?: string; page: number; limit: number }) {
  const match: Record<string, any> = {};
  if (websiteId) match.websiteId = websiteId;
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
    { $sort: { lastSeen: -1 as const } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ];

  const sessions = await EventModel.aggregate(pipeline);
  const totalSessions = await EventModel.aggregate([
    { $match: match },
    { $group: { _id: '$sessionId' } },
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
    .sort({ timestamp: 1 })
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

export async function getHeatmap({ websiteId, pageUrl, from, to, limit = 200 }: { websiteId: string; pageUrl: string; from?: string; to?: string; limit?: number }) {
  const match: Record<string, any> = { websiteId, pageUrl, eventType: 'click' };
  const dateMatch = buildDateMatch({ from, to });
  Object.assign(match, dateMatch);

  const events = await EventModel.find(match)
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  const normalized = events.map((event: any) => {
    const documentWidth = Number(event.documentWidth || 0) || 1;
    const documentHeight = Number(event.documentHeight || 0) || 1;

    return {
      ...event,
      clickX: Number(event.clickX ?? 0),
      clickY: Number(event.clickY ?? 0),
      normalizedX: documentWidth > 0 ? (Number(event.clickX || 0) / documentWidth) * 100 : 0,
      normalizedY: documentHeight > 0 ? (Number(event.clickY || 0) / documentHeight) * 100 : 0,
    };
  });

  return { data: normalized, total: normalized.length };
}

export async function getOverview({ websiteId, from, to }: { websiteId?: string; from?: string; to?: string }) {
  const match: Record<string, any> = {};
  if (websiteId) match.websiteId = websiteId;
  const dateMatch = buildDateMatch({ from, to });
  Object.assign(match, dateMatch);

  const totals = await EventModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        pageViews: {
          $sum: { $cond: [{ $eq: ['$eventType', 'page_view'] }, 1, 0] },
        },
        clicks: {
          $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] },
        },
        sessions: { $addToSet: '$sessionId' },
        pages: { $addToSet: '$pageUrl' },
      },
    },
    {
      $project: {
        _id: 0,
        totalEvents: 1,
        pageViews: 1,
        clicks: 1,
        totalSessions: { $size: '$sessions' },
        uniquePages: { $size: '$pages' },
      },
    },
  ]);

  const summary = totals[0] || { totalEvents: 0, pageViews: 0, clicks: 0, totalSessions: 0, uniquePages: 0 };
  const clickThroughRate = summary.pageViews > 0 ? (summary.clicks / summary.pageViews) * 100 : 0;

  return {
    ...summary,
    clickThroughRate,
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
