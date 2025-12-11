import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { apiLimiter, authLimiter, createLimiter } from '../middleware/rate-limit.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { schemas } from '../middleware/validation.middleware.js';

// Controllers
import * as botController from '../controllers/bot.controller.js';
import * as userController from '../controllers/user.controller.js';
import * as authController from '../controllers/auth.controller.js';
import * as whatsappController from '../controllers/whatsapp.controller.js';
import * as departmentController from '../controllers/department.controller.js';
import * as settingsController from '../controllers/settings.controller.js';
import * as quickReplyController from '../controllers/quick-reply.controller.js';
import * as tagController from '../controllers/tag.controller.js';
import * as analyticsController from '../controllers/analytics.controller.js';
import * as feedbackController from '../controllers/feedback.controller.js';
import * as exportController from '../controllers/export.controller.js';
import * as schedulerController from '../controllers/scheduler.controller.js';
import * as conversationController from '../controllers/conversation.controller.js';
import * as testController from '../controllers/test.controller.js';
import instagramController from '../controllers/instagram.controller.js';

// API Routes para integração externa
import apiRoutes from './api.routes.js';

const router = Router();

// ==========================================
// ROTAS PÚBLICAS
// ==========================================
router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'CharBotFlex Backend'
  });
});

// ==========================================
// API EXTERNA (Integração com apps terceiros)
// ==========================================
router.use('/v1', apiRoutes);

// ==========================================
// WEBHOOK DO INSTAGRAM (Público - sem autenticação)
// ==========================================
router.get('/instagram/webhook', instagramController.verifyWebhook.bind(instagramController));
router.post('/instagram/webhook', instagramController.handleWebhook.bind(instagramController));

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================
router.post('/auth/validate-token', authLimiter, authController.refreshToken as any);

// Middleware de autenticação para todas as rotas abaixo
router.use(authenticate as any);

// Rotas de autenticação protegidas
router.get('/auth/me', authController.getCurrentUser as any);
router.get('/auth/validate-session', authController.validateSession as any);

// Aplicar rate limiting geral
router.use(apiLimiter);

// ==========================================
// ROTAS DO BOT
// ==========================================
router.get('/bot/flows', botController.getBotFlows as any);
router.get('/bot/flows/:id', botController.getBotFlowById as any);
router.post('/bot/flows', createLimiter, validate(schemas.createBotFlow), botController.createBotFlow as any);
router.put('/bot/flows/:id', validate(schemas.updateBotFlow), botController.updateBotFlow as any);
router.delete('/bot/flows/:id', botController.deleteBotFlow as any);
router.patch('/bot/flows/:id/toggle', botController.toggleBotFlow as any);
router.get('/bot/status', botController.getBotStatus as any);

// ==========================================
// ROTAS DE USUÁRIOS
// ==========================================
router.get('/users', userController.getAllUsers as any);
router.get('/users/:id', userController.getUserById as any);
router.post('/users', createLimiter, validate(schemas.createUser), userController.createUser as any);
router.put('/users/:id', validate(schemas.updateUser), userController.updateUser as any);
router.delete('/users/:id', userController.deleteUser as any);
router.patch('/users/:id/status', userController.updateUserStatus as any);
router.patch('/users/me/password', userController.updateOwnPassword as any);

// ==========================================
// ROTAS DO WHATSAPP
// ==========================================
router.get('/whatsapp/health', whatsappController.getHealth as any);
router.get('/whatsapp/connections', whatsappController.getConnections as any);
router.post('/whatsapp/generate-qr', whatsappController.generateQrCode as any);
router.post('/whatsapp/disconnect/:id', whatsappController.disconnectWhatsApp as any);
router.post('/whatsapp/restart', whatsappController.restartWhatsApp as any);
router.post('/whatsapp/link-flow/:id', whatsappController.linkBotFlow as any);
router.post('/whatsapp/clear-session', whatsappController.clearSession as any);
router.get('/whatsapp/cooldown', whatsappController.checkCooldown as any);

// ==========================================
// ROTAS DE DEPARTAMENTOS
// ==========================================
router.get('/departments', departmentController.getAllDepartments as any);
router.get('/departments/:id', departmentController.getDepartmentById as any);
router.post('/departments', createLimiter, validate(schemas.createDepartment), departmentController.createDepartment as any);
router.put('/departments/:id', validate(schemas.updateDepartment), departmentController.updateDepartment as any);
router.delete('/departments/:id', departmentController.deleteDepartment as any);
router.post('/departments/:id/users', departmentController.addUserToDepartment as any);
router.delete('/departments/:id/users/:userId', departmentController.removeUserFromDepartment as any);
router.get('/departments/:id/available-users', departmentController.getAvailableUsers as any);
router.post('/departments/transfer', departmentController.transferToDepartment as any);

