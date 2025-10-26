import { db } from '../config/firebase';
import { ISystemSettings, DEFAULT_MESSAGES } from '../types/settings.types';
import logger from '../utils/logger';

const SETTINGS_COLLECTION = 'system_settings';
const SETTINGS_DOC_ID = 'main';

export class SettingsService {
  async getSettings(): Promise<ISystemSettings> {
    try {
      const doc = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
      
      if (!doc.exists) {
        // Criar configurações padrão se não existir
        const defaultSettings: ISystemSettings = {
          id: SETTINGS_DOC_ID,
          messages: DEFAULT_MESSAGES,
          general: {
            companyName: 'CharBotFlex',
            supportEmail: 'suporte@charbotflex.com',
            supportPhone: '+55 11 99999-9999',
            workingHours: 'Segunda a Sexta, 9h às 18h',
          },
          bot: {
            enabled: true,
            defaultTimeout: 10,
            maxRetries: 3,
          },
          autoClose: {
            enabled: false,
            inactivityTimeout: 30, // 30 minutos
            sendWarningMessage: true,
            warningTimeBeforeClose: 5, // 5 minutos antes
            closureMessage: 'Devido à inatividade, este atendimento foi encerrado automaticamente. Se precisar de ajuda, inicie uma nova conversa. Obrigado! 👋',
          },
          updatedAt: new Date(),
          updatedBy: 'system',
        };
        
        await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).set(defaultSettings);
        return defaultSettings;
      }
      
      const data = doc.data() as ISystemSettings;
      
      // Migração: Adicionar autoClose se não existir
      if (!data.autoClose) {
        const defaultAutoClose = {
          enabled: false,
          inactivityTimeout: 30,
          sendWarningMessage: true,
          warningTimeBeforeClose: 5,
          closureMessage: 'Devido à inatividade, este atendimento foi encerrado automaticamente. Se precisar de ajuda, inicie uma nova conversa. Obrigado! 👋',
        };
        
        await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).update({
          autoClose: defaultAutoClose,
        });
        
        data.autoClose = defaultAutoClose;
        logger.info('✅ Campo autoClose adicionado às configurações existentes');
      }
      
      return { id: doc.id, ...data } as ISystemSettings;
    } catch (error) {
      logger.error('Erro ao buscar configurações:', error);
      throw error;
    }
  }

  async updateSettings(data: Partial<ISystemSettings>, userId: string): Promise<void> {
    try {
      await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).update({
        ...data,
        updatedAt: new Date(),
        updatedBy: userId,
      });
      
      logger.info(`✅ Configurações atualizadas por ${userId}`);
    } catch (error) {
      logger.error('Erro ao atualizar configurações:', error);
      throw error;
    }
  }

  async updateMessages(messages: Partial<ISystemSettings['messages']>, userId: string): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      
      await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).update({
        messages: {
          ...currentSettings.messages,
          ...messages,
        },
        updatedAt: new Date(),
        updatedBy: userId,
      });
      
      logger.info(`✅ Mensagens atualizadas por ${userId}`);
    } catch (error) {
      logger.error('Erro ao atualizar mensagens:', error);
      throw error;
    }
  }

  async resetToDefaults(userId: string): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      
      await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).update({
        messages: DEFAULT_MESSAGES,
        updatedAt: new Date(),
        updatedBy: userId,
      });
      
      logger.info(`✅ Mensagens resetadas para padrão por ${userId}`);
    } catch (error) {
      logger.error('Erro ao resetar mensagens:', error);
      throw error;
    }
  }

  // Função auxiliar para substituir variáveis nas mensagens
  formatMessage(template: string, variables: Record<string, string>): string {
    let message = template;
    
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'g');
      message = message.replace(regex, variables[key]);
    });
    
    return message;
  }
}
