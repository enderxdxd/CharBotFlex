export interface ISystemSettings {
  id: string;
  messages: {
    greetingDepartment: string; // Mensagem ao transferir para departamento
    greetingUser: string; // Mensagem ao transferir para usuário específico
    noExpectedResponse: string; // Mensagem quando resposta não corresponde ao esperado
    fallback: string; // Mensagem padrão de fallback
    queueWaiting: string; // Mensagem de espera na fila
    offlineMessage: string; // Mensagem quando ninguém está disponível
  };
  general: {
    companyName: string;
    supportEmail: string;
    supportPhone: string;
    workingHours: string;
  };
  bot: {
    enabled: boolean;
    defaultTimeout: number; // Tempo em minutos para timeout
    maxRetries: number; // Máximo de tentativas antes de transferir
  };
  autoClose: {
    enabled: boolean;
    inactivityTimeout: number; // Tempo em minutos de inatividade antes de fechar
    sendWarningMessage: boolean; // Enviar mensagem de aviso antes de fechar
    warningTimeBeforeClose: number; // Tempo em minutos antes de fechar para enviar aviso
    closureMessage: string; // Mensagem ao fechar por inatividade
  };
  updatedAt: Date;
  updatedBy: string;
}

export const DEFAULT_MESSAGES = {
  greetingDepartment: 'Olá! Você foi direcionado para o departamento de {departmentName}. Em breve um de nossos atendentes irá te responder. 😊',
  greetingUser: 'Olá! Você está sendo atendido por {userName}. Como posso ajudar? 😊',
  noExpectedResponse: 'Desculpe, não entendi sua resposta. Por favor, escolha uma das opções disponíveis ou digite "menu" para ver as opções novamente.',
  fallback: 'Desculpe, não consegui entender. Você pode reformular sua pergunta ou digitar "atendente" para falar com um humano.',
  queueWaiting: 'Você está na posição {position} da fila. Tempo estimado de espera: {estimatedTime} minutos. Agradecemos sua paciência! ⏱️',
  offlineMessage: 'No momento estamos fora do horário de atendimento. Nosso horário é: {workingHours}. Deixe sua mensagem que retornaremos em breve!',
};
