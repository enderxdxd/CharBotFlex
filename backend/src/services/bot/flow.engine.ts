import { db, collections } from '../../config/firebase.js';
import { IBotFlow, IFlowNode, IConversationContext } from '../../types.js';
import logger from '../../utils/logger.js';

export class FlowEngine {
  async processMessage(
    message: string,
    context: IConversationContext
  ): Promise<{
    message?: string;
    context: IConversationContext;
    transferToHuman?: boolean;
    department?: string;
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
    logger.info('🎬 === INICIANDO handleInitialMessage ===');
    logger.info(`📝 Mensagem: "${message}"`);
    logger.info(`📍 Context stage: ${context.stage}`);
    
    const welcomeFlow = await this.getWelcomeFlow();
    
    if (!welcomeFlow) {
      logger.error('❌❌❌ ERRO: welcomeFlow é NULL!');
      return this.getDefaultWelcome(context);
    }
    
    if (!welcomeFlow.nodes) {
      logger.error('❌❌❌ ERRO: welcomeFlow.nodes é NULL/UNDEFINED!');
      logger.error('❌ Flow completo:', JSON.stringify(welcomeFlow, null, 2));
      return this.getDefaultWelcome(context);
    }
    
    if (welcomeFlow.nodes.length === 0) {
      logger.error('❌❌❌ ERRO: welcomeFlow.nodes está VAZIO!');
      logger.error('❌ Flow completo:', JSON.stringify(welcomeFlow, null, 2));
      return this.getDefaultWelcome(context);
    }
    
    logger.info(`✅ Flow encontrado: "${welcomeFlow.name}" com ${welcomeFlow.nodes.length} nodes`);
    logger.info(`📋 Nodes do flow:`, welcomeFlow.nodes.map(n => ({ id: n.id, type: n.type, hasLabel: !!(n as any).label, hasContent: !!n.content })));

    // ✅ BUSCAR O TRIGGER NODE (não o primeiro node aleatório)
    const triggerNode = welcomeFlow.nodes.find(node => node.type === 'trigger');
    
    if (!triggerNode) {
      logger.warn('⚠️ Flow sem trigger node - usando primeiro node');
      const firstNode = welcomeFlow.nodes[0];
      if (firstNode.content) {
        return {
          message: firstNode.content,
          context: { ...context, stage: firstNode.id, lastIntent: 'welcome' },
        };
      }
      return this.getDefaultWelcome(context);
    }

    logger.info(`✅ Trigger encontrado: ${triggerNode.id}`);

    // ✅ CORREÇÃO CRÍTICA: Na primeira mensagem (stage === 'initial'), SEMPRE ativar o trigger
    // Ignorar keywords na primeira interação
    if (context.stage === 'initial') {
      logger.info('🎯 Primeira mensagem do usuário - ATIVANDO TRIGGER automaticamente (ignorando keywords)');
    } else {
      // Verificar keywords apenas em mensagens subsequentes
      const shouldTrigger = this.shouldTriggerNode(triggerNode, message);
      
      if (!shouldTrigger) {
        logger.info('⏭️ Trigger não ativado para esta mensagem');
        return { message: '', context };
      }
    }

    // ✅ BUSCAR O PRÓXIMO NODE APÓS O TRIGGER usando EDGES
    logger.info(`🔍 Buscando próximo node do trigger usando edges...`);
    logger.info(`🔍 Trigger ID: ${triggerNode.id}`);
    logger.info(`🔍 Edges disponíveis:`, welcomeFlow.edges?.map(e => ({ source: e.source, target: e.target })));
    
    // Buscar edge que sai do trigger
    const triggerEdge = welcomeFlow.edges?.find(e => e.source === triggerNode.id);
    
    if (!triggerEdge) {
      logger.error(`❌ ERRO: Trigger "${triggerNode.id}" não tem nenhuma conexão (edge)!`);
      logger.error(`❌ Edges disponíveis:`, welcomeFlow.edges);
      return this.getDefaultWelcome(context);
    }
    
    logger.info(`✅ Edge encontrado: ${triggerEdge.source} → ${triggerEdge.target}`);
    
    // Buscar o node de destino
    const firstMessageNode = welcomeFlow.nodes.find(n => n.id === triggerEdge.target);
    
    if (!firstMessageNode) {
      logger.error(`❌ ERRO: Edge aponta para node "${triggerEdge.target}" mas esse node NÃO EXISTE!`);
      logger.error(`❌ Nodes disponíveis: ${welcomeFlow.nodes.map(n => n.id).join(', ')}`);
      return this.getDefaultWelcome(context);
    }

    logger.info(`✅ Node encontrado: ${firstMessageNode.id} (tipo: ${firstMessageNode.type})`);
    
    // ✅ PROCESSAR O NODE COMPLETO (vai concatenar mensagens se necessário)
    if (firstMessageNode.type === 'message') {
      logger.info(`📨 Processando node de mensagem: ${firstMessageNode.id}`);
      return await this.processMessageNode(firstMessageNode, context, welcomeFlow);
    }
    
    // Se não for message, processar normalmente
    return await this.processNode(firstMessageNode, message, context, welcomeFlow);
  }

