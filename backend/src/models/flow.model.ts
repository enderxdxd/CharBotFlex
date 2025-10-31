import { IBotFlow, ITrigger, IFlowNode } from '../types.js';

export class BotFlow implements IBotFlow {
  id: string;
  name: string;
  isActive: boolean;
  trigger: ITrigger;
  nodes: IFlowNode[];
  createdAt: Date;
  updatedAt: Date;

  constructor(data: IBotFlow) {
    this.id = data.id;
    this.name = data.name;
    this.isActive = data.isActive;
    this.trigger = data.trigger;
    this.nodes = data.nodes;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  // Ativar fluxo
  activate(): void {
    this.isActive = true;
    this.updatedAt = new Date();
  }

  // Desativar fluxo
  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  // Buscar nó por ID
  getNodeById(nodeId: string): IFlowNode | undefined {
    return this.nodes.find(node => node.id === nodeId);
  }

  // Buscar primeiro nó
  getFirstNode(): IFlowNode | undefined {
    return this.nodes[0];
  }

  // Adicionar nó
  addNode(node: IFlowNode): void {
    this.nodes.push(node);
    this.updatedAt = new Date();
  }

  // Remover nó
  removeNode(nodeId: string): void {
    this.nodes = this.nodes.filter(node => node.id !== nodeId);
    this.updatedAt = new Date();
  }

  // Atualizar nó
  updateNode(nodeId: string, updates: Partial<IFlowNode>): void {
    const index = this.nodes.findIndex(node => node.id === nodeId);
    if (index !== -1) {
      this.nodes[index] = { ...this.nodes[index], ...updates };
      this.updatedAt = new Date();
    }
  }

  // Verificar se o trigger corresponde à mensagem
  matchesTrigger(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const triggerValue = this.trigger.value.toLowerCase();

    switch (this.trigger.type) {
      case 'keyword':
        return lowerMessage.includes(triggerValue);
      case 'intent':
        // TODO: Implementar análise de intenção (NLP)
        return lowerMessage.includes(triggerValue);
      default:
        return false;
    }
  }

  // Converter para objeto simples
  toJSON(): IBotFlow {
    return {
      id: this.id,
      name: this.name,
      isActive: this.isActive,
      trigger: this.trigger,
      nodes: this.nodes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}