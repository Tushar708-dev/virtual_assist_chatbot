const express = require("express");
const router = express.Router();
const {
  getHistory,
  getUserSessions,
  clearHistory,
} = require("../controllers/historyController");

router.get("/user/:userId/sessions", getUserSessions);
router.get("/:sessionId", getHistory);
router.delete("/:sessionId", clearHistory);

module.exports = router;