  // ✅ NOVO MÉTODO: Verificar se trigger deve ser ativado
  private shouldTriggerNode(triggerNode: IFlowNode, message: string): boolean {
    const data = triggerNode.data || {};
    
    logger.info(`🔍 Verificando trigger:`, {
      triggerType: data.triggerType,
      keywords: data.keywords,
      message: message,
    });
    
    // ✅ CORREÇÃO: Trigger universal (responde a qualquer mensagem)
    // Ativar se:
    // 1. triggerType === 'any'
    // 2. Não tem keywords
    // 3. Keywords está vazio
    // 4. Keywords tem apenas strings vazias
    if (
      data.triggerType === 'any' || 
      !data.keywords || 
      data.keywords.length === 0 ||
      (Array.isArray(data.keywords) && data.keywords.every((k: string) => !k || k.trim() === ''))
    ) {
      logger.info('✅ Trigger universal - ATIVADO (responde a qualquer mensagem)');
      return true;
    }
    
    // Trigger por keywords específicas
    if (data.keywords && Array.isArray(data.keywords)) {
      const validKeywords = data.keywords.filter((k: string) => k && k.trim() !== '');
      
      // Se não tem keywords válidas, ativar sempre
      if (validKeywords.length === 0) {
        logger.info('✅ Trigger sem keywords válidas - ATIVADO (responde a qualquer mensagem)');
        return true;
      }
      
      const lowerMessage = message.toLowerCase().trim();
      const matched = validKeywords.some((keyword: string) => 
        lowerMessage.includes(keyword.toLowerCase())
      );
      
      if (matched) {
        logger.info('✅ Keyword encontrada - ATIVADO');
      } else {
        logger.warn(`⚠️ Nenhuma keyword encontrada. Keywords: ${validKeywords.join(', ')}`);
        logger.warn(`⚠️ Mensagem recebida: "${message}"`);
      }
      
      return matched;
    }
    
    logger.info('✅ Trigger padrão - ATIVADO (responde a qualquer mensagem)');
    return true; // Default: ativar sempre
  }

  private getDefaultWelcome(context: IConversationContext) {
    // ❌ REMOVIDO: Fallback desativado - bot DEVE usar o flow configurado
    logger.error('❌❌❌ ERRO CRÍTICO: getDefaultWelcome foi chamado! Isso NÃO deveria acontecer!');
    logger.error('❌ O bot DEVE usar o flow configurado no Firestore!');
    logger.error('❌ Verifique se o flow está ativo e tem nodes configurados corretamente!');
    
    return {
      message: '❌ ERRO: Nenhum fluxo configurado. Por favor, configure um fluxo ativo no sistema.',
      context,
    };
  }

