import { db, collections } from '../../config/firebase';
import { IBotFlow, IFlowNode, IConversationContext } from '../../types';
import logger from '../../utils/logger';

export class FlowEngine {
  async processMessage(
    message: string,
    context: IConversationContext
  ): Promise<{
    message?: string;
    context: IConversationContext;
    transferToHuman?: boolean;
  }> {
    try {
      // Se não tem stage, iniciar com saudação
      if (!context.stage || context.stage === 'initial') {
        return await this.handleInitialMessage(message, context);
      }

      // Buscar fluxo ativo baseado no contexto
      const flow = await this.getActiveFlow(context.stage);

      if (!flow) {
        return this.handleNoFlow(context);
      }

      // Buscar nó atual
      const currentNode = flow.nodes.find(node => node.id === context.stage);

      if (!currentNode) {
        return this.handleNoNode(context);
      }

      // Processar resposta baseado no tipo de nó
      return await this.processNode(currentNode, message, context, flow);
    } catch (error) {
      logger.error('Erro no Flow Engine:', error);
      return {
        message: 'Desculpe, ocorreu um erro. Por favor, tente novamente.',
        context,
      };
    }
  }

  private async handleInitialMessage(
    message: string,
    context: IConversationContext
  ) {
    // Buscar fluxo de boas-vindas
    const welcomeFlow = await this.getWelcomeFlow();

    if (!welcomeFlow) {
      logger.warn('⚠️ Nenhum flow encontrado - usando mensagem padrão');
      return this.getDefaultWelcome(context);
    }

    if (!welcomeFlow.nodes || welcomeFlow.nodes.length === 0) {
      logger.warn(`⚠️ Flow ${welcomeFlow.name} não tem nodes - usando mensagem padrão`);
      return this.getDefaultWelcome(context);
    }

    const firstNode = welcomeFlow.nodes[0];
    logger.info(`✅ Usando flow: ${welcomeFlow.name} - Primeiro node: ${firstNode.id}`);
    
    return {
      message: firstNode.content,
      context: {
        ...context,
        stage: firstNode.id,
        lastIntent: 'welcome',
      },
    };
  }

  private getDefaultWelcome(context: IConversationContext) {
    return {
      message: `Olá! Bem-vindo à nossa academia! 👋

Como posso ajudar você hoje?

1️⃣ Horários de Funcionamento
2️⃣ Planos e Preços
3️⃣ Agendar Aula Experimental
4️⃣ Falar com Atendente
5️⃣ Modalidades Disponíveis

Digite o número da opção desejada.`,
      context: {
        ...context,
        stage: 'main_menu',
        lastIntent: 'welcome',
      },
    };
  }

  private async processNode(
    node: IFlowNode,
    message: string,
    context: IConversationContext,
    flow: IBotFlow
  ) {
    switch (node.type) {
      case 'menu':
        return this.processMenuNode(node, message, context, flow);
      
      case 'question':
        return this.processQuestionNode(node, message, context, flow);
      
      case 'message':
        return this.processMessageNode(node, context, flow);
      
      case 'transfer':
        return this.processTransferNode(node, context);
      
      default:
        return {
          message: node.content,
          context,
        };
    }
  }

  private async processMenuNode(
    node: IFlowNode,
    message: string,
    context: IConversationContext,
    flow: IBotFlow
  ) {
    const userChoice = message.trim();

    // Verificar se é uma opção válida
    if (node.options) {
      const optionIndex = parseInt(userChoice) - 1;

      if (optionIndex >= 0 && optionIndex < node.options.length) {
        // Opção válida selecionada
        const selectedOption = node.options[optionIndex];
        
        // Salvar escolha no contexto
        const newContext = {
          ...context,
          userData: {
            ...context.userData,
            lastChoice: selectedOption,
          },
        };

        // Verificar se há próximo nó
        if (node.nextNode) {
          const nextNode = flow.nodes.find(n => n.id === node.nextNode);
          
          if (nextNode) {
            return {
              message: nextNode.content,
              context: {
                ...newContext,
                stage: nextNode.id,
              },
            };
          }
        }

        // Processar ações específicas
        return this.handleMenuAction(userChoice, newContext);
      }
    }

    // Opção inválida
    return {
      message: `Opção inválida. Por favor, escolha uma das opções disponíveis:\n\n${node.content}`,
      context,
    };
  }

  private async processQuestionNode(
    node: IFlowNode,
    message: string,
    context: IConversationContext,
    flow: IBotFlow
  ) {
    // Salvar resposta do usuário
    const newContext = {
      ...context,
      userData: {
        ...context.userData,
        [node.id]: message,
      },
    };

    // Buscar próximo nó
    if (node.nextNode) {
      const nextNode = flow.nodes.find(n => n.id === node.nextNode);
      
      if (nextNode) {
        return {
          message: nextNode.content,
          context: {
            ...newContext,
            stage: nextNode.id,
          },
        };
      }
    }

    return {
      message: 'Obrigado pela informação!',
      context: newContext,
    };
  }

