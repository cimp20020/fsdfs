import React, { useState } from 'react';
import { Wrench, Server, Shield } from 'lucide-react';
import { AuthorizationPage } from './components/AuthorizationPage';
import { SweeperPage } from './components/SweeperPage';
import { RelayerPage } from './components/RelayerPage';

type Page = 'authorization' | 'sweeper' | 'relayer';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('authorization');

  const pages = [
    { id: 'authorization' as Page, name: 'Авторизация', icon: Shield },
    { id: 'sweeper' as Page, name: 'Управление', icon: Wrench },
    { id: 'relayer' as Page, name: 'Мониторинг', icon: Server },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#111111] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          {/* Navigation */}
          <nav className="flex items-center justify-center gap-1">
              {pages.map((page) => {
                const IconComponent = page.icon;
                return (
                  <button
                    key={page.id}
                    onClick={() => setCurrentPage(page.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === page.id
                        ? 'bg-[#222225] text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                    {page.name}
                  </button>
                );
              })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {currentPage === 'authorization' && <AuthorizationPage />}
        {currentPage === 'sweeper' && <SweeperPage />}
        {currentPage === 'relayer' && <RelayerPage />}
      </main>
    </div>
  );
}

export default App;