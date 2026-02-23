// ============================================================
// Chat Routes — URL-to-Handler Mapping
// ============================================================
// This file defines ALL chat-related API endpoints.
//
// ROUTE DEFINITIONS:
//   POST   /api/chat/conversations              → Create conversation
//   GET    /api/chat/conversations              → List all conversations
//   GET    /api/chat/conversations/:id          → Get single conversation
//   DELETE /api/chat/conversations/:id          → Delete conversation
//   GET    /api/chat/conversations/:id/messages → Get all messages
//   POST   /api/chat/conversations/:id/messages → Send message to AI
//
// MIDDLEWARE CHAIN:
//   Every request goes through:
//   1. protect (auth middleware) → Verify JWT token, attach user
//   2. chatLimiter (rate limiter) → Only on POST messages (20/min)
//   3. controller → Handle the request
//
// router.use(protect) applies the auth middleware to ALL routes
// in this router. This means every chat endpoint requires a valid JWT.
//
// WHY RATE LIMIT ONLY THE SEND MESSAGE ROUTE?
//   Sending messages triggers Gemini API calls (costs money).
//   Listing conversations or reading messages are just DB reads (free).
//   We only rate-limit the expensive operation.
//
// RESTful DESIGN:
//   This follows REST conventions:
//   - Nouns in URLs (conversations, messages), not verbs
//   - HTTP methods define the action (GET=read, POST=create, DELETE=remove)
//   - Nested resources: /conversations/:id/messages (messages belong to conversation)
// ============================================================

import { Router } from "express";
import * as chatController from "./chat.controller";
import { protect } from "../../middlewares/auth";
import { chatLimiter } from "../../middlewares/rateLimiter";

const router = Router();

// Apply authentication middleware to ALL chat routes
// This means: no valid JWT token = no access to any chat endpoint
router.use(protect);

// ── Conversation CRUD ───────────────────────────────────────
router.post("/conversations", chatController.createConversation); // Create new conversation
router.get("/conversations", chatController.getConversations); // List all conversations
router.get("/conversations/:id", chatController.getConversation); // Get single conversation
router.delete("/conversations/:id", chatController.deleteConversation); // Delete conversation

// ── Messages ────────────────────────────────────────────────
router.get("/conversations/:id/messages", chatController.getMessages); // Get chat history

// Send message to AI (with rate limiting to protect API budget)
// POST body: { message: "hello", stream: true/false }
router.post(
  "/conversations/:id/messages",
  chatLimiter, // Rate limit: max 20 messages per minute
  chatController.sendMessage
);

export default router;
