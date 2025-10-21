import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '../utils/AppError';

// Middleware genérico de validação
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        next(new ValidationError(messages.join(', ')));
      } else {
        next(error);
      }
    }
  };
};

// Schemas de validação
export const schemas = {
  // Bot Flow
  createBotFlow: z.object({
    name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100, 'Nome muito longo'),
    trigger: z.object({
      type: z.enum(['keyword', 'intent']),
      value: z.string().min(1, 'Valor do trigger é obrigatório'),
    }),
    nodes: z.array(z.object({
      id: z.string(),
      type: z.enum(['message', 'menu', 'question', 'condition', 'transfer']),
      content: z.string().min(1, 'Conteúdo é obrigatório'),
      options: z.array(z.string()).optional(),
      nextNode: z.string().optional(),
      conditions: z.array(z.any()).optional(),
    })).min(1, 'Pelo menos um nó é necessário'),
  }),

  updateBotFlow: z.object({
    name: z.string().min(3).max(100).optional(),
    isActive: z.boolean().optional(),
    trigger: z.object({
      type: z.enum(['keyword', 'intent']),
      value: z.string().min(1),
    }).optional(),
    nodes: z.array(z.object({
      id: z.string(),
      type: z.enum(['message', 'menu', 'question', 'condition', 'transfer']),
      content: z.string().min(1),
      options: z.array(z.string()).optional(),
      nextNode: z.string().optional(),
      conditions: z.array(z.any()).optional(),
    })).optional(),
  }),

  // User
  createUser: z.object({
    name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100),
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
    role: z.enum(['admin', 'supervisor', 'operator']),
    phone: z.string().min(10, 'Telefone inválido').max(15),
    maxChats: z.number().min(1).max(50).optional(),
  }),

  updateUser: z.object({
    name: z.string().min(3).max(100).optional(),
    phone: z.string().min(10).max(15).optional(),
    maxChats: z.number().min(1).max(50).optional(),
    role: z.enum(['admin', 'supervisor', 'operator']).optional(),
  }),

  updatePassword: z.object({
    newPassword: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  }),

  // Department
  createDepartment: z.object({
    name: z.string().min(3).max(100),
    description: z.string().max(500).optional(),
    maxConcurrentChats: z.number().min(1).max(100).optional(),
  }),

  // Settings
  updateSettings: z.object({
    businessHours: z.object({
      enabled: z.boolean(),
      timezone: z.string(),
      schedule: z.array(z.object({
        day: z.number().min(0).max(6),
        start: z.string(),
        end: z.string(),
      })),
    }).optional(),
    autoAssignment: z.object({
      enabled: z.boolean(),
      strategy: z.enum(['round-robin', 'least-busy', 'random']),
    }).optional(),
  }),

  // Quick Reply
  createQuickReply: z.object({
    title: z.string().min(3).max(100),
    content: z.string().min(1).max(1000),
    shortcut: z.string().min(1).max(20).regex(/^\/\w+$/, 'Atalho deve começar com /'),
    departmentId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),

  // Tag
  createTag: z.object({
    name: z.string().min(2).max(50),
    color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Cor inválida (use formato #RRGGBB)'),
    category: z.enum(['issue', 'priority', 'department', 'custom']),
  }),

  // Scheduled Message
  scheduleMessage: z.object({
    phoneNumber: z.string().min(10).max(15),
    content: z.string().min(1).max(4096),
    scheduledFor: z.string().datetime('Data/hora inválida'),
    repeatConfig: z.object({
      frequency: z.enum(['daily', 'weekly', 'monthly']),
      until: z.string().datetime(),
    }).optional(),
  }),
};
