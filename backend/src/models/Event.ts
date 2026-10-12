import { Schema, model } from 'mongoose';

const eventSchema = new Schema(
  {
    eventId: { type: String, required: false },
    websiteId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    eventType: {
      type: String,
      enum: ['page_view', 'click'],
      required: true,
      index: true,
    },
    pageUrl: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    clickX: { type: Number, min: 0 },
    clickY: { type: Number, min: 0 },
    viewportWidth: { type: Number, min: 0 },
    viewportHeight: { type: Number, min: 0 },
    documentWidth: { type: Number, min: 0 },
    documentHeight: { type: Number, min: 0 },
    scrollX: { type: Number, min: 0 },
    scrollY: { type: Number, min: 0 },
    devicePixelRatio: { type: Number, min: 0 },
    coordinateMode: { type: String, enum: ['document'] },
    pageTitle: { type: String, maxlength: 200 },
    elementTag: { type: String, maxlength: 50 },
    elementId: { type: String, maxlength: 200 },
  },
  {
    timestamps: true,
  },
);

eventSchema.index({ websiteId: 1, sessionId: 1, timestamp: 1 });
eventSchema.index({ websiteId: 1, pageUrl: 1, eventType: 1, timestamp: -1 });
eventSchema.index({ websiteId: 1, pageUrl: 1, eventType: 1, viewportWidth: 1, viewportHeight: 1, timestamp: -1 });
eventSchema.index({ websiteId: 1, eventType: 1, timestamp: -1 });
eventSchema.index(
  { websiteId: 1, eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: 'string' } } },
);

export const EventModel = model('Event', eventSchema);