  private async processNode(
    currentNode: IFlowNode,
    message: string,
    context: IConversationContext,
    flow: IBotFlow
  ): Promise<any> {
    logger.info(`🔄 Processando node tipo: ${currentNode.type} (${currentNode.id})`);
    
    switch (currentNode.type) {
      case 'message':
        return await this.processMessageNode(currentNode, context, flow);
      
      case 'input':
        return await this.processInputNode(currentNode, message, context, flow);
      
      case 'condition':
        return await this.processConditionNode(currentNode, message, context, flow);
      
      case 'transfer':
        return await this.processTransferNode(currentNode, context);
      
      case 'trigger':
        // Trigger já foi processado no início, avançar para nextNode
        const nextNode = flow.nodes.find(n => n.id === currentNode.nextNode);
        if (nextNode) {
          return await this.processNode(nextNode, message, context, flow);
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
  ): Promise<any> {
    // ✅ Aceitar content, label, ou data.label (ReactFlow usa data.label)
    let nodeMessage = node.content || 
                      (node as any).label || 
                      (node.data as any)?.label;
    
    if (!nodeMessage) {
      logger.warn(`⚠️ Node ${node.id} sem conteúdo`);
      return { message: '', context };
    }
    
    // ✅ SUBSTITUIR VARIÁVEIS {nome}, {email}, etc pelos valores do userData
    nodeMessage = this.replaceVariables(nodeMessage, context.userData);
    logger.info(`📝 Mensagem após substituição: ${nodeMessage}`);
    
    // ✅ CORREÇÃO: Usar edges para encontrar próximo node
    const edges = flow.edges || [];
    const edge = edges.find(e => e.source === node.id);
    
    if (edge) {
      const nextNode = flow.nodes.find(n => n.id === edge.target);
      if (nextNode) {
        logger.info(`➡️ Próximo node: ${nextNode.id} (${nextNode.type})`);
        
        // ✅ Se o próximo node também é MESSAGE, concatenar as mensagens
        if (nextNode.type === 'message') {
          const nextNodeMessage = nextNode.content || 
                                 (nextNode as any).label || 
                                 (nextNode.data as any)?.label;
          
          if (nextNodeMessage) {
            const nextMessageProcessed = this.replaceVariables(nextNodeMessage, context.userData);
            logger.info(`📝 Concatenando mensagem do próximo node: ${nextNode.id}`);
            
            // Encontrar o node DEPOIS do próximo (para atualizar stage corretamente)
            const nextEdge = edges.find(e => e.source === nextNode.id);
            const stageAfterNext = nextEdge?.target || nextNode.id;
            
            return {
              message: nodeMessage + '\n\n' + nextMessageProcessed,
              context: {
                ...context,
                stage: stageAfterNext,
              },
            };
          }
        }
        
        // Se não é message, apenas atualizar stage
        return {
          message: nodeMessage,
          context: {
            ...context,
            stage: nextNode.id,
          },
        };
      }
    }
    
    // Se não tem próximo node, manter no stage atual
    return {
      message: nodeMessage,
      context: {
        ...context,
        stage: node.id,
      },
    };
  }

  // ✅ NOVO MÉTODO: processInputNode
  private async processInputNode(
    node: IFlowNode,
    message: string,
    context: IConversationContext,
    flow: IBotFlow
  ): Promise<any> {
    const data = node.data || {};
    const validation = data.validation || 'text';
    
    // ✅ CORREÇÃO: Extrair variableName do label (ex: "Capturar nome" -> "nome")
    const label = (data.label || '').toLowerCase();
    let variableName = data.variableName;
    
    // Se não tem variableName, tentar extrair do label
    if (!variableName) {
      if (label.includes('nome')) variableName = 'nome';
      else if (label.includes('email')) variableName = 'email';
      else if (label.includes('telefone') || label.includes('phone')) variableName = 'telefone';
      else variableName = 'userInput';
    }
    
    logger.info(`📝 Input node: ${node.id}`);
    logger.info(`📝 Label: ${data.label}`);
    logger.info(`📝 VariableName detectado: ${variableName}`);
    logger.info(`📝 Valor capturado: ${message}`);
    
    // Validar input baseado no tipo
    const isValid = this.validateInput(message, validation);
    
    if (!isValid) {
      return {
        message: `Por favor, forneça um ${validation} válido.`,
        context, // Mantém no mesmo stage para tentar novamente
      };
    }
    
    // Salvar dado no contexto
    const updatedContext = {
      ...context,
      userData: {
        ...context.userData,
        [variableName]: message,
      },
    };
    
    logger.info(`✅ userData atualizado:`, updatedContext.userData);
    
    // ✅ CORREÇÃO: Usar edges ao invés de nextNode
    const edges = flow.edges || [];
    const edge = edges.find(e => e.source === node.id);
    
    if (edge) {
      const nextNode = flow.nodes.find(n => n.id === edge.target);
      if (nextNode) {
        logger.info(`✅ Input capturado: ${variableName} = ${message}`);
        logger.info(`➡️ Avançando para node: ${nextNode.id} (${nextNode.type})`);
        return await this.processNode(nextNode, message, updatedContext, flow);
      }
    }
    
    logger.warn(`⚠️ Input node ${node.id} não tem próximo node!`);
    return {
      message: 'Obrigado pela informação!',
      context: updatedContext,
    };
  }

  // ✅ NOVO MÉTODO: processConditionNode
  private async processConditionNode(
    node: IFlowNode,
    message: string,
    context: IConversationContext,
    flow: IBotFlow
  ): Promise<any> {
    const userChoice = message.trim();
    const data = node.data || {};
    const conditions = data.conditions || node.options || [];
    
    // Buscar qual condição o usuário escolheu
    const choiceIndex = conditions.indexOf(userChoice);
    
    if (choiceIndex === -1) {
      // Escolha inválida
      return {
        message: `Opção inválida. Por favor, escolha uma das opções: ${conditions.join(', ')}`,
        context, // Mantém no mesmo stage para tentar novamente
      };
    }
    
    // Buscar edges do flow para ver qual node está conectado a esta escolha
    const edges = (flow as any).edges || [];
    const edge = edges.find((e: any) => 
      e.source === node.id && e.label === userChoice
    );
    
    if (!edge) {
      logger.warn(`⚠️ Nenhum edge encontrado para escolha ${userChoice} no node ${node.id}`);
      return {
        message: 'Desculpe, essa opção está configurada incorretamente. Digite "menu" para voltar.',
        context,
      };
    }
    
    // Buscar o target node
    const targetNode = flow.nodes.find(n => n.id === edge.target);
    
    if (!targetNode) {
      logger.warn(`⚠️ Target node ${edge.target} não encontrado`);
      return {
        message: 'Desculpe, houve um erro. Digite "menu" para voltar.',
        context,
      };
    }
    
    // Processar o próximo node
    return await this.processNode(targetNode, message, context, flow);
  }

  /**
   * Substitui variáveis {nome}, {email}, etc pelos valores do userData
   */
  private replaceVariables(message: string, userData: Record<string, any>): string {
    let result = message;
    
    // Substituir cada variável {key} pelo valor em userData
    Object.keys(userData).forEach(key => {
      const regex = new RegExp(`\\{${key}\\}`, 'gi');
      result = result.replace(regex, userData[key]);
    });
    
    return result;
  }

  private validateInput(input: string, validation: string): boolean {
    switch (validation) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
      case 'phone':
        return /^\d{10,11}$/.test(input.replace(/\D/g, ''));
      case 'number':
        return !isNaN(Number(input));
      case 'text':
      default:
        return input.trim().length > 0;
    }
  }

  private async processTransferNode(
    node: IFlowNode,
    context: IConversationContext
  ) {
    // ✅ Pegar departamento do node
    const department = (node.data as any)?.department || node.content || 'Geral';
    const transferMessage = (node.data as any)?.label || 
                           node.content || 
                           'Transferindo você para um atendente. Aguarde um momento...';
    
    logger.info(`🔄 Transferindo para departamento: ${department}`);
    
    return {
      message: transferMessage,
      context: {
        ...context,
        stage: 'transfer',
      },
      transferToHuman: true,
      department, // ✅ Passar departamento para o handler
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