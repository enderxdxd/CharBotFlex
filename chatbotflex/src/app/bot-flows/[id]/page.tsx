'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Save, 
  Play, 
  MessageSquare, 
  GitBranch, 
  Keyboard, 
  Users,
  ArrowLeft,
  Trash2,
  Clock,
  Zap,
  FileText,
  HelpCircle,
  Copy,
  Sparkles,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

// Componentes de Nós Melhorados
function MessageNode({ data, selected }: any) {
  return (
    <>
      <div className={`px-4 py-3 shadow-lg rounded-lg bg-white border-2 ${
        selected ? 'border-blue-600 ring-4 ring-blue-100' : 'border-blue-400'
      } min-w-[220px] max-w-[280px] transition-all hover:shadow-xl`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 rounded">
              <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div className="font-semibold text-sm text-gray-900">Mensagem</div>
          </div>
          {data.delay && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              {data.delay}s
            </div>
          )}
        </div>
        <div className="text-xs text-gray-600 line-clamp-2">{data.label || 'Clique para editar'}</div>
        {data.hasMedia && (
          <div className="mt-2 text-xs text-blue-600 flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Com mídia
          </div>
        )}
      </div>
      {/* Handles de Conexão - Todos os lados */}
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-4 !h-4" />
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-4 !h-4" />
      <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-4 !h-4" />
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-4 !h-4" />
    </>
  );
}

