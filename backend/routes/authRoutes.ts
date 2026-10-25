import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';
import * as authController from '../controllers/authController';

const router = express.Router();
const phoneKey = (req: express.Request) => `phone:${String(req.body?.phone_number || '').replace(/[\s-]/g, '')}`;
const common = { standardHeaders: 'draft-7' as const, legacyHeaders: false };

const loginPerPhone = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, keyGenerator: phoneKey, message: { error: 'Too many failed login attempts for this number. Try again in 15 minutes.' } });
const loginPerNetwork = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 100, skipSuccessfulRequests: true, message: { error: 'Too many failed login attempts. Try again in 15 minutes.' } });
const codesPerPhone = rateLimit({ ...common, windowMs: 60 * 60 * 1000, limit: 10, keyGenerator: phoneKey, message: { error: 'Too many requests for this number. Try again later.' } });
const codesPerNetwork = rateLimit({ ...common, windowMs: 60 * 60 * 1000, limit: 300, message: { error: 'Too many requests. Try again later.' } });
const codes = [codesPerNetwork, codesPerPhone];

router.post('/register', codes, authController.register);
router.post('/verify-phone', codes, authController.verifyPhone);
router.post('/resend-code', codes, authController.resendVerification);
router.post('/login', loginPerNetwork, loginPerPhone, authController.login);
router.post('/forgot-password', codes, authController.forgotPassword);
router.post('/reset-password-with-code', codes, authController.resetPasswordWithCode);
router.get('/me', requireAuth, authController.me);
router.post('/logout', requireAuth, authController.logout);
router.put('/profile', requireAuth, authController.updateProfile);
router.post('/reset-password', requireAuth, authController.resetPassword);

export default router;
