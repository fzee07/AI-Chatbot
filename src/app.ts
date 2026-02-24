// ============================================================
// App Entry Point — Express Server Setup
// ============================================================
// This is where EVERYTHING starts. When you run `npm run dev`,
// Node.js executes this file first. It:
//
//   1. Loads environment variables from .env file
//   2. Creates an Express server
//   3. Configures middleware (CORS, JSON parsing)
//   4. Registers route handlers (auth, chat)
//   5. Connects to MongoDB
//   6. Starts listening for HTTP requests
//
// WHAT IS EXPRESS?
//   A web framework for Node.js that handles HTTP requests.
//   Without Express, you'd need to manually parse URLs, headers,
//   request bodies, etc. Express does all that for you.
//
// WHAT IS MIDDLEWARE?
//   Functions that run BEFORE your route handlers.
//   Each request flows through middleware like a pipeline:
//   Request → [CORS] → [JSON Parser] → [Auth] → [Route Handler] → Response
//
// STARTUP ORDER (important!):
//   1. dotenv.config() MUST be first — other imports need env vars
//   2. Middleware setup (CORS, body parsing)
//   3. Route registration
//   4. Connect to MongoDB
//   5. Start listening on port
//   We connect to DB BEFORE starting the server because
//   we don't want to accept requests without a working database.
// ============================================================

// Load environment variables from .env file into process.env
// MUST be the first thing that runs — other imports depend on these values
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import connectDB from "./config/db";
import authRoutes from "./modules/auth/auth.routes";
import chatRoutes from "./modules/chat/chat.routes";
import { authLimiter } from "./middlewares/rateLimiter";

// Create the Express application instance
const app = express();

// ── Global Middleware ────────────────────────────────────────

// CORS (Cross-Origin Resource Sharing)
// Only allows requests from origins listed in ALLOWED_ORIGINS env var
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// JSON body parser — parses incoming JSON request bodies
// limit: "10mb" allows larger payloads (default is 100kb)
// After this middleware, you can access req.body as a JavaScript object
app.use(express.json({ limit: "10mb" }));

// URL-encoded parser — parses form data (application/x-www-form-urlencoded)
// extended: true allows nested objects in form data
app.use(express.urlencoded({ extended: true }));

// ── Route Registration ──────────────────────────────────────
// app.use(path, middleware, router) mounts a router at a URL prefix
// All routes in authRoutes will be prefixed with "/api/auth"
// All routes in chatRoutes will be prefixed with "/api/chat"

// Auth routes: /api/auth/register, /api/auth/login
// authLimiter is applied to ALL auth routes (prevents brute force)
app.use("/api/auth", authLimiter, authRoutes);

// Chat routes: /api/chat/conversations, /api/chat/conversations/:id/messages, etc.
// Authentication (protect middleware) is applied inside chatRoutes
app.use("/api/chat", chatRoutes);

// ── Health Check Endpoint ───────────────────────────────────
// A simple endpoint to verify the server is running.
// Used by: monitoring tools, load balancers, Docker health checks, CI/CD pipelines
// Convention: /health or /api/health returns 200 if the server is alive
app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "AI Chatbot with Memory API is running",
    timestamp: new Date().toISOString(),
  });
});

// ── 404 Handler (Catch-All) ─────────────────────────────────
// If no route matches the request URL, this middleware handles it.
// MUST be registered LAST — after all other routes.
// Without this, Express would return a default HTML 404 page.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ── Start the Server ────────────────────────────────────────

const PORT = process.env.PORT || 3000;

/**
 * Initialize the application:
 * 1. Connect to MongoDB (await — must succeed before accepting requests)
 * 2. Start the Express server on the specified port
 *
 * If MongoDB connection fails, connectDB() calls process.exit(1)
 * and the server never starts — this is intentional.
 */
// Connect to MongoDB — needed for both local and Vercel serverless
// On Vercel, this runs once per cold start; on local, it runs at startup
connectDB();

const startServer = async () => {
  // Start listening for HTTP requests
  app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════╗
    ║   AI Chatbot with Memory API             ║
    ║   Running on: http://localhost:${PORT}      ║
    ║   Environment: ${process.env.NODE_ENV}               ║
    ║   AI Provider: Google Gemini             ║
    ╚══════════════════════════════════════════╝
    `);
  });
};

// Only start the HTTP server when NOT running on Vercel (serverless)
// Vercel imports the app directly — it doesn't need app.listen()
if (!process.env.VERCEL) {
  startServer();
}

// Export the app instance (used by Vercel serverless + testing with supertest)
export default app;