  private async processMessageNode(
    node: IFlowNode,
    context: IConversationContext,
    flow: IBotFlow
  ) {
    // Apenas enviar mensagem e avançar
    if (node.nextNode) {
      const nextNode = flow.nodes.find(n => n.id === node.nextNode);
      
      if (nextNode) {
        return {
          message: `${node.content}\n\n${nextNode.content}`,
          context: {
            ...context,
            stage: nextNode.id,
          },
        };
      }
    }

    return {
      message: node.content,
      context,
    };
  }

  private async processTransferNode(
    node: IFlowNode,
    context: IConversationContext
  ) {
    return {
      message: node.content || 'Transferindo você para um atendente. Aguarde um momento...',
      context: {
        ...context,
        stage: 'transfer',
      },
      transferToHuman: true,
    };
  }

  private async handleMenuAction(choice: string, context: IConversationContext) {
    switch (choice) {
      case '1': // Horários
        return {
          message: `🕐 Horários de Funcionamento:

Segunda a Sexta: 6h às 22h
Sábado: 8h às 18h
Domingo: 8h às 12h

Como posso ajudar mais? Digite *menu* para voltar.`,
          context: {
            ...context,
            stage: 'info_shown',
          },
        };

      case '2': // Planos
        return {
          message: `💰 Nossos Planos:

📌 Mensal: R$ 99,90
📌 Trimestral: R$ 249,90 (3x sem juros)
📌 Semestral: R$ 449,90 (6x sem juros)
📌 Anual: R$ 799,90 (12x sem juros)

Todos os planos incluem acesso total às modalidades!

Quer agendar uma aula experimental? Digite *sim*.`,
          context: {
            ...context,
            stage: 'plans_shown',
          },
        };

      case '3': // Agendar aula
        return {
          message: `🎯 Que ótimo! Vamos agendar sua aula experimental.

Por favor, me informe seu nome completo:`,
          context: {
            ...context,
            stage: 'collecting_name',
          },
        };

      case '4': // Falar com atendente
        return {
          message: 'Transferindo você para um atendente. Aguarde um momento...',
          context: {
            ...context,
            stage: 'transfer',
          },
          transferToHuman: true,
        };

      case '5': // Modalidades
        return {
          message: `🏋️ Modalidades Disponíveis:

• Musculação
• Spinning
• Yoga
• Pilates
• Funcional
• Natação
• Lutas (MMA, Boxe, Muay Thai)

Digite *menu* para voltar ao menu principal.`,
          context: {
            ...context,
            stage: 'info_shown',
          },
        };

      default:
        return {
          message: 'Opção inválida. Digite *menu* para ver as opções.',
          context,
        };
    }
  }

  private async getActiveFlow(stage: string): Promise<IBotFlow | null> {
    try {
      const snapshot = await db.collection(collections.botFlows)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (snapshot.empty) return null;

      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() } as IBotFlow;
    } catch (error) {
      logger.error('Erro ao buscar fluxo:', error);
      return null;
    }
  }

  private async getWelcomeFlow(): Promise<IBotFlow | null> {
    try {
      logger.info('🔍 Buscando flow ativo no Firestore...');
      
      // Buscar qualquer fluxo ativo (não apenas 'welcome')
      const snapshot = await db.collection(collections.botFlows)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (snapshot.empty) {
        logger.warn('⚠️ Nenhum fluxo ativo encontrado no Firestore');
        
        // Tentar buscar qualquer flow (mesmo inativo) para debug
        const allFlows = await db.collection(collections.botFlows).limit(5).get();
        logger.info(`📊 Total de flows no banco: ${allFlows.size}`);
        allFlows.forEach(doc => {
          const data = doc.data();
          logger.info(`  - Flow: ${data.name} | Ativo: ${data.isActive} | Nodes: ${data.nodes?.length || 0}`);
        });
        
        return null;
      }

      const doc = snapshot.docs[0];
      const flow = { id: doc.id, ...doc.data() } as IBotFlow;
      logger.info(`✅ Fluxo ativo encontrado: ${flow.name} (${flow.id}) | Nodes: ${flow.nodes?.length || 0}`);
      return flow;
    } catch (error) {
      logger.error('❌ Erro ao buscar fluxo de boas-vindas:', error);
      return null;
    }
  }

  private handleNoFlow(context: IConversationContext) {
    return {
      message: 'Como posso ajudar? Digite *menu* para ver as opções.',
      context,
    };
  }

  private handleNoNode(context: IConversationContext) {
    return {
      message: 'Desculpe, não entendi. Digite *menu* para ver as opções.',
      context: {
        ...context,
        stage: 'main_menu',
      },
    };
  }
}