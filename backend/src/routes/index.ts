import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';

// Controllers
import * as botController from '../controllers/bot.controller';
import * as userController from '../controllers/user.controller';
import * as authController from '../controllers/auth.controller';

const router = Router();

// Rotas públicas
router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'CharBotFlex Backend'
  });
});

// Rotas de autenticação (algumas públicas, outras protegidas)
router.post('/auth/validate-token', authController.refreshToken as any);

// Middleware de autenticação para todas as rotas abaixo
router.use(authenticate as any);

// Rotas de autenticação protegidas
router.get('/auth/me', authController.getCurrentUser as any);
router.get('/auth/validate-session', authController.validateSession as any);

// Rotas do Bot
router.get('/bot/flows', botController.getBotFlows as any);
router.get('/bot/flows/:id', botController.getBotFlowById as any);
router.post('/bot/flows', botController.createBotFlow as any);
router.put('/bot/flows/:id', botController.updateBotFlow as any);
router.delete('/bot/flows/:id', botController.deleteBotFlow as any);
router.patch('/bot/flows/:id/toggle', botController.toggleBotFlow as any);
router.get('/bot/status', botController.getBotStatus as any);

// Rotas de Usuários
router.get('/users', userController.getAllUsers as any);
router.get('/users/:id', userController.getUserById as any);
router.post('/users', userController.createUser as any);
router.put('/users/:id', userController.updateUser as any);
router.delete('/users/:id', userController.deleteUser as any);
router.patch('/users/:id/status', userController.updateUserStatus as any);

export default router;