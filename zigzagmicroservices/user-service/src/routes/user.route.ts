import express from 'express'
import { login, signup, deleteUser, getUserProfile, updateUserInfo, getAllUsersExceptCurrent } from '../controllers/controller.user'
import { createUserBio, updateUserBio, getUserBio } from '../controllers/controller.userbio'
import multer from 'multer'

const router = express.Router()

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'User router is working!' })
})

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ message: "User service is healthy", status: "OK" });
})

// Public routes (no authentication required)
router.post('/login', login)
router.post('/signup', signup)

// Protected routes (authentication handled at API Gateway level)
// Note: This route must come before /:id to avoid route conflicts
router.get('/discover/all', getAllUsersExceptCurrent)
router.get('/:id', getUserProfile)
router.patch('/:id', updateUserInfo)
router.delete('/:id', deleteUser)

//User Bio (protected routes)
router.post('/:id/bio', createUserBio)
router.patch('/:id/bio', updateUserBio)
router.get('/:id/bio', getUserBio)

//User Profile Picture (protected routes)
//const storage = multer.memoryStorage()
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

router.post('/:id/profile-picture', upload.single('profilePicture'), uploadProfilePicture)

export default router;

