// ============================================================
// MongoDB Database Connection
// ============================================================
// MongoDB is a NoSQL database — it stores data as JSON-like
// "documents" instead of rows/columns like SQL databases.
//
// WHY MONGODB FOR A CHATBOT?
//   - Messages are naturally document-shaped (role, content, timestamp)
//   - No rigid schema needed — conversations can have varying fields
//   - Great for rapid prototyping and iterating on data models
//   - Mongoose ODM gives us schema validation + TypeScript support
//
// CONNECTION FLOW:
//   1. App starts → calls connectDB()
//   2. Mongoose connects to MongoDB using the URI from .env
//   3. If connection fails → app exits (can't work without DB)
//   4. If successful → app starts listening for requests
//
// MONGODB_URI FORMAT:
//   Local:  mongodb://localhost:27017/ai-chatbot-memory
//   Docker: mongodb://mongo:27017/ai-chatbot-memory  (uses container name)
//   Atlas:  mongodb+srv://user:pass@cluster.mongodb.net/dbname
// ============================================================

import mongoose from "mongoose";

// Cache the connection promise so we don't reconnect on every serverless invocation
let cached: Promise<typeof mongoose> | null = null;

/**
 * Connect to MongoDB using the URI from environment variables.
 *
 * Uses a cached promise so that:
 * - On local: connects once at startup
 * - On Vercel serverless: reuses the connection across warm invocations
 *   and only reconnects on cold starts
 *
 * Does NOT call process.exit() — on Vercel that would kill the function.
 * Instead, it throws so the request gets a proper error response.
 */
const connectDB = async (): Promise<void> => {
  // Already connected — skip
  if (mongoose.connection.readyState === 1) return;

  if (!cached) {
    cached = mongoose.connect(process.env.MONGODB_URI as string);
  }

  try {
    const conn = await cached;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    cached = null; // Reset so next call retries
    console.error(`MongoDB Connection Error: ${error.message}`);

    // On Vercel, don't kill the process — let the request fail gracefully
    if (process.env.VERCEL) {
      throw error;
    }
    // Locally, exit since the app is useless without a DB
    process.exit(1);
  }
};

export default connectDB;
