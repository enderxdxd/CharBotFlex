import { randomBytes } from 'crypto';

export const generateId = (): string => {
  return randomBytes(16).toString('hex');
};

export const formatPhoneNumber = (phone: string): string => {
  // Remove caracteres não numéricos
  let cleaned = phone.replace(/\D/g, '');
  
  // Adiciona código do país se não tiver (Brasil = 55)
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const sanitizeString = (str: string): string => {
  return str.trim().replace(/[<>]/g, '');
};
