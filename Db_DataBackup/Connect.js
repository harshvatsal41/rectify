const mongoose = require("mongoose");

// credentials
const DB_USERNAME = "harsh";
const DB_PASSWORD = "xgKoHwf9rLhgVrL8";
const MONGODB_URI = `mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@cluster0.scbj5.mongodb.net/live_v_15_04_2026?retryWrites=true&w=majority&appName=Cluster0`;

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log("✅ Using existing MongoDB connection");
    return;
  }

  try {
    const conn = await mongoose.connect(MONGODB_URI); // ✅ FIXED

    isConnected = conn.connections[0].readyState;
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;