function ConditionNode({ data, selected }: any) {
  return (
    <>
      <div className={`px-4 py-3 shadow-lg rounded-lg bg-white border-2 ${
        selected ? 'border-yellow-600 ring-4 ring-yellow-100' : 'border-yellow-400'
      } min-w-[220px] max-w-[280px] transition-all hover:shadow-xl`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-yellow-100 rounded">
            <GitBranch className="h-3.5 w-3.5 text-yellow-600" />
          </div>
          <div className="font-semibold text-sm text-gray-900">Condição</div>
        </div>
        <div className="text-xs text-gray-600 line-clamp-2">{data.label || 'Clique para configurar'}</div>
        {data.conditions && (
          <div className="mt-2 flex gap-1">
            {data.conditions.map((c: string, i: number) => (
              <span key={i} className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-yellow-500 !w-4 !h-4" />
      <Handle type="source" position={Position.Bottom} className="!bg-yellow-500 !w-4 !h-4" />
      <Handle type="source" position={Position.Left} className="!bg-yellow-500 !w-4 !h-4" />
      <Handle type="source" position={Position.Right} className="!bg-yellow-500 !w-4 !h-4" />
    </>
  );
}

function InputNode({ data, selected }: any) {
  return (
    <>
      <div className={`px-4 py-3 shadow-lg rounded-lg bg-white border-2 ${
        selected ? 'border-green-600 ring-4 ring-green-100' : 'border-green-400'
      } min-w-[220px] max-w-[280px] transition-all hover:shadow-xl`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-green-100 rounded">
            <Keyboard className="h-3.5 w-3.5 text-green-600" />
          </div>
          <div className="font-semibold text-sm text-gray-900">Capturar Entrada</div>
        </div>
        <div className="text-xs text-gray-600 line-clamp-2">{data.label || 'Aguardar resposta'}</div>
        {data.validation && (
          <div className="mt-2 text-xs text-green-600">
            Validação: {data.validation}
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-green-500 !w-4 !h-4" />
      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-4 !h-4" />
      <Handle type="target" position={Position.Left} className="!bg-green-500 !w-4 !h-4" />
      <Handle type="source" position={Position.Right} className="!bg-green-500 !w-4 !h-4" />
    </>
  );
}

function TransferNode({ data, selected }: any) {
  return (
    <>
      <div className={`px-4 py-3 shadow-lg rounded-lg bg-white border-2 ${
        selected ? 'border-purple-600 ring-4 ring-purple-100' : 'border-purple-400'
      } min-w-[220px] max-w-[280px] transition-all hover:shadow-xl`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-purple-100 rounded">
            <Users className="h-3.5 w-3.5 text-purple-600" />
          </div>
          <div className="font-semibold text-sm text-gray-900">Transferir</div>
        </div>
        <div className="text-xs text-gray-600 line-clamp-2">
          {data.label || 'Para atendente humano'}
        </div>
        {data.department && (
          <div className="mt-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded inline-block">
            {data.department}
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-4 !h-4" />
      <Handle type="target" position={Position.Left} className="!bg-purple-500 !w-4 !h-4" />
      <Handle type="target" position={Position.Right} className="!bg-purple-500 !w-4 !h-4" />
    </>
  );
}

function TriggerNode({ data, selected }: any) {
  const isUniversal = data.triggerType === 'any' || !data.keywords || data.keywords.length === 0;
  
  return (
    <>
      <div className={`px-4 py-3 shadow-lg rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 border-2 ${
        selected ? 'border-white ring-4 ring-indigo-200' : 'border-indigo-400'
      } min-w-[220px] transition-all hover:shadow-xl`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-white/20 rounded">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="font-semibold text-sm text-white">
            {isUniversal ? 'Gatilho Universal' : 'Gatilho'}
          </div>
        </div>
        <div className="text-xs text-white/90">
          {data.label || (isUniversal ? 'Responde a qualquer mensagem' : 'Início do fluxo')}
        </div>
        {isUniversal ? (
          <div className="mt-2 flex items-center gap-1 text-xs text-white/80">
            <Sparkles className="h-3 w-3" />
            <span>Qualquer texto ativa</span>
          </div>
        ) : data.keywords && data.keywords.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {data.keywords.map((k: string, i: number) => (
              <span key={i} className="text-xs bg-white/20 text-white px-2 py-0.5 rounded">
                {k}
              </span>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-white !w-4 !h-4" />
      <Handle type="source" position={Position.Left} className="!bg-white !w-4 !h-4" />
      <Handle type="source" position={Position.Right} className="!bg-white !w-4 !h-4" />
    </>
  );
}

const nodeTypes = {
  message: MessageNode,
  condition: ConditionNode,
  input: InputNode,
  transfer: TransferNode,
  trigger: TriggerNode,
};

// Templates prontos
const TEMPLATES = [
  {
    id: 'welcome',
    name: 'Atendimento Básico',
    description: 'Boas-vindas + Menu de opções',
    icon: '👋',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: { label: 'Boas-vindas', triggerType: 'any' },
      },
      {
        id: 'message-1',
        type: 'message',
        position: { x: 250, y: 150 },
        data: { label: 'Olá! Bem-vindo ao nosso atendimento.\n\nEscolha uma opção:\n1️⃣ Vendas\n2️⃣ Suporte\n3️⃣ Financeiro' },
      },
    ],
    edges: [{ id: 'e1', source: 'trigger-1', target: 'message-1' }],
  },
  {
    id: 'sales',
    name: 'Captação de Vendas',
    description: 'Captura nome, email e interesse',
    icon: '💰',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: { label: 'Cliente interessado', keywords: ['comprar', 'preço'] },
      },
      {
        id: 'message-1',
        type: 'message',
        position: { x: 250, y: 150 },
        data: { label: 'Ótimo! Vou te ajudar.\n\nQual seu nome?' },
      },
      {
        id: 'input-1',
        type: 'input',
        position: { x: 250, y: 250 },
        data: { label: 'Capturar nome', validation: 'text' },
      },
      {
        id: 'message-2',
        type: 'message',
        position: { x: 250, y: 350 },
        data: { label: 'Prazer, {nome}!\n\nQual seu email?' },
      },
      {
        id: 'input-2',
        type: 'input',
        position: { x: 250, y: 450 },
        data: { label: 'Capturar email', validation: 'email' },
      },
      {
        id: 'transfer-1',
        type: 'transfer',
        position: { x: 250, y: 550 },
        data: { label: 'Transferir para vendas', department: 'Vendas' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'message-1' },
      { id: 'e2', source: 'message-1', target: 'input-1' },
      { id: 'e3', source: 'input-1', target: 'message-2' },
      { id: 'e4', source: 'message-2', target: 'input-2' },
      { id: 'e5', source: 'input-2', target: 'transfer-1' },
    ],
  },
  {
    id: 'support',
    name: 'Suporte com FAQ',
    description: 'Perguntas frequentes + transferência',
    icon: '🎯',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 300, y: 50 },
        data: { label: 'Suporte', keywords: ['ajuda', 'problema'] },
      },
      {
        id: 'message-1',
        type: 'message',
        position: { x: 300, y: 150 },
        data: { label: 'Como posso ajudar?\n\n1️⃣ Acesso ao sistema\n2️⃣ Pagamento\n3️⃣ Outro problema' },
      },
      {
        id: 'condition-1',
        type: 'condition',
        position: { x: 300, y: 270 },
        data: { label: 'Qual opção?', conditions: ['1', '2', '3'] },
      },
      {
        id: 'message-2',
        type: 'message',
        position: { x: 100, y: 390 },
        data: { label: 'Para acessar o sistema:\n1. Entre em sistema.com.br\n2. Use seu email e senha' },
      },
      {
        id: 'message-3',
        type: 'message',
        position: { x: 300, y: 390 },
        data: { label: 'Sobre pagamentos, aceitamos:\n• Cartão de crédito\n• PIX\n• Boleto' },
      },
      {
        id: 'transfer-1',
        type: 'transfer',
        position: { x: 500, y: 390 },
        data: { label: 'Falar com atendente', department: 'Suporte' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'message-1' },
      { id: 'e2', source: 'message-1', target: 'condition-1' },
      { id: 'e3', source: 'condition-1', target: 'message-2', label: '1' },
      { id: 'e4', source: 'condition-1', target: 'message-3', label: '2' },
      { id: 'e5', source: 'condition-1', target: 'transfer-1', label: '3' },
    ],
  },
];

export default function ImprovedFlowEditor() {
  const params = useParams();
  const router = useRouter();
  const flowId = params?.id as string;
  
  const [flowName, setFlowName] = useState('Novo Fluxo');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showTemplates, setShowTemplates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (flowId === 'new') {
      setShowTemplates(true);
    }
  }, [flowId]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds: Edge[]) => addEdge(params, eds));
      toast.success('Nós conectados! ✨');
    },
    [setEdges]
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const loadTemplate = (template: typeof TEMPLATES[0]) => {
    setNodes(template.nodes);
    setEdges(template.edges);
    setFlowName(template.name);
    setShowTemplates(false);
    toast.success(`Template "${template.name}" carregado!`);
  };

  const addNode = (type: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: { 
        x: Math.random() * 300 + 150, 
        y: Math.random() * 300 + 150 
      },
      data: { label: '' },
    };
    setNodes((nds: Node[]) => [...nds, newNode]);
    toast.success('Nó adicionado! Clique nele para editar.');
  };

  const duplicateNode = () => {
    if (!selectedNode) return;
    const newNode: Node = {
      ...selectedNode,
      id: `${selectedNode.type}-${Date.now()}`,
      position: {
        x: selectedNode.position.x + 50,
        y: selectedNode.position.y + 50,
      },
    };
    setNodes((nds: Node[]) => [...nds, newNode]);
    toast.success('Nó duplicado!');
  };

  const deleteNode = () => {
    if (!selectedNode) return;
    setNodes((nds: Node[]) => nds.filter((n: Node) => n.id !== selectedNode.id));
    setEdges((eds: Edge[]) => 
      eds.filter((e: Edge) => e.source !== selectedNode.id && e.target !== selectedNode.id)
    );
    setSelectedNode(null);
    toast.success('Nó removido!');
  };

  const updateNodeData = (field: string, value: any) => {
    if (!selectedNode) return;
    const updatedData = { ...selectedNode.data, [field]: value };
    setNodes((nds: Node[]) =>
      nds.map((node: Node) =>
        node.id === selectedNode.id
          ? { ...node, data: updatedData }
          : node
      )
    );
    setSelectedNode({ ...selectedNode, data: updatedData });
  };

  const saveFlow = async () => {
    try {
      setSaving(true);

      // Validações
      if (!flowName.trim()) {
        toast.error('Por favor, dê um nome ao fluxo');
        return;
      }

      if (nodes.length === 0) {
        toast.error('Adicione pelo menos um nó ao fluxo');
        return;
      }

      // Encontrar o nó gatilho
      const triggerNode = nodes.find((n: Node) => n.type === 'trigger');
      
      const flowData = {
        name: flowName,
        nodes: nodes,
        edges: edges,
        trigger: triggerNode ? {
          type: triggerNode.data.triggerType || 'any',
          value: triggerNode.data.keywords?.join(',') || '*',
        } : {
          type: 'any',
          value: '*',
        },
        isActive: false,
      };

      if (flowId === 'new') {
        // Criar novo fluxo
        const response = await api.post('/bot/flows', flowData);
        if (response.data.success) {
          toast.success('Fluxo criado com sucesso!');
          router.push('/bot-flows');
        }
      } else {
        // Atualizar fluxo existente
        const response = await api.put(`/bot/flows/${flowId}`, flowData);
        if (response.data.success) {
          toast.success('Fluxo atualizado com sucesso!');
          router.push('/bot-flows');
        }
      }
    } catch (error: any) {
      console.error('Erro ao salvar fluxo:', error);
      toast.error(error?.response?.data?.message || 'Erro ao salvar fluxo');
    } finally {
      setSaving(false);
    }
  };

  if (showTemplates) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Crie seu Fluxo de Atendimento
            </h1>
            <p className="text-gray-600">
              Escolha um template ou comece do zero
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => loadTemplate(template)}
                className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-6 text-left hover:border-indigo-500 hover:shadow-lg transition-all group"
              >
                <div className="text-4xl mb-3">{template.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-indigo-600">
                  {template.name}
                </h3>
                <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                <div className="flex items-center text-xs text-gray-500">
                  <span>{template.nodes.length} nós</span>
                  <span className="mx-2">•</span>
                  <span>{template.edges.length} conexões</span>
                </div>
              </button>
            ))}
          </div>

          <div className="text-center">
            <button
              onClick={() => {
                setNodes([
                  {
                    id: 'trigger-start',
                    type: 'trigger',
                    position: { x: 250, y: 50 },
                    data: { label: 'Início', keywords: ['oi', 'olá'] },
                  },
                ]);
                setShowTemplates(false);
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:border-indigo-500 hover:text-indigo-600 transition-colors"
            >
              Começar do Zero
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/bot-flows')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            
            <input
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="text-xl font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-2 py-1"
              placeholder="Nome do fluxo"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              title="Ajuda"
            >
              <HelpCircle className="h-5 w-5" />
            </button>

            <button
              onClick={() => toast.info('Teste em desenvolvimento')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Testar
            </button>
            
            <button
              onClick={saveFlow}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Ferramentas */}
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Componentes
            </h3>
            
            <div className="space-y-2 mb-6">
              <button
                onClick={() => addNode('trigger')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 rounded-lg hover:from-indigo-100 hover:to-purple-100 transition-all border border-indigo-200"
              >
                <div className="p-1.5 bg-indigo-100 rounded">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">Gatilho</div>
                  <div className="text-xs text-indigo-600">Inicia o fluxo</div>
                </div>
              </button>

              <button
                onClick={() => addNode('message')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-all border border-blue-200"
              >
                <div className="p-1.5 bg-blue-100 rounded">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">Mensagem</div>
                  <div className="text-xs text-blue-600">Envia texto/mídia</div>
                </div>
              </button>

              <button
                onClick={() => addNode('input')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-all border border-green-200"
              >
                <div className="p-1.5 bg-green-100 rounded">
                  <Keyboard className="h-4 w-4" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">Capturar</div>
                  <div className="text-xs text-green-600">Aguarda resposta</div>
                </div>
              </button>

              <button
                onClick={() => addNode('condition')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-all border border-yellow-200"
              >
                <div className="p-1.5 bg-yellow-100 rounded">
                  <GitBranch className="h-4 w-4" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">Condição</div>
                  <div className="text-xs text-yellow-600">Ramifica fluxo</div>
                </div>
              </button>

              <button
                onClick={() => addNode('transfer')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-all border border-purple-200"
              >
                <div className="p-1.5 bg-purple-100 rounded">
                  <Users className="h-4 w-4" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">Transferir</div>
                  <div className="text-xs text-purple-600">Para atendente</div>
                </div>
              </button>
            </div>

            {/* Propriedades do Nó */}
            {selectedNode ? (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Propriedades
                  </h3>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Fechar
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Label/Conteúdo */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {selectedNode.type === 'message' ? 'Mensagem' : 'Descrição'}
                    </label>
                    <textarea
                      value={selectedNode.data.label || ''}
                      onChange={(e) => updateNodeData('label', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      rows={4}
                      placeholder="Digite o conteúdo..."
                    />
                  </div>

                  {/* Opções específicas por tipo */}
                  {selectedNode.type === 'message' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Atraso (segundos)
                        </label>
                        <input
                          type="number"
                          value={selectedNode.data.delay || 0}
                          onChange={(e) => updateNodeData('delay', Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          min="0"
                          max="60"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedNode.data.hasMedia || false}
                            onChange={(e) => updateNodeData('hasMedia', e.target.checked)}
                            className="w-4 h-4 text-indigo-600 rounded"
                          />
                          <span className="text-sm text-gray-700">Incluir mídia</span>
                        </label>
                      </div>
                    </>
                  )}

                  {selectedNode.type === 'trigger' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          Tipo de Gatilho
                        </label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer p-2 border rounded-lg hover:bg-gray-50">
                            <input
                              type="radio"
                              name="triggerType"
                              value="any"
                              checked={selectedNode.data.triggerType === 'any' || !selectedNode.data.triggerType}
                              onChange={(e) => updateNodeData('triggerType', 'any')}
                              className="w-4 h-4 text-indigo-600"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">Universal</div>
                              <div className="text-xs text-gray-500">Responde a qualquer mensagem</div>
                            </div>
                          </label>
                          
                          <label className="flex items-center gap-2 cursor-pointer p-2 border rounded-lg hover:bg-gray-50">
                            <input
                              type="radio"
                              name="triggerType"
                              value="keywords"
                              checked={selectedNode.data.triggerType === 'keywords'}
                              onChange={(e) => updateNodeData('triggerType', 'keywords')}
                              className="w-4 h-4 text-indigo-600"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">Palavras-chave</div>
                              <div className="text-xs text-gray-500">Apenas palavras específicas</div>
                            </div>
                          </label>
                        </div>
                      </div>

                      {selectedNode.data.triggerType === 'keywords' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Palavras-chave (separadas por vírgula)
                          </label>
                          <input
                            type="text"
                            value={(selectedNode.data.keywords || []).join(', ')}
                            onChange={(e) => updateNodeData('keywords', e.target.value.split(',').map((k: string) => k.trim()).filter((k: string) => k))}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="oi, olá, começar, menu"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            O fluxo será ativado quando o cliente digitar uma dessas palavras
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {selectedNode.type === 'input' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Tipo de validação
                      </label>
                      <select
                        value={selectedNode.data.validation || 'text'}
                        onChange={(e) => updateNodeData('validation', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="text">Texto</option>
                        <option value="email">Email</option>
                        <option value="phone">Telefone</option>
                        <option value="number">Número</option>
                        <option value="cpf">CPF</option>
                      </select>
                    </div>
                  )}

                  {selectedNode.type === 'transfer' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Departamento
                      </label>
                      <select
                        value={selectedNode.data.department || ''}
                        onChange={(e) => updateNodeData('department', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Selecione...</option>
                        <option value="Vendas">Vendas</option>
                        <option value="Suporte">Suporte</option>
                        <option value="Financeiro">Financeiro</option>
                        <option value="Geral">Geral</option>
                      </select>
                    </div>
                  )}

                  {selectedNode.type === 'condition' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Condições (separadas por vírgula)
                      </label>
                      <input
                        type="text"
                        value={(selectedNode.data.conditions || []).join(', ')}
                        onChange={(e) => updateNodeData('conditions', e.target.value.split(',').map((c: string) => c.trim()))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="1, 2, 3"
                      />
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={duplicateNode}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Duplicar
                    </button>
                    <button
                      onClick={deleteNode}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-sm"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-t pt-4">
                <div className="text-center p-6 bg-gray-50 rounded-lg">
                  <HelpCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    Clique em um nó para editar suas propriedades
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Canvas do Flow */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
            connectionMode="loose"
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#6366f1', strokeWidth: 2.5 }
            }}
          >
            <Controls />
            <MiniMap 
              nodeStrokeColor={(n: Node) => {
                if (n.type === 'trigger') return '#6366f1';
                if (n.type === 'message') return '#3b82f6';
                if (n.type === 'condition') return '#eab308';
                if (n.type === 'input') return '#22c55e';
                if (n.type === 'transfer') return '#a855f7';
                return '#000';
              }}
              nodeColor={(n: Node) => {
                if (n.type === 'trigger') return '#eef2ff';
                if (n.type === 'message') return '#dbeafe';
                if (n.type === 'condition') return '#fef9c3';
                if (n.type === 'input') return '#dcfce7';
                if (n.type === 'transfer') return '#f3e8ff';
                return '#fff';
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />

            {/* Dica de Conexão - aparece quando há poucos nós */}
            {nodes.length > 0 && edges.length === 0 && (
              <Panel position="bottom-center" className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg shadow-lg p-4 max-w-md">
                <div className="text-center">
                  <div className="text-2xl mb-2">🔗</div>
                  <div className="font-semibold mb-1">Como conectar os nós:</div>
                  <div className="text-sm text-white/90">
                    1. Passe o mouse sobre um nó<br/>
                    2. Clique no <strong>círculo pequeno</strong> que aparece na borda<br/>
                    3. Arraste até outro nó e solte
                  </div>
                </div>
              </Panel>
            )}

            {/* Painel de Ajuda */}
            {showHelp && (
              <Panel position="top-right" className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-xs">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-semibold text-sm">💡 Como Usar</h4>
                  <button
                    onClick={() => setShowHelp(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-2 text-xs text-gray-600">
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-indigo-600">1.</span>
                    <span><strong>Adicione nós</strong> clicando nos botões da sidebar</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-indigo-600">2.</span>
                    <span><strong>Conecte os nós</strong> arrastando do círculo de um nó até outro</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-indigo-600">3.</span>
                    <span><strong>Edite</strong> clicando no nó e alterando as propriedades</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-indigo-600">4.</span>
                    <span><strong>Mova</strong> arrastando os nós pelo canvas</span>
                  </div>
                  <div className="mt-3 p-2 bg-indigo-50 rounded text-indigo-700">
                    <strong>Dica:</strong> Use o gatilho universal para responder a qualquer mensagem inicial!
                  </div>
                </div>
              </Panel>
            )}

            {/* Estatísticas */}
            <Panel position="top-left" className="bg-white rounded-lg shadow-sm border border-gray-200 px-3 py-2">
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <div>
                  <span className="font-medium">{nodes.length}</span> nós
                </div>
                <div>
                  <span className="font-medium">{edges.length}</span> conexões
                </div>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}