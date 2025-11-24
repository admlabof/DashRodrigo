import React, { useState } from 'react';

interface LoginScreenProps {
  onLogin: (password: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    onLogin(password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-2xl">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-slate-900">
            Finance BI
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Painel de Controle Financeiro & Pessoas
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="password" className="sr-only">Código de Acesso</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Digite o código de acesso"
                value={password}
                onChange={(e) => {
                    setPassword(e.target.value);
                    setError(false);
                }}
              />
            </div>
          </div>

          {error && (
              <div className="text-red-500 text-xs text-center font-bold">
                  Código incorreto. Tente novamente.
              </div>
          )}

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Acessar Painel
            </button>
          </div>
        </form>
        
        <div className="text-center text-xs text-gray-400 mt-4">
            Acesso restrito a equipe autorizada.
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;