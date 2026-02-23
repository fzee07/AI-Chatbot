import { Router } from "express";
import * as chatController from "./chat.controller";
import { protect } from "../../middlewares/auth";
import { chatLimiter } from "../../middlewares/rateLimiter";

const router = Router();

// All chat routes require authentication
router.use(protect);

// Conversation CRUD
router.post("/conversations", chatController.createConversation);
router.get("/conversations", chatController.getConversations);
router.get("/conversations/:id", chatController.getConversation);
router.delete("/conversations/:id", chatController.deleteConversation);

// Messages
router.get("/conversations/:id/messages", chatController.getMessages);

// Send message (with rate limiting)
// POST body: { message: "hello", stream: true/false }
router.post(
  "/conversations/:id/messages",
  chatLimiter,
  chatController.sendMessage
);

export default router;
