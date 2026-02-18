import React, { useState, useRef, useEffect } from 'react';
import { Send, Cpu, AlertTriangle, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getDiagnostic } from '../services/geminiService';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

const AIChat: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: '**Bem-vindo ao Diagnóstico Elevex.** \n\nDescreva a falha, o código de erro ou os sintomas do elevador. Se possível, informe a marca e o modelo para um diagnóstico mais preciso.',
      timestamp: new Date()
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const sendingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || sendingRef.current) return;
    sendingRef.current = true;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Prepare history for API
    const history = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    // Get response
    const responseText = await getDiagnostic(userMessage.text, history);

    const modelMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, modelMessage]);
    setIsLoading(false);
    sendingRef.current = false;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-100">
      {/* Warning Banner */}
      <div className="bg-amber-500 text-white px-4 py-2 text-sm flex items-center justify-center font-medium shadow-md z-10">
        <AlertTriangle className="w-4 h-4 mr-2" />
        Atenção: Apenas para uso por profissionais qualificados. Desligue a energia antes de intervir.
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex w-full ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`flex max-w-[90%] sm:max-w-[80%] lg:max-w-[70%] ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center shadow-sm ${
                  message.role === 'user' ? 'bg-blue-600 ml-3' : 'bg-slate-800 mr-3'
                }`}
              >
                {message.role === 'user' ? (
                  <span className="text-white text-sm font-bold">VC</span>
                ) : (
                  <Cpu className="text-amber-500 w-6 h-6" />
                )}
              </div>

              {/* Bubble */}
              <div
                className={`p-4 rounded-2xl shadow-sm text-sm sm:text-base leading-relaxed overflow-hidden ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'
                }`}
              >
                 {message.role === 'model' ? (
                    <div className="prose prose-sm max-w-none prose-slate">
                         <ReactMarkdown>{message.text}</ReactMarkdown>
                    </div>
                 ) : (
                     message.text
                 )}
                <div className={`text-xs mt-2 opacity-70 ${message.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="flex items-center space-x-2 bg-white px-4 py-3 rounded-full shadow-sm border border-slate-200 ml-12">
                <div className="flex items-end gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.4s' }} />
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '180ms', animationDuration: '1.4s' }} />
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '360ms', animationDuration: '1.4s' }} />
                </div>
                <span className="text-slate-500 text-sm">escrevendo</span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white p-4 border-t border-slate-200 shadow-lg">
        <div className="max-w-4xl mx-auto relative flex items-center">
            <button 
                onClick={() => setMessages([messages[0]])}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors mr-2"
                title="Limpar conversa"
            >
                <RotateCcw className="w-5 h-5" />
            </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ex: Falha 45 no Thyssen Sur, elevador parado no térreo..."
              className="w-full bg-slate-100 text-slate-900 placeholder-slate-500 border-0 rounded-full py-3 pl-5 pr-12 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={`absolute right-1 top-1 p-2 rounded-full transition-colors ${
                !input.trim() || isLoading
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">
            A Elevex pode cometer erros. Verifique sempre as informações importantes e o manual do fabricante.
        </p>
      </div>
    </div>
  );
};

export default AIChat;