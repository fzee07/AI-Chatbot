// ============================================================
// Chat Controller — HTTP Request Handlers
// ============================================================
// This controller handles ALL chat-related HTTP requests.
// It follows the same pattern as auth.controller.ts:
//   1. Extract data from request (params, body, user)
//   2. Call the service layer
//   3. Send appropriate HTTP response
//
// IMPORTANT CONCEPTS:
//
// req.user — Set by the auth middleware (protect)
//   Every chat route requires authentication. The protect middleware
//   decodes the JWT token and attaches the user to req.user.
//   We use req.user!._id to know WHO is making the request.
//   The "!" is TypeScript's non-null assertion (we know user exists
//   because protect middleware would have rejected the request otherwise).
//
// req.params.id — The conversation ID from the URL
//   For routes like /conversations/:id, Express extracts ":id"
//   and puts it in req.params.id.
//
// STREAMING vs NON-STREAMING (sendMessage):
//   The sendMessage handler supports BOTH modes based on the request body:
//   - { stream: false } → Returns normal JSON response
//   - { stream: true }  → Returns SSE event stream
//
//   This is a clean API design — one endpoint, two behaviors.
//   The client decides which mode to use.
//
// ERROR HANDLING WITH SSE:
//   When streaming, we can't send a normal JSON error response because
//   the SSE headers are already sent (res.headersSent = true).
//   Instead, we send the error AS an SSE event:
//   data: {"type":"error","message":"Something went wrong"}\n\n
// ============================================================

import { Response } from "express";
import * as chatService from "./chat.service";
import {
  AuthRequest,
  CreateConversationBody,
  SendMessageBody,
} from "../../types";

// ── Conversation CRUD Handlers ───────────────────────────────

/**
 * POST /api/chat/conversations
 * Create a new conversation with optional title and chatRole.
 *
 * Request body: { title?: "My Chat", chatRole?: "coder" }
 * Response (201): { success: true, data: conversation }
 */
export const createConversation = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { title, chatRole } = req.body as CreateConversationBody;
    const conversation = await chatService.createConversation(
      req.user!._id.toString(), // The authenticated user's ID
      title,
      chatRole
    );

    res.status(201).json({
      success: true,
      message: "Conversation created",
      data: conversation,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/chat/conversations
 * List all conversations for the authenticated user.
 * Sorted by most recent activity (handled by the service layer).
 *
 * Response (200): { success: true, count: 5, data: [...conversations] }
 */
export const getConversations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const conversations = await chatService.getUserConversations(
      req.user!._id.toString()
    );

    res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/chat/conversations/:id
 * Get a single conversation by ID (with ownership verification).
 *
 * Response (200): { success: true, data: conversation }
 * Response (404): { success: false, message: "Conversation not found" }
 */
export const getConversation = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const conversation = await chatService.getConversationById(
      req.params.id as string, // :id from URL
      req.user!._id.toString()
    );

    res.status(200).json({ success: true, data: conversation });
  } catch (error: any) {
    // Map "Conversation not found" to 404, everything else to 500
    const statusCode =
      error.message === "Conversation not found" ? 404 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/chat/conversations/:id
 * Delete a conversation and all its messages.
 *
 * Response (200): { success: true, message: "Conversation deleted" }
 * Response (404): { success: false, message: "Conversation not found" }
 */
export const deleteConversation = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    await chatService.deleteConversation(
      req.params.id as string,
      req.user!._id.toString()
    );

    res
      .status(200)
      .json({ success: true, message: "Conversation deleted" });
  } catch (error: any) {
    const statusCode =
      error.message === "Conversation not found" ? 404 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/chat/conversations/:id/messages
 * Get all messages in a conversation (for loading chat history).
 *
 * Response (200): { success: true, count: 15, data: [...messages] }
 */
export const getMessages = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const messages = await chatService.getConversationMessages(
      req.params.id as string,
      req.user!._id.toString()
    );

    res
      .status(200)
      .json({ success: true, count: messages.length, data: messages });
  } catch (error: any) {
    const statusCode =
      error.message === "Conversation not found" ? 404 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// ── Send Message Handler ─────────────────────────────────────

/**
 * POST /api/chat/conversations/:id/messages
 * Send a message to the AI and get a response.
 *
 * This is the MAIN endpoint — where users actually chat with the AI.
 * Supports both streaming (SSE) and non-streaming (JSON) responses.
 *
 * Request body: { message: "Hello!", stream: true }
 *
 * If stream=true:  Response is an SSE event stream (text/event-stream)
 * If stream=false: Response is JSON with both user and AI messages
 *
 * RATE LIMITED: Max 20 messages per minute (chatLimiter middleware)
 */
export const sendMessage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { message, stream } = req.body as SendMessageBody;

    // Validate: don't send empty messages to the AI (wastes API calls)
    if (!message || message.trim().length === 0) {
      res
        .status(400)
        .json({ success: false, message: "Message cannot be empty" });
      return;
    }

    const conversationId = req.params.id as string;
    const userId = req.user!._id.toString();

    // ── STREAMING MODE ──
    // If stream=true, switch to SSE — the service handles res.write() directly
    if (stream) {
      await chatService.sendMessageStream(
        conversationId,
        userId,
        message,
        res // Pass the response object so the service can stream to it
      );
      return; // Don't send any more responses — the service handles everything
    }

    // ── NON-STREAMING MODE ──
    // Wait for the full AI response, then send as JSON
    const result = await chatService.sendMessage(
      conversationId,
      userId,
      message
    );

    res.status(200).json({
      success: true,
      data: {
        userMessage: {
          id: result.userMsg._id,
          role: result.userMsg.role,
          content: result.userMsg.content,
        },
        aiMessage: {
          id: result.aiMsg._id,
          role: result.aiMsg.role,
          content: result.aiMsg.content,
        },
      },
    });
  } catch (error: any) {
    // SPECIAL CASE: If headers were already sent (streaming mode started),
    // we can't send a normal JSON error. Send it as an SSE event instead.
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`
      );
      res.end();
      return;
    }

    // Normal error handling for non-streaming mode
    const statusCode =
      error.message === "Conversation not found" ? 404 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};
