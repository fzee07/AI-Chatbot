import { Response } from "express";
import * as chatService from "./chat.service";
import {
  AuthRequest,
  CreateConversationBody,
  SendMessageBody,
} from "../../types";

// ── Conversation CRUD ──────────────────────────────────────

export const createConversation = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { title, chatRole } = req.body as CreateConversationBody;
    const conversation = await chatService.createConversation(
      req.user!._id.toString(),
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

export const getConversation = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const conversation = await chatService.getConversationById(
      req.params.id as string,
      req.user!._id.toString()
    );

    res.status(200).json({ success: true, data: conversation });
  } catch (error: any) {
    const statusCode =
      error.message === "Conversation not found" ? 404 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

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

// ── Send Message (supports both streaming and non-streaming) ──

export const sendMessage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { message, stream } = req.body as SendMessageBody;

    if (!message || message.trim().length === 0) {
      res
        .status(400)
        .json({ success: false, message: "Message cannot be empty" });
      return;
    }

    const conversationId = req.params.id as string;
    const userId = req.user!._id.toString();

    // If stream=true, use SSE streaming response
    if (stream) {
      await chatService.sendMessageStream(
        conversationId,
        userId,
        message,
        res
      );
      return;
    }

    // Non-streaming response — normal JSON
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
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`
      );
      res.end();
      return;
    }

    const statusCode =
      error.message === "Conversation not found" ? 404 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};
