import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import connectDB from "./config/db";
import authRoutes from "./modules/auth/auth.routes";
import chatRoutes from "./modules/chat/chat.routes";
import { authLimiter } from "./middlewares/rateLimiter";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/chat", chatRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "AI Chatbot with Memory API is running",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();
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

startServer();

export default app;
