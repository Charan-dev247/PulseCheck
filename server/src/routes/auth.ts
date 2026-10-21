
import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db/pool";

const router = Router();

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
});

const loginSchema = registerSchema;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured securely");
  }
  return secret;
}

router.post(
  "/register",
  async (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Enter a valid email and a password of 8–72 characters.",
      });
    }

    const email = parsed.data.email.toLowerCase();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    try {
      const result = await pool.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, created_at`,
        [email, passwordHash]
      );

      return res.status(201).json({
        message: "Account created successfully",
        user: result.rows[0],
      });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: "An account with this email already exists.",
        });
      }

      console.error("Registration failed:", error);
      return res.status(500).json({
        error: "Unable to create account.",
      });
    }
  }
);

router.post(
  "/login",
  async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Enter a valid email and password.",
      });
    }

    try {
      const email = parsed.data.email.toLowerCase();

      const result = await pool.query(
        `SELECT id, email, password_hash
         FROM users
         WHERE email = $1`,
        [email]
      );

      const user = result.rows[0];

      if (
        !user ||
        !(await bcrypt.compare(parsed.data.password, user.password_hash))
      ) {
        return res.status(401).json({
          error: "Invalid email or password.",
        });
      }

      const token = jwt.sign(
        { email: user.email },
        getJwtSecret(),
        {
          subject: String(user.id),
          expiresIn: "2h",
        }
      );

      return res.json({
        message: "Login successful",
        token,
        expiresIn: "2h",
        user: { id: user.id, email: user.email },
      });
    } catch (error) {
      console.error("Login failed:", error);
      return res.status(500).json({
        error: "Unable to log in.",
      });
    }
  }
);

export default router;
