
import { RequestHandler } from "express";

export const requireUserContext: RequestHandler = (req, res, next): void => {
  const userId = req.header("x-user-id");
  if (!userId) {
    res.status(401).json({ message: "User context required" });
    return;
  }
  next();
};