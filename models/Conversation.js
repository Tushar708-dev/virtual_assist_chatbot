const mongoose = require("mongoose");

/**
 * Message sub-document: one turn of the conversation (user query + bot reply)
 * Kept flat inside Conversation doc so a whole session can be fetched in ONE query
 * instead of N queries — this is the "optimized schema design for fast retrieval"
 * mentioned in the resume bullet.
 */
const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, enum: ["user", "bot"], required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    intent: { type: String, default: null }, // detected intent, e.g. "greeting", "weather"
    confidence: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true, // fast lookup of a user's session history
    },
    userId: {
      type: String,
      default: "guest", // supports anonymous usage; swap for real auth ObjectId later
      index: true,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    lastActivity: {
      type: Date,
      default: Date.now,
      index: true, // supports TTL / cleanup queries and "recent sessions" sort
    },
  },
  { timestamps: true }
);

// Compound index: most common query pattern is "get latest sessions for a user"
conversationSchema.index({ userId: 1, lastActivity: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
