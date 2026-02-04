import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const FAQ: React.FC = () => {
  const faqs = [
    {
      question: "Quais marcas de elevadores o Elevex atende?",
      answer: "O Elevex possui uma base de dados abrangente que cobre as principais marcas nacionais e importadas, incluindo Otis, Schindler, Thyssenkrupp, Atlas, e muitas outras marcas de inversores genéricos."
    },
    {
      question: "Preciso de internet para usar o app?",
      answer: "Sim, o Elevex utiliza processamento em nuvem para garantir que você tenha acesso às informações mais atualizadas e à nossa inteligência artificial. No entanto, o consumo de dados é otimizado."
    },
    {
      question: "Como funciona o plano 'Empresa' com 5 logins?",
      answer: "O plano Empresa permite criar até 5 perfis de acesso sob uma mesma fatura. Ideal para pequenas conservadoras que querem fornecer a ferramenta para sua equipe técnica."
    },
    {
      question: "O Elevex substitui um curso técnico?",
      answer: "Não. O Elevex é uma ferramenta de suporte à decisão. Ele potencializa o conhecimento do técnico, mas o treinamento fundamental e as normas de segurança são indispensáveis."
    },
    {
      question: "Posso cancelar a minha assinatura quando quiser?",
      answer: "Sim, sem contratos de fidelidade. Você pode cancelar a qualquer momento através das configurações da sua conta."
    },
    {
      question: "O que acontece se eu não encontrar o defeito que procuro?",
      answer: "Nossa IA aprende constantemente. Se um defeito não for encontrado, você pode reportá-lo, e nossa equipe de engenharia analisará para adicionar à base de dados."
    },
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div id="faq" className="bg-slate-50 py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-extrabold text-slate-900 text-center mb-12">Perguntas Frequentes</h2>
        
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <button
                className="w-full px-6 py-4 text-left flex justify-between items-center focus:outline-none hover:bg-slate-50 transition-colors"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <span className="font-semibold text-slate-800">{faq.question}</span>
                {openIndex === index ? (
                  <ChevronUp className="h-5 w-5 text-blue-600" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                )}
              </button>
              {openIndex === index && (
                <div className="px-6 pb-4 pt-0">
                  <p className="text-slate-600 mt-2 text-sm leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FAQ;