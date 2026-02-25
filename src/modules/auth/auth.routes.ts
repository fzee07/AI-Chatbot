// ============================================================
// Auth Routes — URL-to-Handler Mapping
// ============================================================
// This file defines WHICH URLs trigger WHICH controller functions.
// It's the entry point for all authentication-related HTTP requests.
//
// ROUTE DEFINITIONS:
//   POST /api/auth/register → authController.register
//   POST /api/auth/login    → authController.login
//
// HOW ROUTES WORK IN EXPRESS:
//   1. Client sends: POST http://localhost:3000/api/auth/register
//   2. app.ts has: app.use("/api/auth", authRoutes)
//      → Express strips "/api/auth" and passes "/register" to this router
//   3. This router matches: router.post("/register", ...)
//      → Calls authController.register()
//
// WHY SEPARATE ROUTE FILES?
//   - Each module (auth, chat) owns its own routes
//   - Easy to add middleware per-module (rate limiting, auth checks)
//   - Clean separation: routes know URLs, controllers know logic
//
// NOTE: Rate limiting is applied at the app.ts level:
//   app.use("/api/auth", authLimiter, authRoutes)
//   This means ALL auth routes are rate limited (10 attempts/15 min)
// ============================================================

import { Router } from "express";
import * as authController from "./auth.controller.js";

const router = Router();

// POST /api/auth/register — Create a new user account
router.post("/register", authController.register);

// POST /api/auth/login — Authenticate and get a JWT token
router.post("/login", authController.login);

export default router;
