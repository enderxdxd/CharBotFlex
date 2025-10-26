'use client';

import { useState, useEffect } from 'react';
import { X, UserPlus, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface User {
  uid: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface TransferModalProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function TransferModal({ conversationId, isOpen, onClose, onSuccess }: TransferModalProps) {
  const [operators, setOperators] = useState<User[]>([]);
  const [selectedOperator, setSelectedOperator] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOperators, setLoadingOperators] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchOperators();
    }
  }, [isOpen]);

  const fetchOperators = async () => {
    try {
      setLoadingOperators(true);
      const response = await api.get('/users');
      
      if (response.data.success) {
        // Filtrar apenas operadores e admins que estão online
        const availableOperators = response.data.data.filter(
          (user: User) => user.status === 'online' || user.status === 'available'
        );
        setOperators(availableOperators);
      }
    } catch (error) {
      console.error('Erro ao buscar operadores:', error);
      toast.error('Erro ao carregar operadores');
    } finally {
      setLoadingOperators(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedOperator) {
      toast.error('Selecione um operador');
      return;
    }

    try {
      setLoading(true);
      
      const response = await api.post(`/conversations/${conversationId}/transfer`, {
        operatorId: selectedOperator,
        note: note.trim() || undefined,
      });

      if (response.data.success) {
        toast.success('Conversa transferida com sucesso!');
        onSuccess();
        onClose();
        setSelectedOperator('');
        setNote('');
      }
    } catch (error: any) {
      console.error('Erro ao transferir conversa:', error);
      toast.error(error.response?.data?.error || 'Erro ao transferir conversa');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Transferir Conversa</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Operador */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selecionar Operador *
            </label>
            {loadingOperators ? (
              <div className="text-sm text-gray-500">Carregando operadores...</div>
            ) : operators.length === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-700">Nenhum operador disponível no momento</span>
              </div>
            ) : (
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Selecione um operador</option>
                {operators.map((operator) => (
                  <option key={operator.uid} value={operator.uid}>
                    {operator.name} ({operator.email})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Observação */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Observação (opcional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Adicione informações importantes para o operador..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Esta observação será exibida para o operador que receber a conversa
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleTransfer}
            disabled={loading || !selectedOperator || loadingOperators}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Transferindo...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Transferir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
