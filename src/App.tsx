import React, { useState } from 'react';
import { Settings, Info } from 'lucide-react';
import { SweeperPage } from './components/SweeperPage';
import { RelayerPage } from './components/RelayerPage';

type Page = 'sweeper' | 'relayer';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('sweeper');

  const pages = [
    { id: 'sweeper' as Page, name: 'Sweeper Контракт', icon: Settings },
    { id: 'relayer' as Page, name: 'Информация о Релейере', icon: Info },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#111111]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          {/* Navigation */}
          <nav className="flex items-center gap-1">
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
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {currentPage === 'sweeper' && <SweeperPage />}
        {currentPage === 'relayer' && <RelayerPage />}
      </div>
    </div>
  );
}

export default App;