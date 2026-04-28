import { useState, useCallback } from 'react';
import { apiGet } from '../api/client';
import {
  Search as SearchIcon, Loader2, Sparkles, FileText, Target, Star,
  Clock, ArrowRight, Filter, X, Hash,
} from 'lucide-react';

interface SearchResult {
  context_type: string;
  uri: string;
  level: number;
  score: number;
  category: string;
  match_reason: string;
  relations: string[];
  abstract: string;
  overview: string | null;
}

interface FindResponse {
  ok: boolean;
  result: {
    memories?: SearchResult[];
    resources?: SearchResult[];
    sessions?: SearchResult[];
    skills?: SearchResult[];
    [key: string]: any;
  };
}

function scoreColor(score: number): string {
  if (score >= 0.6) return 'text-green-600';
  if (score >= 0.5) return 'text-yellow-600';
  if (score >= 0.4) return 'text-orange-500';
  return 'text-red-500';
}

function scoreBarColor(score: number): string {
  if (score >= 0.6) return 'bg-green-500';
  if (score >= 0.5) return 'bg-yellow-500';
  if (score >= 0.4) return 'bg-orange-400';
  return 'bg-red-400';
}

function levelBadge(level: number) {
  const map: Record<number, { label: string; color: string }> = {
    0: { label: 'L0', color: 'bg-gray-100 text-gray-600' },
    1: { label: 'L1', color: 'bg-gray-100 text-gray-600' },
    2: { label: 'L2', color: 'bg-gray-100 text-gray-600' },
  };
  const info = map[level] || { label: `L${level}`, color: 'bg-gray-100 text-gray-600' };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${info.color}`}>{info.label}</span>;
}

function typeBadge(type: string) {
  const map: Record<string, { label: string; icon: any }> = {
    memory: { label: '记忆', icon: Sparkles },
    resource: { label: '资源', icon: FileText },
    session: { label: '会话', icon: Clock },
  };
  const info = map[type] || { label: type, icon: Hash };
  const Icon = info.icon;
  return <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]"><Icon size={11} />{info.label}</span>;
}

export function Search() {
  const [query, setQuery] = useState('');
  const [scopeUri, setScopeUri] = useState('');
  const [results, setResults] = useState<FindResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<'find' | 'search'>('find');
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [detailContent, setDetailContent] = useState<{ level: string; text: string } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleSearch = useCallback(async (q?: string) => {
    const searchTerm = q || query;
    if (!searchTerm.trim()) return;
    setLoading(true);
    setSelectedResult(null);
    setDetailContent(null);
    try {
      if (searchMode === 'find') {
        const params: Record<string, string> = { q: searchTerm, n: '20' };
        if (scopeUri) params.uri = scopeUri;
        const data = await apiGet<FindResponse>('/api/find', params);
        setResults(data);
      } else {
        const data = await apiGet<any>('/api/search', { q: searchTerm });
        setResults(data);
      }
    } catch (e: any) {
      console.error('Search failed:', e);
    } finally {
      setLoading(false);
    }
  }, [query, scopeUri, searchMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleSelectResult = async (result: SearchResult) => {
    setSelectedResult(result);
    setDetailLoading(true);
    setDetailContent(null);
    try {
      // 搜索结果的 URI 可能是文件也可能是目录，统一用 /api/read 读取
      const data = await apiGet<any>('/api/read', { uri: result.uri });
      setDetailContent({ level: 'read', text: data.raw || data.result || '(空)' });
    } catch (e: any) {
      setDetailContent({ level: 'error', text: e.message });
    } finally {
      setDetailLoading(false);
    }
  };

  const allResults: SearchResult[] = [
    ...(results?.result?.memories || []),
    ...(results?.result?.resources || []),
    ...(results?.result?.sessions || []),
    ...(results?.result?.skills || []),
  ];

  return (
    <div className="flex h-full">
      {/* Left */}
      <div className="flex-1 flex flex-col">
        {/* Search Bar */}
        <div className="p-5 border-b border-[var(--border)] bg-white">
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text" value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="语义搜索..."
                className="w-full pl-10 pr-10 py-2.5 border border-[var(--border)] rounded-lg text-sm bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-black transition-colors"
                autoFocus
              />
              {query && (
                <button onClick={() => { setQuery(''); setResults(null); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5 mt-2.5">
              <div className="flex items-center border border-[var(--border)] rounded-md p-0.5">
                {(['find', 'search'] as const).map(mode => (
                  <button key={mode} onClick={() => setSearchMode(mode)}
                    className={`px-2.5 py-1 text-[11px] rounded transition-all ${
                      searchMode === mode ? 'bg-black text-white' : 'text-[var(--text-secondary)] hover:text-black'
                    }`}>
                    {mode === 'find' ? '语义检索' : '上下文感知'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 flex-1">
                <Filter size={12} className="text-[var(--text-muted)]" />
                <select value={scopeUri} onChange={e => setScopeUri(e.target.value)}
                  className="flex-1 text-[11px] bg-transparent border border-[var(--border)] rounded-md px-2 py-1 text-[var(--text-secondary)] focus:outline-none focus:border-black">
                  <option value="">全部范围</option>
                  <option value="viking://agent">Agent</option>
                  <option value="viking://user">User</option>
                  <option value="viking://session">Session</option>
                  <option value="viking://resources">Resources</option>
                </select>
              </div>

              <button onClick={() => handleSearch()} disabled={loading || !query.trim()}
                className="px-3 py-1 bg-black hover:bg-gray-800 disabled:bg-gray-300 rounded-md text-xs text-white transition-colors flex items-center gap-1">
                {loading ? <Loader2 size={11} className="animate-spin" /> : <SearchIcon size={11} />}
                搜索
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center h-40">
              <div className="flex flex-col items-center gap-1.5">
                <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-muted)]">搜索中...</span>
              </div>
            </div>
          )}

          {!loading && results && (
            <div className="p-5 max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[var(--text-muted)]">
                  找到 <span className="text-black font-medium">{allResults.length}</span> 条结果
                </span>
                <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                  {((results.result.memories?.length || 0) > 0) && <span>记忆 {results.result.memories!.length}</span>}
                  {((results.result.resources?.length || 0) > 0) && <span>资源 {results.result.resources!.length}</span>}
                  {((results.result.sessions?.length || 0) > 0) && <span>会话 {results.result.sessions!.length}</span>}
                  {((results.result.skills?.length || 0) > 0) && <span>技能 {results.result.skills!.length}</span>}
                </div>
              </div>

              <div className="space-y-1.5">
                {allResults.map((result, i) => (
                  <div key={result.uri + i} onClick={() => handleSelectResult(result)}
                    className={`border rounded-lg p-3 cursor-pointer transition-all ${
                      selectedResult?.uri === result.uri ? 'border-black bg-[var(--bg-tertiary)]' : 'border-[var(--border)] hover:border-[var(--border-hover)] bg-white'
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 text-center w-10 pt-0.5">
                        <div className={`text-base font-bold font-mono ${scoreColor(result.score)}`}>
                          {(result.score * 100).toFixed(0)}
                        </div>
                        <div className="w-full h-0.5 bg-[var(--bg-tertiary)] rounded-full mt-1 overflow-hidden">
                          <div className={`h-full rounded-full ${scoreBarColor(result.score)}`}
                            style={{ width: `${Math.max(result.score * 100, 5)}%` }} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {typeBadge(result.context_type)}
                          {levelBadge(result.level)}
                        </div>
                        <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                          {result.abstract || result.uri.split('/').pop()}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1 truncate font-mono">{result.uri}</p>
                      </div>
                      <ArrowRight size={14} className="text-[var(--text-muted)] flex-shrink-0 mt-1" />
                    </div>
                  </div>
                ))}

                {allResults.length === 0 && (
                  <div className="text-center py-16 text-[var(--text-muted)]">
                    <SearchIcon size={32} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">未找到相关结果</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && !results && (
            <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
              <Sparkles size={36} className="mb-2 opacity-15" />
              <p className="text-sm">输入关键词搜索知识库</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {['React', '组件', '踩坑', 'SSR', 'API'].map(tag => (
                  <button key={tag} onClick={() => { setQuery(tag); handleSearch(tag); }}
                    className="px-2.5 py-1 text-[11px] border border-[var(--border)] rounded-full text-[var(--text-secondary)] hover:text-black hover:border-black transition-colors">
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="w-[380px] flex flex-col border-l border-[var(--border)] bg-white">
        <div className="px-4 py-2.5 border-b border-[var(--border)]">
          <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">Detail</span>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {detailLoading && <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-[var(--text-muted)]" /></div>}
          {!detailLoading && !selectedResult && (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
              <Target size={32} className="mb-2 opacity-20" />
              <p className="text-xs">点击搜索结果查看详情</p>
            </div>
          )}
          {!detailLoading && selectedResult && detailContent && (
            <div className="space-y-3 animate-fade-in">
              <div className="border border-[var(--border)] rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  {typeBadge(selectedResult.context_type)}
                  {levelBadge(selectedResult.level)}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  <div className="flex items-center gap-1">
                    <Star size={10} /> Score: <span className={`font-mono ${scoreColor(selectedResult.score)}`}>{(selectedResult.score * 100).toFixed(1)}%</span>
                  </div>
                  <div className="truncate font-mono mt-0.5">{selectedResult.uri}</div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    内容
                  </span>
                </div>
                <div className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words">{detailContent.text}</div>
              </div>

              {selectedResult.relations && selectedResult.relations.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">关联 ({selectedResult.relations.length})</span>
                  <div className="mt-1 space-y-0.5">
                    {selectedResult.relations.map((rel, i) => (
                      <div key={i} className="text-[11px] text-[var(--text-muted)] truncate px-2 py-1 rounded bg-[var(--bg-tertiary)] font-mono">{rel}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
