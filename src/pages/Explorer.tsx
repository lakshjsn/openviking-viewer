import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api/client';
import {
  Folder, FileText, ChevronRight, ArrowUp,
  RefreshCw, Eye, Clock, Hash, Loader2, Home,
} from 'lucide-react';

interface TreeNode {
  uri: string;
  size: number;
  isDir: boolean;
  modTime: string;
  rel_path: string;
  abstract: string;
}

interface FileContent {
  ok?: boolean;
  raw?: string;
  result?: string;
}

function uriToSegments(uri: string): string[] {
  const withoutProtocol = uri.replace('viking://', '');
  return withoutProtocol.split('/').filter(Boolean);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 检测文件是否为 JSONL 格式，并解析为可读的消息列表
function parseJsonl(text: string): { role: string; text: string }[] | null {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return null;
  
  const messages: { role: string; text: string }[] = [];
  let validJsonCount = 0;
  
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      validJsonCount++;
      
      // 尝试提取消息信息（多种格式支持）
      if (obj.role && obj.parts) {
        // messages.jsonl 格式: { role, parts: [{ type: 'text', text: ... }] }
        const textParts = obj.parts
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('\n');
        if (textParts) {
          messages.push({ role: obj.role, text: textParts });
        }
      } else if (obj.role && obj.content) {
        // 通用格式: { role, content }
        messages.push({ role: obj.role, text: typeof obj.content === 'string' ? obj.content : JSON.stringify(obj.content) });
      } else if (obj.role) {
        // 如果只有 role，把整个对象转成字符串显示
        messages.push({ role: obj.role, text: JSON.stringify(obj) });
      } else {
        // 不是消息格式，作为通用行显示
        messages.push({ role: 'data', text: JSON.stringify(obj, null, 2) });
      }
    } catch {
      // 某一行不是 JSON，说明不是标准 JSONL 或有格式问题
      // 如果大部分行都是 JSON，继续处理；否则认为不是 JSONL
      if (validJsonCount === 0) {
        return null; // 没有任何有效 JSON 行
      }
    }
  }
  
  // 如果我们成功解析了至少一些行，返回结果
  return messages.length > 0 ? messages : null;
}

