const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ai_assistant";
    const conn = await mongoose.connect(uri, {
      // modern mongoose (>=6) doesn't need useNewUrlParser/useUnifiedTopology
      // but kept structure here in case of older driver compatibility needs
    });
    console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    // Retry after 5s instead of crashing immediately — useful in dev/docker-compose setups
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
