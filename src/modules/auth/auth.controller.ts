import { Request, Response } from "express";
import * as authService from "./auth.service";

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: "Please provide name, email and password" });
      return;
    }

    const result = await authService.register({ name, email, password });
    res.status(201).json({ success: true, message: "User registered successfully", data: result });
  } catch (error: any) {
    const statusCode = error.message === "Email already registered" ? 409 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

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
    const statusCode = error.message === "Invalid email or password" ? 401 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};