function JsonlViewer({ messages }: { messages: { role: string; text: string }[] }) {
  return (
    <div className="space-y-3">
      {messages.map((msg, i) => (
        <div key={i} className="border border-[var(--border)] rounded-lg overflow-hidden">
          <div className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider ${
            msg.role === 'user' ? 'bg-gray-50 text-gray-500' :
            msg.role === 'assistant' ? 'bg-gray-100 text-gray-600' :
            'bg-gray-50 text-gray-400'
          }`}>
            {msg.role}
          </div>
          <div className="px-3 py-2 text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
            {msg.text}
          </div>
        </div>
      ))}
    </div>
  );
}

function getFileName(item: TreeNode): string {
  const path = item.rel_path || item.uri || '';
  return path.split('/').pop() || path;
}

export function Explorer() {
  const [currentUri, setCurrentUri] = useState('viking://');
  const [items, setItems] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [content, setContent] = useState<{ level: 'abstract' | 'overview' | 'read' | 'error'; text: string } | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['viking://']));

  const fetchItems = useCallback(async (uri: string) => {
    setLoading(true);
    try {
      const data = await apiGet<{ ok: boolean; result: TreeNode[] }>('/api/ls', { uri });
      const sorted = (data.result || []).sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        const aName = getFileName(a);
        const bName = getFileName(b);
        return aName.localeCompare(bName);
      });
      setItems(sorted);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(currentUri);
  }, [currentUri, fetchItems]);

  const navigate = (uri: string) => {
    setCurrentUri(uri);
    setSelectedUri(null);
    setContent(null);
  };

  const handleSelectFile = async (uri: string) => {
    setSelectedUri(uri);
    setContentLoading(true);
    setContent(null);
    try {
      // 文件 URI 直接用 /api/read 读取原文（ov abstract 只接受目录 URI）
      const data = await apiGet<FileContent>('/api/read', { uri });
      const text = data.raw || data.result || '';

      setContent({ level: 'read', text: text || '(空内容)' });
    } catch (e: any) {
      setContent({ level: 'error' as const, text: e.message || '无法读取文件' });
    } finally {
      setContentLoading(false);
    }
  };

  const handleLoadFull = async () => {
    if (!selectedUri) return;
    setContentLoading(true);
    try {
      // 直接加载原文
      const data = await apiGet<FileContent>('/api/read', { uri: selectedUri });
      const text = data.raw || data.result || '(空内容)';
      setContent({ level: 'read', text });
    } catch (e: any) {
      setContent({ level: 'error' as const, text: e.message });
    } finally {
      setContentLoading(false);
    }
  };

  const segments = uriToSegments(currentUri);

  const topDirs = [
    { name: 'agent', uri: 'viking://agent', desc: 'Agent 记忆与学习' },
    { name: 'user', uri: 'viking://user', desc: '用户偏好与实体' },
    { name: 'session', uri: 'viking://session', desc: '会话历史记录' },
    { name: 'resources', uri: 'viking://resources', desc: '导入的资源文档' },
  ];

  const isTopLevel = currentUri === 'viking://';

  const toggleDir = (uri: string) => {
    if (expandedDirs.has(uri)) {
      const newSet = new Set(expandedDirs);
      newSet.delete(uri);
      setExpandedDirs(newSet);
    } else {
      const newSet = new Set(expandedDirs);
      newSet.add(uri);
      setExpandedDirs(newSet);
    }
  };

  return (
    <div className="flex h-full gap-0">
      {/* Left: Directory Tree Navigation */}
      <div className="w-48 flex flex-col bg-white border-r border-[var(--border)]">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
          <button
            onClick={() => navigate('viking://')}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="返回根目录"
          >
            <Home size={14} />
          </button>
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">导航</span>
        </div>
        <div className="flex-1 overflow-auto p-2">
          <div className="space-y-0">
            {topDirs.map(dir => {
              const isExpanded = expandedDirs.has(dir.uri);
              return (
                <div key={dir.uri}>
                  <button
                    onClick={() => {
                      toggleDir(dir.uri);
                      navigate(dir.uri);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors text-left ${
                      currentUri === dir.uri
                        ? 'bg-black text-white'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <ChevronRight size={12} className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    <Folder size={12} className="flex-shrink-0" />
                    <span className="truncate">{dir.name}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-3 py-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
          根目录: {items.filter(i => i.isDir).length + items.filter(i => !i.isDir).length}
        </div>
      </div>

      {/* Middle: File List */}
      <div className="flex-1 flex flex-col bg-white border-r border-[var(--border)]">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]">
          <button
            onClick={() => {
              const parent = currentUri.substring(0, currentUri.lastIndexOf('/'));
              if (parent && parent.startsWith('viking://')) navigate(parent);
            }}
            disabled={currentUri === 'viking://'}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30"
            title="返回上一级"
          >
            <ArrowUp size={14} />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs flex-1 overflow-x-auto">
            <button
              onClick={() => navigate('viking://')}
              className="text-[var(--text-muted)] hover:text-black hover:underline flex-shrink-0 font-mono text-[10px]"
            >
              /
            </button>
            {segments.map((seg, i) => {
              const uri = 'viking://' + segments.slice(0, i + 1).join('/');
              const isLast = i === segments.length - 1;
              return (
                <span key={uri} className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-[var(--text-muted)]">/</span>
                  {isLast ? (
                    <span className="text-[var(--text-primary)] font-medium text-[10px]">{seg}</span>
                  ) : (
                    <button
                      onClick={() => navigate(uri)}
                      className="text-[var(--text-muted)] hover:text-black hover:underline text-[10px]"
                    >
                      {seg}
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          <button
            onClick={() => fetchItems(currentUri)}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <div className="space-y-px">
              {items.map(item => {
                const fileName = getFileName(item);
                return (
                  <div
                    key={item.uri}
                    onClick={() => item.isDir ? navigate(item.uri) : handleSelectFile(item.uri)}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md cursor-pointer transition-all text-[12px] ${
                      selectedUri === item.uri
                        ? 'bg-black text-white'
                        : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    }`}
                  >
                    {item.isDir ? (
                      <Folder size={14} className="flex-shrink-0" />
                    ) : (
                      <FileText size={14} className="flex-shrink-0 opacity-60" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{fileName}</div>
                      {item.abstract && (
                        <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                          {item.abstract}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] flex-shrink-0 font-mono">
                      {!item.isDir && (
                        <span>{formatSize(item.size)}</span>
                      )}
                    </div>
                    {item.isDir && (
                      <ChevronRight size={12} className="text-[var(--text-muted)] flex-shrink-0" />
                    )}
                  </div>
                );
              })}
              {items.length === 0 && (
                <div className="text-center py-12 text-[var(--text-muted)] text-sm">此目录为空</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] flex items-center gap-3 font-mono">
          <span>{items.filter(i => i.isDir).length} dirs</span>
          <span>{items.filter(i => !i.isDir).length} files</span>
        </div>
      </div>

      {/* Right: Content Preview */}
      <div className="w-96 flex flex-col bg-white">
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">预览</span>
          {content && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] font-mono">
                {content.level}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {contentLoading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
            </div>
          )}
          {!contentLoading && !content && (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
              <Eye size={32} className="mb-3 opacity-20" />
              <p className="text-xs">点击文件查看内容</p>
              <p className="text-[10px] mt-1 text-[var(--text-muted)]">摘要 → 概览 → 原文</p>
            </div>
          )}
          {!contentLoading && content && content.level === 'error' && (
            <div className="text-xs text-red-500">加载失败: {content.text}</div>
          )}
          {!contentLoading && content && content.level !== 'error' && (() => {
            const isJsonl = selectedUri?.endsWith('.jsonl');
            const jsonlMessages = isJsonl ? parseJsonl(content.text) : null;

            if (jsonlMessages) {
              return <JsonlViewer messages={jsonlMessages} />;
            }

            // 尝试检测 JSON 并美化
            if (content.text.trim().startsWith('{') || content.text.trim().startsWith('[')) {
              try {
                const parsed = JSON.parse(content.text);
                const formatted = JSON.stringify(parsed, null, 2);
                return <pre className="text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-words font-mono leading-relaxed">{formatted}</pre>;
              } catch {
                // 不是有效 JSON，降级为纯文本
              }
            }

            return (
              <pre className="text-xs text-[var(--text-primary)] whitespace-pre-wrap break-words font-sans leading-relaxed">
                {content.text}
              </pre>
            );
          })()}
        </div>

        {selectedUri && (
          <div className="px-4 py-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] truncate font-mono">
            {selectedUri}
          </div>
        )}
      </div>
    </div>
  );
}
