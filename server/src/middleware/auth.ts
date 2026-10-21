
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: number;
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    return res.status(500).json({
      error: "Authentication is not configured",
    });
  }

  try {
    const payload = jwt.verify(token, secret);

    if (
      typeof payload === "string" ||
      !payload.sub ||
      !/^\d+$/.test(payload.sub)
    ) {
      return res.status(401).json({
        error: "Invalid token",
      });
    }

    req.userId = Number(payload.sub);
    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
}
