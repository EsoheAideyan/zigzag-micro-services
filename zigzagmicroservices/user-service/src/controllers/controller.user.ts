import dotenv from "dotenv";
dotenv.config();

import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/model.user'
import UserBio from "../models/model.userbio";
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';


const JWT_SECRET_ACCESS_TOKEN = process.env.JWT_SECRET_ACCESS_TOKEN;
const JWT_SECRET_REFRESH_TOKEN = process.env.JWT_SECRET_REFRESH_TOKEN;
if (!JWT_SECRET_ACCESS_TOKEN || !JWT_SECRET_REFRESH_TOKEN) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

// POST /api/v1/user/signup
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, username, email, password, accountType } = req.body;

    // Check if the user already exists
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      res.status(400).json({ message: 'Email already in use' });
      return;
    }

    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      res.status(400).json({ message: 'Username already in use' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password,10)
    // Create a new user
    const newUser = new User({
      name,
      username,
      email,
      password:hashedPassword,
      accountType,
    });

    // Save the user to the database
    await newUser.save();

    //Create a JWT token if login is successful
    const payload = {
      userId: newUser.id
    };

    const accessToken = jwt.sign(payload, JWT_SECRET_ACCESS_TOKEN, {
      expiresIn: "1d",
    });

    const refreshToken = jwt.sign(payload, JWT_SECRET_REFRESH_TOKEN , {
      expiresIn: '30d', 
    });

    // dummy login response
    res.status(200).json({ payload, accessToken, refreshToken, message: 'Logged in!' });
  } catch (error) {
    res.status(500).json({ "message": error });
  }
};

// POST /api/v1/user/login
export const login = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password } = req.body;

    const existingUser = await User.findOne({ where: { email } })
    if (!existingUser) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, existingUser.password);
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    //Create a JWT token if login is successful
    const payload = {
      email: email,
      userId: existingUser?.id
    };

    const accessToken = jwt.sign(payload, JWT_SECRET_ACCESS_TOKEN, {
      expiresIn: "1d",
    });

    const refreshToken = jwt.sign(payload, JWT_SECRET_REFRESH_TOKEN , {
      expiresIn: '30d', 
    });

    // dummy login response
    res.status(200).json({ payload, accessToken, refreshToken, message: 'Logged in!' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/v1/user/:id
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
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

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


// GET /api/v1/user/:id
export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
try {
  const { id } = req.params;

  const user = await User.findByPk(id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  res.status(200).json({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    accountType: user.accountType,
    createdAt: user.createdAt
  });
} catch (error) {
  console.error('Failed to get user profile:', error);
  res.status(500).json({ message: 'Internal server error' });
}
};

// PATCH /api/v1/user/:id
export const updateUserInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, username, email } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    await user.update({ name, username, email });
    res.status(200).json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Failed to update user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Configure multer for profile picture uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// POST /api/v1/user/:id/profile-picture
export const uploadProfilePicture = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = Number(id);

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Check if file was uploaded
    if (!req.file) {
      res.status(400).json({ message: 'No profile picture file provided' });
      return;
    }

    // Prepare file data for media service
    const fileName = `profile-${userId}-${uuidv4()}.jpg`;
    const fileBuffer = req.file.buffer;
    const fileSize = req.file.size;
    const contentType = req.file.mimetype;

    // Upload to media service
    const mediaServiceUrl = process.env.MEDIA_SERVICE_URL || 'http://media-service:3032';
    
    try {
      // Create form data for media service
      const formData = new FormData();
      formData.append('file', new Blob([fileBuffer], { type: contentType }), fileName);

      const mediaResponse = await axios.post(`${mediaServiceUrl}/api/v1/media/upload-media`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 second timeout
      });

      if (mediaResponse.status !== 201) {
        throw new Error('Media service upload failed');
      }

      const imageUrl = mediaResponse.data.url;

      // Update or create user bio with profile picture
      let userBio = await UserBio.findOne({ where: { userId } });
      
      if (userBio) {
        // Update existing bio
        const currentPictures = userBio.profilePicture || [];
        userBio.profilePicture = [...currentPictures, imageUrl];
        await userBio.save();
      } else {
        // Create new bio with profile picture
        userBio = await UserBio.create({
          userId,
          profilePicture: [imageUrl],
        });
      }

      res.status(200).json({ 
        message: 'Profile picture uploaded successfully',
        profilePictureUrl: imageUrl,
        userBio: userBio
      });

    } catch (mediaError) {
      console.error('Media service error:', mediaError);
      res.status(500).json({ 
        message: 'Failed to upload to media service',
        error: mediaError instanceof Error ? mediaError.message : 'Unknown error'
      });
    }

  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