// ==========================================
// ROTAS DE CONFIGURAÇÕES
// ==========================================
router.get('/settings', settingsController.getSettings as any);
router.put('/settings', validate(schemas.updateSettings), settingsController.updateSettings as any);
router.put('/settings/messages', settingsController.updateMessages as any);
router.post('/settings/messages/reset', settingsController.resetMessages as any);
router.post('/settings/auto-close/check', settingsController.runAutoCloseCheck as any);

// ==========================================
// ROTAS DE RESPOSTAS RÁPIDAS
// ==========================================
router.get('/quick-replies', quickReplyController.getAllQuickReplies as any);
router.get('/quick-replies/:id', quickReplyController.getQuickReplyById as any);
router.get('/quick-replies/shortcut/:shortcut', quickReplyController.getQuickReplyByShortcut as any);
router.post('/quick-replies', createLimiter, validate(schemas.createQuickReply), quickReplyController.createQuickReply as any);
router.put('/quick-replies/:id', quickReplyController.updateQuickReply as any);
router.delete('/quick-replies/:id', quickReplyController.deleteQuickReply as any);

// ==========================================
// ROTAS DE TAGS
// ==========================================
router.get('/tags', tagController.getAllTags as any);
router.get('/tags/:id', tagController.getTagById as any);
router.post('/tags', createLimiter, validate(schemas.createTag), tagController.createTag as any);
router.put('/tags/:id', tagController.updateTag as any);
router.delete('/tags/:id', tagController.deleteTag as any);
router.post('/conversations/:conversationId/tags/:tagId', tagController.addTagToConversation as any);
router.delete('/conversations/:conversationId/tags/:tagId', tagController.removeTagFromConversation as any);

// ==========================================
// ROTAS DE ANALYTICS
// ==========================================
router.get('/analytics', analyticsController.getAnalytics as any);
router.get('/analytics/export', analyticsController.exportAnalytics as any);
router.get('/dashboard/stats', analyticsController.getDashboardStats as any);
router.get('/dashboard/recent-activity', analyticsController.getRecentActivity as any);

// ==========================================
// ROTAS DE FEEDBACK
// ==========================================
router.get('/feedback', feedbackController.getAllFeedback as any);
router.get('/feedback/:id', feedbackController.getFeedbackById as any);
router.get('/feedback/stats', feedbackController.getFeedbackStats as any);
router.post('/feedback', validate(schemas.createFeedback), feedbackController.createFeedback as any);
router.delete('/feedback/:id', feedbackController.deleteFeedback as any);

// ==========================================
// ROTAS DE EXPORTAÇÃO
// ==========================================
router.get('/export/conversations', exportController.exportConversations as any);
router.get('/export/analytics', exportController.exportAnalytics as any);
router.get('/export/feedback', exportController.exportFeedback as any);

// ==========================================
// ROTAS DE AGENDAMENTO
// ==========================================
router.get('/scheduled-messages', schedulerController.getAllScheduledMessages as any);
router.get('/scheduled-messages/:id', schedulerController.getScheduledMessageById as any);
router.post('/scheduled-messages', validate(schemas.scheduleMessage), schedulerController.scheduleMessage as any);
router.put('/scheduled-messages/:id', schedulerController.updateScheduledMessage as any);
router.delete('/scheduled-messages/:id', schedulerController.cancelScheduledMessage as any);

// ==========================================
// ROTAS DE CONVERSAS
// ==========================================
router.get('/conversations', conversationController.getAllConversations as any);
router.get('/conversations/:id', conversationController.getConversationById as any);
router.get('/conversations/:id/messages', conversationController.getConversationMessages as any);
router.post('/conversations/:id/messages', conversationController.sendMessage as any);
router.post('/conversations/:id/close', conversationController.closeConversation as any);
router.post('/conversations/:id/reopen', conversationController.reopenConversation as any);
router.post('/conversations/:id/assign', conversationController.assignConversation as any);
router.post('/conversations/:id/transfer', conversationController.transferConversation as any);
router.post('/conversations/:id/mark-read', conversationController.markMessagesAsRead as any);

// ==========================================
// ROTAS DO INSTAGRAM
// ==========================================
router.get('/instagram/config', instagramController.getConfig.bind(instagramController));
router.post('/instagram/config', instagramController.saveConfig.bind(instagramController));
router.post('/instagram/connect', instagramController.connectPage.bind(instagramController));
router.post('/instagram/disconnect', instagramController.disconnect.bind(instagramController));
router.post('/instagram/toggle', instagramController.toggleActive.bind(instagramController));
router.get('/instagram/validate', instagramController.validateCredentials.bind(instagramController));
router.get('/instagram/stats', instagramController.getStats.bind(instagramController));
router.post('/instagram/send', instagramController.sendMessage.bind(instagramController));

// ==========================================
// ROTAS DE TESTE (REMOVER EM PRODUÇÃO)
// ==========================================
router.post('/test/conversation', testController.createTestConversation as any);
router.post('/test/conversations', testController.createMultipleTestConversations as any);
router.delete('/test/conversations', testController.clearTestConversations as any);

export default router;