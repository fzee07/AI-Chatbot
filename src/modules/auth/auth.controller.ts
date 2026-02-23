// ============================================================
// Auth Controller — HTTP Request Handlers
// ============================================================
// This is the CONTROLLER LAYER — it handles the HTTP lifecycle:
//   1. Extract data from the request body
//   2. Validate the input (basic checks)
//   3. Call the service layer (business logic)
//   4. Send the HTTP response with appropriate status code
//
// ARCHITECTURE PATTERN (MVC-ish):
//   Route → Controller → Service → Model → Database
//
//   Routes:      Define URL patterns (POST /register, POST /login)
//   Controller:  Handle HTTP (req/res), validate input, call service
//   Service:     Business logic (create user, verify password, generate token)
//   Model:       Database schema and data operations
//
// HTTP STATUS CODES USED:
//   200 = OK (login successful)
//   201 = Created (new user registered)
//   400 = Bad Request (missing fields)
//   401 = Unauthorized (wrong password)
//   409 = Conflict (email already exists)
//   500 = Internal Server Error (unexpected failures)
// ============================================================

import { Request, Response } from "express";
import * as authService from "./auth.service";

// ── Register Handler ────────────────────────────────────────

/**
 * POST /api/auth/register
 *
 * Request body: { name: "John", email: "john@example.com", password: "123456" }
 * Success response (201): { success: true, data: { user, token } }
 * Error responses: 400 (missing fields), 409 (email exists), 500 (server error)
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract fields from request body (sent as JSON by the client)
    const { name, email, password } = req.body;

    // Basic validation — check that all required fields are provided
    // More complex validation (email format, password strength) could use a library like Joi or Zod
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: "Please provide name, email and password" });
      return;
    }

    // Delegate to service layer — controller doesn't know HOW registration works
    const result = await authService.register({ name, email, password });

    // 201 = "Created" — standard response when a new resource is created
    res.status(201).json({ success: true, message: "User registered successfully", data: result });
  } catch (error: any) {
    // Map known error messages to specific HTTP status codes
    // "Email already registered" → 409 (Conflict)
    // Anything else → 500 (Server Error)
    const statusCode = error.message === "Email already registered" ? 409 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// ── Login Handler ───────────────────────────────────────────

/**
 * POST /api/auth/login
 *
 * Request body: { email: "john@example.com", password: "123456" }
 * Success response (200): { success: true, data: { user, token } }
 * Error responses: 400 (missing fields), 401 (invalid credentials), 500 (server error)
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: "Please provide email and password" });
      return;
    }

    const result = await authService.login({ email, password });
    res.status(200).json({ success: true, message: "Login successful", data: result });
  } catch (error: any) {
    // "Invalid email or password" → 401 (Unauthorized)
    const statusCode = error.message === "Invalid email or password" ? 401 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};
