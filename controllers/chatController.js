const Conversation = require("../models/Conversation");
const { processQuery } = require("../services/nlpService");

/**
 * POST /api/chat
 * body: { sessionId, userId?, message }
 * - Runs NLP intent detection on the message
 * - Persists both the user message and bot reply into the session document
 * - Returns the bot reply + detected intent so the frontend can render it
 */
const handleChat = async (req, res) => {
  try {
    const { sessionId, userId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: "sessionId and message are required." });
    }

    const { intent, confidence, reply } = processQuery(message);

    const userTurn = { sender: "user", text: message, intent, confidence };
    const botTurn = { sender: "bot", text: reply, intent, confidence };

    // upsert: create the session doc on first message, otherwise push to it
    const conversation = await Conversation.findOneAndUpdate(
      { sessionId },
      {
        $push: { messages: { $each: [userTurn, botTurn] } },
        $set: { lastActivity: new Date(), userId: userId || "guest" },
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      reply,
      intent,
      confidence,
      sessionId: conversation.sessionId,
      messageCount: conversation.messages.length,
    });
  } catch (err) {
    console.error("handleChat error:", err.message);
    return res.status(500).json({ error: "Something went wrong processing your message." });
  }
};

module.exports = { handleChat };
