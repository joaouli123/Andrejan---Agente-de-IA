import React from 'react';
import { CheckCircle, AlertCircle, Clock, ArrowRight, Download, Home } from 'lucide-react';

interface PaymentConfirmationProps {
  status: 'approved' | 'pending' | 'rejected';
  transactionId?: string;
  email?: string;
  onDashboard: () => void;
}

const PaymentConfirmation: React.FC<PaymentConfirmationProps> = ({ 
  status = 'approved', 
  transactionId = 'MP-1234567890',
  email = 'usuario@email.com',
  onDashboard
}) => {
  const content = {
    approved: {
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-100',
      title: 'Pagamento Aprovado!',
      message: 'Sua assinatura já está ativa. Você agora tem acesso a todos os recursos premium.',
      button: 'Ir para o Dashboard',
      submessage: `Enviamos o recibo para ${email}`
    },
    pending: {
      icon: Clock,
      color: 'text-yellow-600',
      bg: 'bg-yellow-100',
      title: 'Pagamento em Processamento',
      message: 'Estamos aguardando a confirmação do seu pagamento. Isso pode levar alguns minutos.',
      button: 'Verificar Status',
      submessage: 'Avisaremos você por email assim que for confirmado'
    },
    rejected: {
      icon: AlertCircle,
      color: 'text-red-600',
      bg: 'bg-red-100',
      title: 'Pagamento Recusado',
      message: 'Houve um problema ao processar seu pagamento. Por favor, tente novamente.',
      button: 'Tentar Novamente',
      submessage: 'Verifique os dados do cartão ou tente outro método'
    }
  }[status];

  const Icon = content.icon;

  return (
    <div className='min-h-screen bg-slate-50 flex items-center justify-center p-4'>
      <div className='max-w-lg w-full bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden'>
        {/* Header Colorido */}
        <div className='h-2 bg-gradient-to-r from-blue-600 to-cyan-600'></div>
        
        <div className='p-8'>
          <div className='flex flex-col items-center text-center'>
            {/* Ícone Animado */}
            <div className='mb-6 relative'>
              <div className={`w-24 h-24 rounded-full ${content.bg} flex items-center justify-center animate-bounce-slow`}>
                <Icon size={48} className={content.color} />
              </div>
              {status === 'approved' && (
                <div className='absolute -bottom-2 -right-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg'>
                  PREMIUM
                </div>
              )}
            </div>

            <h1 className='text-3xl font-bold text-slate-900 mb-3'>
              {content.title}
            </h1>
            <p className='text-slate-600 text-lg mb-8 leading-relaxed'>
              {content.message}
            </p>

            {/* Detalhes da Transação */}
            <div className='w-full bg-slate-50 rounded-2xl p-6 mb-8 border border-slate-200'>
              <div className='flex justify-between items-center mb-4 pb-4 border-b border-slate-200'>
                <span className='text-slate-500 text-sm'>ID da Transação</span>
                <span className='text-slate-900 font-mono font-medium'>{transactionId}</span>
              </div>
              <div className='flex justify-between items-center'>
                <span className='text-slate-500 text-sm'>Data</span>
                <span className='text-slate-900 font-medium'>
                  {new Date().toLocaleDateString('pt-BR', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>

            {/* Ações */}
            <div className='w-full space-y-3'>
              <button 
                onClick={onDashboard}
                className='w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-xl font-bold text-lg text-white transition-all shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 flex items-center justify-center gap-2'
              >
                {status === 'rejected' ? 'Tentar Novamente' : 'Acessar Dashboard'}
                <ArrowRight size={20} />
              </button>

              {status === 'approved' && (
                <button className='w-full py-3 px-6 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-medium transition-colors flex items-center justify-center gap-2'>
                  <Download size={18} />
                  Baixar Recibo
                </button>
              )}
            </div>

            <p className='mt-6 text-sm text-slate-400'>
              {content.submessage}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentConfirmation;
