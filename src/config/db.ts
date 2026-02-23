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

/**
 * Connect to MongoDB using the URI from environment variables.
 *
 * This function is called once when the server starts (in app.ts).
 * If the connection fails, the process exits with code 1 because
 * the app cannot function without a database.
 */
const connectDB = async (): Promise<void> => {
  try {
    // mongoose.connect() returns a connection object with useful info
    // We use `as string` because TypeScript doesn't know .env values exist at compile time
    const conn = await mongoose.connect(process.env.MONGODB_URI as string);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    // process.exit(1) = exit with failure code
    // We exit because without a DB, the app is useless
    process.exit(1);
  }
};

export default connectDB;
