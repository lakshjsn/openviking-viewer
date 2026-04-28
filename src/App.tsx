import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Search } from './pages/Search';
import { Relations } from './pages/Relations';
import { Storage } from './pages/Storage';
import { apiGet } from './api/client';
import {
  Activity,
  Search as SearchIcon,
  GitBranch,
  RefreshCw,
  HardDrive,
} from 'lucide-react';

export default function App() {
  const [health, setHealth] = useState<'ok' | 'error' | 'loading'>('loading');

  const checkHealth = useCallback(async () => {
    setHealth('loading');
    try {
      await apiGet('/api/health');
      setHealth('ok');
    } catch {
      setHealth('error');
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 30000);
    return () => clearInterval(timer);
  }, [checkHealth]);

  const navItems = [
    { to: '/', icon: Activity, label: '仪表盘' },
    { to: '/search', icon: SearchIcon, label: '搜索' },
    { to: '/relations', icon: GitBranch, label: '关系图谱' },
    { to: '/storage', icon: HardDrive, label: '存储' },
  ];

  return (
    <HashRouter>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-[var(--border)] px-6 py-2.5 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-black flex items-center justify-center">
              <span className="text-white font-bold text-xs font-serif">V</span>
            </div>
            <h1 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
              OpenViking
              <span className="text-[var(--text-muted)] ml-1.5 text-sm font-normal">Viewer</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <div className={`w-1.5 h-1.5 rounded-full ${
                health === 'ok' ? 'bg-green-500' :
                health === 'error' ? 'bg-red-500' :
                'bg-yellow-400 animate-pulse'
              }`} />
              <span className="text-[var(--text-muted)]">
                {health === 'ok' ? '已连接' : health === 'error' ? '连接失败' : '检测中...'}
              </span>
            </div>
            <button
              onClick={checkHealth}
              className="p-1 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-muted)]"
              title="刷新状态"
            >
              <RefreshCw size={14} className={health === 'loading' ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <nav className="flex-shrink-0 w-44 border-r border-[var(--border)] py-3 px-2.5 flex flex-col gap-0.5 bg-white">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-all ${
                    isActive
                      ? 'bg-black text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>

          <main className="flex-1 overflow-auto bg-[var(--bg-secondary)]">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/search" element={<Search />} />
              <Route path="/relations" element={<Relations />} />
              <Route path="/storage" element={<Storage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  );
}
