
import { Request, Response } from "express";
import User from "../models/model.user";
import UserBio from "../models/model.userbio";

// Allowed fields for bio create/update (avoids passing invalid or unsafe keys)
const BIO_FIELDS = [
  "birthday", "showBirthday", "pronouns", "showPronouns",
  "userVibe", "othersVibe", "eventInterests", "availability", "purpose",
  "bio", "profilePicture",
] as const;

/** Normalize birthday to YYYY-MM-DD or null. Accepts { day, month, year } or "YYYY-MM-DD". */
function normalizeBirthday(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;
    const [, y, m, d] = match;
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (typeof value === "object" && "day" in value && "month" in value && "year" in value) {
    const o = value as { day: number; month: number; year: number };
    const { day, month, year } = o;
    if (
      typeof day !== "number" || typeof month !== "number" || typeof year !== "number" ||
      month < 1 || month > 12 || day < 1 || day > 31 ||
      year < 1900 || year > 2100
    ) return null;
    const y = String(year);
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

function pickBioUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const key of BIO_FIELDS) {
    if (body[key] === undefined) continue;
    if (key === "birthday") {
      updates[key] = normalizeBirthday(body[key]);
      continue;
    }
    updates[key] = body[key];
  }
  return updates;
}

// POST /api/v1/user/:id/bio — upsert: create if no bio, update if bio exists (so submit always succeeds)
export const createUserBio = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = pickBioUpdates(req.body);

    const user = await User.findByPk(id);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const existingBio = await UserBio.findOne({ where: { userId: id } });

    if (existingBio) {
      await existingBio.update(updates);
      res.status(200).json({ message: "User bio updated successfully", userBio: existingBio });
      return;
    }

    const newUserBio = await UserBio.create({
      userId: Number(id),
      ...updates,
    });

    res
      .status(201)
      .json({ message: "UserBio created successfully", userBio: newUserBio });
  } catch (error) {
    console.error("Error creating/updating user bio:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// PATCH /api/v1/user/:id/bio
export const updateUserBio = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = pickBioUpdates(req.body);

    const user = await User.findByPk(id);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const userBio = await UserBio.findOne({ where: { userId: id } });
    if (!userBio) {
      res.status(404).json({ message: "User bio not found" });
      return;
    }

    await userBio.update(updates);
    res.status(200).json({ message: "User bio updated successfully", userBio });
  } catch (error) {
    console.error("Error updating user bio:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// GET /api/v1/user/:id/bio
export const getUserBio = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  try {
    const user = await User.findOne({
      where: { id: Number(id) },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const userBio = await UserBio.findOne({
      where: { userId: Number(user?.id) },
    });

    if (!userBio) {
      res.status(404).json({ message: "userBio not found" });
      return;
    }

    res.status(200).json(userBio);
  } catch (error) {
    console.error("Error fetching user bio:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// POST /api/v1/user/:id/profile-picture
export const uploadProfilePicture = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params; // userId from URL
    const {
      profilePicture,
    } = req.body;

    // 1. Check if user exists
    const user = await User.findByPk(id);

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // 2. Check if Profile Picture already exists (optional but good)
    const existingProfilePicture = await UserBio.findAll({ where: { userId: id } });

    if (existingProfilePicture) {
      res.status(400).json({ message: "Profile Picture already exists" });
      return;
    }

    // 3. Create UserBio
    const newProfilePicture = await UserBio.create({
      userId: Number(id),
      profilePicture,
    });

    res
      .status(201)
      .json({ message: "Profile Picture created successfully", profilePicture: newProfilePicture });
  } catch (error) {
    console.error("Error creating user bio:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//GET /api/v1/user/:id/profile-picture
export const getProfilePicture = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
  const profilePicture = await UserBio.findAll({ where: { userId: id } });
  if (!profilePicture) {
    res.status(404).json({ message: "Profile Picture not found" });
    return;
  }
  res.status(200).json(profilePicture);
  } catch (error) {
    console.error("Error fetching profile picture:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// DELETE /api/v1/user/:id/profile-picture
export const deleteProfilePicture = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await User.findByPk(id);
    if (!existingUser) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Delete user
    await existingUser.destroy();

    // Delete User Bio
     const userBio = await UserBio.findOne({
          where: { userId: Number(existingUser?.id) },
      });
    
    //Delete userbio if available
    userBio?.destroy();

    res.status(200).json({ message: 'Profile Picture deleted successfully' });
  } catch (error) {
    console.error('Failed to delete profile picture:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

