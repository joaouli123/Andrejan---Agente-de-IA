import React, { useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, Building, Mail, User, Lock } from 'lucide-react';
import { Plan } from './Pricing';

interface RegisterProps {
  plan: Plan;
  onSuccess: (data: any) => void;
  onBack: () => void;
}

const Register: React.FC<RegisterProps> = ({ plan, onSuccess, onBack }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name) newErrors.name = 'Nome é obrigatório';
    if (!formData.email) newErrors.email = 'Email é obrigatório';
    if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email inválido';
    if (!formData.password) newErrors.password = 'Senha é obrigatória';
    if (formData.password.length < 6) newErrors.password = 'A senha deve ter pelo menos 6 caracteres';
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'As senhas não coincidem';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSuccess(formData);
    }
  };

  return (
    <div className='min-h-screen bg-slate-50 flex'>
      {/* Left Side - Form */}
      <div className='flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24'>
        <div className='mx-auto w-full max-w-sm lg:w-96'>
          <button 
            onClick={onBack}
            className='flex items-center text-slate-600 hover:text-slate-900 mb-8 transition-colors'
          >
            <ArrowLeft className='h-4 w-4 mr-2' />
            Voltar
          </button>
          
          <div>
            <h2 className='mt-6 text-3xl font-extrabold text-slate-900'>Crie sua conta</h2>
            <p className='mt-2 text-sm text-slate-600'>
              Para assinar o plano <span className='font-bold text-blue-600'>{plan.name}</span>
            </p>
          </div>

          <div className='mt-8'>
            <form onSubmit={handleSubmit} className='space-y-6'>
              <div>
                <label htmlFor='name' className='block text-sm font-medium text-slate-700'>
                  Nome completo
                </label>
                <div className='mt-1 relative rounded-md shadow-sm'>
                  <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
                    <User className='h-5 w-5 text-slate-400' />
                  </div>
                  <input
                    id='name'
                    name='name'
                    type='text'
                    autoComplete='name'
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className={`focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md p-3 border ${errors.name ? 'border-red-300' : ''}`}
                    placeholder='Seu nome'
                  />
                </div>
                {errors.name && <p className='mt-2 text-sm text-red-600'>{errors.name}</p>}
              </div>

              <div>
                <label htmlFor='email' className='block text-sm font-medium text-slate-700'>
                  Email profissional
                </label>
                <div className='mt-1 relative rounded-md shadow-sm'>
                  <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
                    <Mail className='h-5 w-5 text-slate-400' />
                  </div>
                  <input
                    id='email'
                    name='email'
                    type='email'
                    autoComplete='email'
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className={`focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md p-3 border ${errors.email ? 'border-red-300' : ''}`}
                    placeholder='voce@empresa.com'
                  />
                </div>
                {errors.email && <p className='mt-2 text-sm text-red-600'>{errors.email}</p>}
              </div>

              <div>
                <label htmlFor='company' className='block text-sm font-medium text-slate-700'>
                  Empresa (Opcional)
                </label>
                <div className='mt-1 relative rounded-md shadow-sm'>
                  <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
                    <Building className='h-5 w-5 text-slate-400' />
                  </div>
                  <input
                    id='company'
                    name='company'
                    type='text'
                    value={formData.company}
                    onChange={handleChange}
                    className='focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md p-3 border'
                    placeholder='Sua empresa'
                  />
                </div>
              </div>

              <div>
                <label htmlFor='password' className='block text-sm font-medium text-slate-700'>
                  Senha
                </label>
                <div className='mt-1 relative rounded-md shadow-sm'>
                  <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
                    <Lock className='h-5 w-5 text-slate-400' />
                  </div>
                  <input
                    id='password'
                    name='password'
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className={`focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 pr-10 sm:text-sm border-slate-300 rounded-md p-3 border ${errors.password ? 'border-red-300' : ''}`}
                    placeholder='******'
                  />
                  <div className='absolute inset-y-0 right-0 pr-3 flex items-center'>
                    <button
                      type='button'
                      onClick={() => setShowPassword(!showPassword)}
                      className='text-slate-400 hover:text-slate-500 focus:outline-none'
                    >
                      {showPassword ? <EyeOff className='h-5 w-5' /> : <Eye className='h-5 w-5' />}
                    </button>
                  </div>
                </div>
                {errors.password && <p className='mt-2 text-sm text-red-600'>{errors.password}</p>}
              </div>

              <div>
                <label htmlFor='confirmPassword' className='block text-sm font-medium text-slate-700'>
                  Confirmar Senha
                </label>
                <div className='mt-1 relative rounded-md shadow-sm'>
                  <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
                    <Lock className='h-5 w-5 text-slate-400' />
                  </div>
                  <input
                    id='confirmPassword'
                    name='confirmPassword'
                    type='password'
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className={`focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md p-3 border ${errors.confirmPassword ? 'border-red-300' : ''}`}
                    placeholder='******'
                  />
                </div>
                {errors.confirmPassword && <p className='mt-2 text-sm text-red-600'>{errors.confirmPassword}</p>}
              </div>

              <div>
                <button
                  type='submit'
                  className='w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                >
                  Continuar para Pagamento
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Right Side - Summary */}
      <div className='hidden lg:block relative flex-1 bg-slate-900'>
        <div className='absolute inset-0 flex flex-col justify-center items-center text-white p-12'>
            <div className='max-w-md space-y-8'>
                 <div>
                    <h3 className='text-3xl font-bold'>Você escolheu o plano {plan.name}</h3>
                    <p className='mt-4 text-slate-300 text-lg'>
                        Desbloqueie todo o potencial da IA para o seu negócio.
                    </p>
                 </div>

                 <div className='bg-slate-800 rounded-xl p-6 border border-slate-700'>
                    <div className='flex justify-between items-center mb-4'>
                         <span className='text-xl font-semibold'>Total</span>
                         <span className='text-2xl font-bold'>R$ {plan.price.toFixed(2)}<span className='text-sm font-normal text-slate-400'>/{plan.period}</span></span>
                    </div>
                    <ul className='space-y-3'>
                        {plan.features.map((feature, idx) => (
                            <li key={idx} className='flex items-center text-slate-300'>
                                <Check className='h-5 w-5 text-green-400 mr-2' />
                                {feature}
                            </li>
                        ))}
                    </ul>
                 </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Register;