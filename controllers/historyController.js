const Conversation = require("../models/Conversation");

/**
 * GET /api/history/:sessionId
 * Fast retrieval by indexed sessionId field. Returns messages in order.
 */
const getHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const conversation = await Conversation.findOne(
      { sessionId },
      { messages: 1, _id: 0 } // projection keeps payload lean
    ).lean();

    return res.status(200).json({ messages: conversation ? conversation.messages : [] });
  } catch (err) {
    console.error("getHistory error:", err.message);
    return res.status(500).json({ error: "Could not fetch history." });
  }
};

/**
 * GET /api/history/user/:userId/sessions
 * Uses the compound { userId, lastActivity } index for a fast "recent
 * sessions" listing — useful for a sidebar of past chats.
 */
const getUserSessions = async (req, res) => {
  try {
    const { userId } = req.params;
    const sessions = await Conversation.find(
      { userId },
      { sessionId: 1, lastActivity: 1, messages: { $slice: -1 }, _id: 0 }
    )
      .sort({ lastActivity: -1 })
      .limit(20)
      .lean();

    return res.status(200).json({ sessions });
  } catch (err) {
    console.error("getUserSessions error:", err.message);
    return res.status(500).json({ error: "Could not fetch sessions." });
  }
};

/**
 * DELETE /api/history/:sessionId
 */
const clearHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    await Conversation.deleteOne({ sessionId });
    return res.status(200).json({ message: "Session cleared." });
  } catch (err) {
    console.error("clearHistory error:", err.message);
    return res.status(500).json({ error: "Could not clear history." });
  }
};

module.exports = { getHistory, getUserSessions, clearHistory };
