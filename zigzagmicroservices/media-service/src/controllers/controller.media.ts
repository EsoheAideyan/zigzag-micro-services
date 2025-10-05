import { Request, Response } from "express";
import { minioClient, BUCKET } from "../config/minio";
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

// Memory storage for Multer
const upload = multer({ storage: multer.memoryStorage() }).single('file')

const uploadMultiple = multer({ storage: multer.memoryStorage() }).array('files');


// POST /api/v1/media/upload
export const uploadFile = async (req: Request, res: Response) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: 'File upload error', error: err.message });

    if (!req.file) return res.status(400).json({ message: 'No file provided' });

    const fileName = uuidv4() + '-' + req.file.originalname;

    try {
      await minioClient.putObject(BUCKET, fileName, req.file.buffer, req.file.size, {
        'Content-Type': req.file.mimetype,
      });

      const fileUrl = `${process.env.MINIO_PUBLIC_URL}/api/v1/media/${fileName}`;

      res.status(201).json({ message: 'Files uploaded successfully', url: fileUrl });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Upload failed', error });
    }
  });
}


// POST /api/v1/media/upload-media-multiple
export const uploadMultipleFiles = (req: Request, res: Response): void => {
  uploadMultiple(req, res, async (err) => {
    if (err)
      return res.status(400).json({ message: 'File upload error', error: err.message });

    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files provided' });
    }

    try {
      const uploadedUrls: string[] = [];

      for (const file of files) {
        const fileName = uuidv4() + '-' + file.originalname;

        await minioClient.putObject(
          BUCKET,
          fileName,
          file.buffer,
          file.size,
          { 'Content-Type': file.mimetype }
        );

        const fileUrl = `${process.env.MINIO_PUBLIC_URL}/api/v1/media/${fileName}`;
        uploadedUrls.push(fileUrl);
      }

      res.status(201).json({ message: 'Files uploaded successfully', urls: uploadedUrls });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Upload failed', error });
    }
  });
}

// GET /api/v1/media/file-url/:objectName
export const getPresignedUrl = async (req: Request, res: Response) => {
  const { objectName } = req.params // filename saved in DB

  try {
    const url = await minioClient.presignedGetObject(BUCKET, objectName, 60 * 10); // valid 10 min
    res.json({ url });
  } catch (error) {
    console.error('Presign error:', error);
    res.status(500).json({ message: 'Failed to generate presigned URL' })
  }
}

// POST /api/v1/media/upload-profile-picture
export const uploadProfilePicture = async (req: Request, res: Response) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: 'File upload error', error: err.message });

    if (!req.file) return res.status(400).json({ message: 'No file provided' });

    // Validate file type
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Only image files are allowed' });
    }

    // Validate file size (5MB limit)
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'File size too large. Maximum 5MB allowed.' });
    }

    const fileName = `profile-${uuidv4()}-${req.file.originalname}`;

    try {
      await minioClient.putObject(BUCKET, fileName, req.file.buffer, req.file.size, {
        'Content-Type': req.file.mimetype,
      });

      const fileUrl = `${process.env.MINIO_PUBLIC_URL}/api/v1/media/${fileName}`;

      res.status(201).json({ 
        message: 'Profile picture uploaded successfully', 
        url: fileUrl,
        fileName: fileName
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Upload failed', error });
    }
  });
}