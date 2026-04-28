import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiDelete, apiPost } from '../api/client';
import {
  HardDrive, Folder, FileText, Database, Box, ArrowUp,
  ChevronRight, RefreshCw, Loader2, Eye, Clock, Hash,
  Search as SearchIcon, Layers, Tag, GitBranch, ChevronDown,
  Inbox, MessageSquare, User, Bot, Calendar, Brain, Trash2, AlertTriangle,
  RotateCcw,
} from 'lucide-react';

// ========== 通用类型 ==========
interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: string;
  relPath: string;
}

interface QueueStat {
  queue_name: string;
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

interface QueueMessage {
  id: number;
  queue_name: string;
  message_id: string;
  data_preview: string;
  timestamp: number;
  status: string;
  time_str: string;
}

interface VectorVersion {
  version: string;
  size: string;
  meta: any;
}

interface VectorDBData {
  ok: boolean;
  collection: any;
  index: any;
  diskUsage: { store?: string; index?: string };
  versions?: VectorVersion[];
}

interface QueueData {
  ok: boolean;
  summary: QueueStat[];
  recent: QueueMessage[];
  schema: string;
}

// ========== 工具函数 ==========
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoStr;
  }
}

// ========== Tab 类型 ==========
type TabId = 'files' | 'queue' | 'vectordb' | 'sessions';

const TABS: { id: TabId; label: string; icon: any; desc: string }[] = [
  { id: 'files', label: '文件浏览器', icon: Folder, desc: '~/.openviking/workspace/ 完整目录' },
  { id: 'queue', label: 'SQLite 队列', icon: Database, desc: 'queue.db 消息队列数据' },
  { id: 'vectordb', label: '向量数据库', icon: Box, desc: 'VikingDB 向量索引元数据' },
  { id: 'sessions', label: 'Session 对话', icon: MessageSquare, desc: 'OpenViking 会话记录与消息' },
];

// ========== OpenViking 默认基础目录保护 ==========
// 与后端 server/routes/workspace.js 的 RESERVED_DIRS 保持同步
const RESERVED_PATHS = new Set([
  // === 一级系统目录（workspace直下）===
  '_system',
  'vectordb',
  'viking',

  // === Viking默认实例下的基础目录 ===
  'viking/default/agent',
  'viking/default/user',
  'viking/default/session',
  'viking/default/resources',

  // === Viking系统目录 ===
  'viking/_system',
]);

/** 判断路径是否为受保护的默认目录 */
function isReservedPath(relPath: string): boolean {
  const normalized = relPath.replace(/^\/+/, '');
  if (RESERVED_PATHS.has(normalized)) return true;
  for (const reserved of RESERVED_PATHS) {
    if (normalized.startsWith(reserved + '/')) return true;
  }
  return false;
}

// ========== 文件浏览器 ==========
function FileBrowser() {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState<{ name: string; size: number; content: string; truncated?: boolean } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [pathStack, setPathStack] = useState<string[]>(['']);

  // 删除相关状态
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDir = useCallback(async (dirPath: string) => {
    setLoading(true);
    try {
      const data = await apiGet<{ ok: boolean; path: string; items: FileEntry[] }>('/api/workspace/ls', { path: dirPath });
      setItems(data.items || []);
      setCurrentPath(data.path || dirPath);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // FileBrowser 作为默认首屏 Tab，直接加载
  useEffect(() => {
    fetchDir('');
  }, [fetchDir]);

  const navigateTo = (dirPath: string) => {
    setSelectedFile(null);
    setFileContent(null);
    setPathStack(prev => [...prev, dirPath]);
    fetchDir(dirPath);
  };

  const goBack = () => {
    if (pathStack.length <= 1) return;
    const newStack = [...pathStack];
    newStack.pop();
    const parent = newStack[newStack.length - 1];
    setPathStack(newStack);
    setSelectedFile(null);
    setFileContent(null);
    fetchDir(parent);
  };

  // 删除文件/目录（同时清理向量索引）
  const handleDelete = async (entry: FileEntry) => {
    if (deleting) return;
    // 拦截受保护的默认目录
    if (entry.isDir && isReservedPath(entry.relPath)) {
      alert(`⛔ "${entry.relPath || entry.name}" 是 OpenViking 默认基础目录，不允许删除。\n\n这些目录在安装时自动创建，删除可能导致系统异常。`);
      return;
    }
    setDeleteTarget(entry);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await apiDelete('/api/workspace/rm', {
        path: deleteTarget.relPath,
        recursive: deleteTarget.isDir ? 'true' : 'false',
      });
      // 删除成功后刷新列表，清除选中状态
      setSelectedFile(null);
      setFileContent(null);
      await fetchDir(currentPath);
    } catch (e: any) {
      alert(`删除失败: ${e.message}`);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
  };

  const handleFileClick = async (entry: FileEntry) => {
    setSelectedFile(entry);
    setFileLoading(true);
    setFileContent(null);
    
    // 检查是否是二进制文件
    const isBinary = isBinaryFile(entry.name);
    console.log(`[Storage] File clicked: ${entry.name}, isBinary: ${isBinary}`);
    
    if (isBinary) {
      try {
        // 调用新的 /api/workspace/binary 端点，通过 ov CLI 读取存储数据
        const data = await apiGet<any>('/api/workspace/binary', { path: entry.relPath });
        let displayContent = `[LevelDB 二进制存储文件]\n\n文件: ${entry.name}\n大小: ${formatSize(entry.size)}\n\n${data.message || ''}\n${data.hint || ''}\n`;
        
        // 显示存储的资源列表
        if (data.resources?.result && Array.isArray(data.resources.result)) {
          displayContent += `\n=== 📦 存储资源列表 ===\n\n`;
          data.resources.result.forEach((res: any) => {
            displayContent += `• ${res.uri}\n`;
            if (res.abstract) displayContent += `  └─ ${res.abstract}\n`;
            displayContent += `  └─ 类型: ${res.isDir ? '目录' : '文件'}, 大小: ${res.size} bytes\n\n`;
          });
        }
        
        // 显示系统状态 - 美化格式
        if (data.status?.result?.components) {
          const comps = data.status.result.components;
          displayContent += `\n=== 🔧 系统组件状态 ===\n\n`;
          
          // Queue 统计
          if (comps.queue?.status) {
            displayContent += `⚙️  队列 (Queue)\n${comps.queue.status}\n`;
          }
          
          // VectorDB 统计
          if (comps.vikingdb?.status) {
            displayContent += `\n🗄️  向量库 (VikingDB)\n${comps.vikingdb.status}\n`;
          }
          
          // Retrieval 统计
          if (comps.retrieval?.status) {
            displayContent += `\n🔍 检索统计 (Retrieval)\n${comps.retrieval.status}\n`;
          }
          
          // VLM 状态
          if (comps.vlm?.status) {
            displayContent += `\n🤖 VLM 状态\n${comps.vlm.status}\n`;
          }
        }
        
        // 如果没有实际数据，显示错误提示
        if (!data.resources && !data.status && data.error) {
          displayContent += `\n错误: ${data.error}`;
        }
        
        setFileContent({ name: entry.name, size: entry.size, content: displayContent });
      } catch (e: any) {
        setFileContent({ 
          name: entry.name, 
          size: entry.size, 
          content: `[LevelDB 二进制文件]\n\n文件: ${entry.name}\n大小: ${formatSize(entry.size)}\n\n此文件是 LevelDB 数据库的二进制格式，包含：\n• MANIFEST：数据库元数据\n• .ldb：数据块\n• .log：预写日志\n• LOCK/CURRENT：数据库状态\n\n若要访问数据，请使用 ov CLI:\n  ov read viking://...\n  ov search "keyword"\n\n错误: ${e.message}` 
        });
      } finally {
        setFileLoading(false);
      }
      return;
    }
    
    try {
      const data = await apiGet<{ ok: boolean; name: string; size: number; content: string; truncated?: boolean }>('/api/workspace/file', { path: entry.relPath });
      setFileContent(data);
    } catch (e: any) {
      setFileContent({ name: entry.name, size: entry.size, content: `读取失败: ${e.message}` });
    } finally {
      setFileLoading(false);
    }
  };

  const segments = currentPath ? currentPath.split('/').filter(Boolean) : [];

  // 判断文件类型以显示不同颜色
  function getFileColor(name: string): string {
    if (name.endsWith('.json')) return 'text-yellow-600';
    if (name.endsWith('.db') || name.endsWith('.db-wal') || name.endsWith('.db-shm')) return 'text-blue-600';
    if (name.endsWith('.data') || name.endsWith('.ldb') || name.endsWith('.log')) return 'text-orange-500';
    if (name.endsWith('.md')) return 'text-green-600';
    return 'text-[var(--text-secondary)]';
  }

  // 判断是否是二进制文件
  function isBinaryFile(name: string): boolean {
    // 按优先级检查
    
    // 1. 特定的文件名（完全匹配）
    const binaryNames = ['LOCK', 'CURRENT', 'LOG', 'LOG.old'];
    if (binaryNames.includes(name)) return true;
    
    // 2. MANIFEST-* 模式（任何以 MANIFEST- 开头）
    if (name.startsWith('MANIFEST-')) return true;
    
    // 3. 数字.log, 数字.ldb 等模式
    if (/^\d+\.(log|ldb|sst|SST)$/.test(name)) return true;
    
    // 4. 扩展名检查
    const exts = ['.data', '.db', '.db-wal', '.db-shm', '.ldb'];
    if (exts.some(ext => name.endsWith(ext))) return true;
    
    return false;
  }

  return (
    <div className="flex h-full gap-0">
      {/* 目录列表 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 路径栏 */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]">
          <button
            onClick={goBack}
            disabled={pathStack.length <= 1}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30"
            title="返回上一级"
          >
            <ArrowUp size={14} />
          </button>
          <div className="flex items-center gap-1 text-xs flex-1 overflow-x-auto">
            <button
              onClick={() => navigateTo('')}
              className="text-[var(--text-muted)] hover:text-black hover:underline flex-shrink-0 font-mono text-[10px]"
            >
              workspace/
            </button>
            {segments.map((seg, i) => {
              const p = segments.slice(0, i + 1).join('/');
              const isLast = i === segments.length - 1;
              return (
                <span key={p} className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-[var(--text-muted)]">/</span>
                  {isLast ? (
                    <span className="text-[var(--text-primary)] font-medium text-[10px]">{seg}</span>
                  ) : (
                    <button onClick={() => navigateTo(p)} className="text-[var(--text-muted)] hover:text-black hover:underline text-[10px]">
                      {seg}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          <button onClick={() => fetchDir(currentPath)} className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>

        {/* 文件列表 */}
        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-[var(--text-muted)]" /></div>
          ) : (
            <div className="space-y-px">
              {items.map(item => (
                <div
                  key={item.relPath}
                  onClick={() => item.isDir ? navigateTo(item.relPath) : handleFileClick(item)}
                  className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-md cursor-pointer transition-all text-[12px] ${
                    selectedFile?.relPath === item.relPath
                      ? 'bg-black text-white'
                      : 'hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {item.isDir ? (
                    <Folder size={14} className="flex-shrink-0" />
                  ) : (
                    <FileText size={14} className={`flex-shrink-0 ${selectedFile?.relPath === item.relPath ? '' : getFileColor(item.name)}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-mono">{item.name}</div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] flex-shrink-0 font-mono">
                    {!item.isDir && <span>{formatSize(item.size)}</span>}
                    <span className="w-28 text-right">{formatTime(item.mtime)}</span>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-center py-12 text-[var(--text-muted)] text-sm">目录为空</div>
              )}
            </div>
          )}
        </div>

        {/* 底部统计 */}
        <div className="px-4 py-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] flex items-center gap-3 font-mono">
          <span>{items.filter(i => i.isDir).length} 目录</span>
          <span>{items.filter(i => !i.isDir).length} 文件</span>
        </div>
      </div>

      {/* 文件预览面板 */}
      <div className="w-[420px] flex flex-col bg-white border-l border-[var(--border)]">
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">文件预览</span>
          {fileContent?.truncated && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">已截断</span>
          )}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {fileLoading && (
            <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-[var(--text-muted)]" /></div>
          )}
          {!fileLoading && !fileContent && (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
              <Eye size={32} className="mb-3 opacity-20" />
              <p className="text-xs">点击文件查看内容</p>
              <p className="text-[10px] mt-1">支持 JSON / Markdown / 文本文件</p>
            </div>
          )}
          {!fileLoading && fileContent && (() => {
            const content = fileContent.content;

            // 尝试 JSON 美化
            if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
              try {
                const parsed = JSON.parse(content);
                const formatted = JSON.stringify(parsed, null, 2);
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">{fileContent.name}</span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">{formatSize(fileContent.size)}</span>
                    </div>
                    <pre className="text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-words font-mono leading-relaxed">{formatted}</pre>
                  </div>
                );
              } catch { /* 不是有效 JSON */ }
            }

            return (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">{fileContent.name}</span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">{formatSize(fileContent.size)}</span>
                </div>
                <pre className="text-xs text-[var(--text-primary)] whitespace-pre-wrap break-words font-sans leading-relaxed">{content}</pre>
              </div>
            );
          })()}
        </div>
        {selectedFile && (
          <div className="px-4 py-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] truncate font-mono">
            {selectedFile.relPath}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* 弹窗头部 */}
            <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-red-700">确认删除</h3>
                <p className="text-[11px] text-red-500/80 mt-0.5">
                  此操作将同时清理对应的向量索引数据
                </p>
              </div>
            </div>

            {/* 弹窗内容 */}
            <div className="px-5 py-4 space-y-3">
              <div className="bg-[var(--bg-tertiary)] rounded-lg px-3 py-2.5 flex items-center gap-2.5">
                {deleteTarget.isDir ? (
                  <Folder size={16} className="text-red-400 flex-shrink-0" />
                ) : (
                  <FileText size={16} className="text-red-400 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)] truncate">{deleteTarget.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{deleteTarget.relPath || '.'}</div>
                </div>
              </div>

              {deleteTarget.isDir && (
                <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>目录删除将递归移除其下所有文件及子目录，且所有关联的向量数据将被清除。</span>
                </div>
              )}

              <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                删除后数据<strong className="text-red-600">无法恢复</strong>，请确认操作。
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="px-5 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex items-center justify-end gap-2.5">
              <button
                onClick={cancelDelete}
                disabled={deleting}
                className="px-4 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-white transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> 删除中...
                  </>
                ) : (
                  <>
                    <Trash2 size={12} /> 确认删除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== SQLite 队列可视化 ==========
function QueueViewer() {
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMsgId, setSelectedMsgId] = useState<number | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiGet<QueueData>('/api/workspace/queue');
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch queue data');
    } finally {
      setLoading(false);
    }
  }, []);

  const [queueLoaded, setQueueLoaded] = useState(false);
  useEffect(() => {
    if (!queueLoaded) { fetchQueue(); setQueueLoaded(true); }
  }, [queueLoaded, fetchQueue]);

  // 从 JSON 中提取可读的消息内容
  function extractMessage(dataPreview: string): string {
    try {
      const parsed = JSON.parse(dataPreview);
      if (parsed.data) {
        const inner = JSON.parse(parsed.data);
        if (inner.message) return inner.message.substring(0, 200);
      }
      if (typeof parsed === 'object') return JSON.stringify(parsed).substring(0, 200);
      return String(parsed).substring(0, 200);
    } catch {
      return dataPreview.substring(0, 200);
    }
  }

  // 状态配置
  const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; dotColor: string }> = {
    pending:     { label: '待处理', color: 'text-amber-600', bgColor: 'bg-amber-50',   dotColor: 'bg-amber-400' },
    processing:  { label: '处理中', color: 'text-blue-600',  bgColor: 'bg-blue-50',    dotColor: 'bg-blue-400' },
    completed:   { label: '已完成', color: 'text-emerald-600', bgColor: 'bg-emerald-50',  dotColor: 'bg-emerald-400' },
    failed:     { label: '失败',   color: 'text-red-600',    bgColor: 'bg-red-50',     dotColor: 'bg-red-400' },
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-[var(--text-muted)]" /></div>;
  if (error) return <div className="flex items-center justify-center h-full text-red-500 text-sm">{error}</div>;

  const summary = Array.isArray(data?.summary) ? data.summary : [];
  const recent = Array.isArray(data?.recent) ? data.recent : [];
  const totalAll = summary.reduce((s, q) => s + q.total, 0);
  const selectedMsg = selectedMsgId !== null ? recent.find(m => m.id === selectedMsgId) : null;

  return (
    <div className="flex h-full gap-0">
      {/* 左侧：统计概览 + 消息列表 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 头部信息栏 */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-[var(--border)] bg-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Database size={18} /> 消息队列
              </h2>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                _system/queue/queue.db · 共 {totalAll} 条记录
              </p>
            </div>
            <button onClick={fetchQueue} className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border)] rounded-md text-xs hover:bg-[var(--bg-tertiary)] transition-colors">
              <RefreshCw size={12} /> 刷新
            </button>
          </div>

          {/* 队列统计条形图 */}
          {summary.length > 0 && (
            <div className="space-y-2">
              {summary.map(q => {
                const pct = q.total > 0 ? ((q.completed / q.total) * 100) : 0;
                const segments = [
                  { value: q.pending, color: 'bg-amber-400', label: 'pending' },
                  { value: q.processing, color: 'bg-blue-400', label: 'processing' },
                  { value: q.completed, color: 'bg-emerald-400', label: 'completed' },
                  { value: q.failed, color: 'bg-red-400', label: 'failed' },
                ];
                return (
                  <div key={q.queue_name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-mono font-medium text-[var(--text-primary)]">{q.queue_name}</span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">{q.completed}/{q.total} 完成</span>
                    </div>
                    <div className="flex h-2 rounded-full bg-gray-100 overflow-hidden">
                      {segments.map(seg => (
                        <div
                          key={seg.label}
                          className={`${seg.color} transition-all`}
                          style={{ width: `${q.total > 0 ? (seg.value / q.total) * 100 : 0}%` }}
                          title={`${STATUS_CONFIG[seg.label]?.label}: ${seg.value}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-auto p-4 space-y-1">
          {recent.map(msg => {
            const cfg = STATUS_CONFIG[msg.status] || STATUS_CONFIG['pending'];
            const isSelected = msg.id === selectedMsgId;
            return (
              <div
                key={msg.id}
                onClick={() => setSelectedMsgId(isSelected ? null : msg.id)}
                className={`group cursor-pointer rounded-lg border transition-all ${
                  isSelected
                    ? 'border-black shadow-sm'
                    : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className={`flex items-center gap-3 px-3 py-2.5 ${isSelected ? cfg.bgColor : ''}`}>
                  {/* 状态指示点 */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotColor}`} />

                  {/* ID */}
                  <span className="text-[11px] font-mono text-[var(--text-muted)] w-8 text-right flex-shrink-0">#{msg.id}</span>

                  {/* 消息预览文本 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] truncate text-[var(--text-primary)] leading-snug">
                      {extractMessage(msg.data_preview)}
                    </p>
                  </div>

                  {/* 时间 */}
                  <span className="text-[10px] font-mono text-[var(--text-muted)] flex-shrink-0 w-16 text-right">
                    {msg.time_str?.split(' ')[1] || ''}
                  </span>
                </div>
              </div>
            );
          })}
          {recent.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <Inbox size={32} className="mb-2 opacity-30" />
              <p className="text-sm">队列为空</p>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：选中消息详情面板 */}
      <div className="w-[380px] flex-shrink-0 flex flex-col bg-white border-l border-[var(--border)]">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">消息详情</span>
          {selectedMsg && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              STATUS_CONFIG[selectedMsg.status]?.bgColor + ' ' + STATUS_CONFIG[selectedMsg.status]?.color
            }`}>
              {STATUS_CONFIG[selectedMsg.status]?.label}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!selectedMsg && (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
              <Eye size={28} className="mb-2 opacity-20" />
              <p className="text-xs">点击左侧消息查看详情</p>
            </div>
          )}

          {selectedMsg && (
            <div className="space-y-4">
              {/* 元数据卡片 */}
              <div className="space-y-2">
                {[
                  { label: 'ID', value: selectedMsg.message_id, mono: true },
                  { label: '队列', value: selectedMsg.queue_name, mono: true },
                  { label: '时间', value: selectedMsg.time_str, mono: false },
                  { label: '状态', value: STATUS_CONFIG[selectedMsg.status]?.label, mono: false, highlight: true },
                ].map(({ label, value, mono, highlight }) => (
                  <div key={label} className="flex items-baseline justify-between">
                    <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
                    <span className={`text-[12px] ${mono ? 'font-mono' : ''} ${highlight ? STATUS_CONFIG[selectedMsg.status]?.color + ' font-medium' : 'text-[var(--text-primary)]'}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* 数据内容 */}
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium mb-2">原始数据</div>
                <div className="bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)] p-3 max-h-64 overflow-auto">
                  <pre className="text-[10px] font-mono text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed">
                    {(() => {
                      try {
                        const parsed = JSON.parse(selectedMsg.data_preview);
                        if (parsed.data) {
                          const inner = JSON.parse(parsed.data);
                          return JSON.stringify(inner, null, 2);
                        }
                        return JSON.stringify(parsed, null, 2);
                      } catch {
                        return selectedMsg.data_preview;
                      }
                    })()}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedMsg && (
          <div className="px-4 py-2 border-t border-[var(--border)] text-[9px] text-[var(--text-muted)] font-mono truncate">
            #{selectedMsg.id} · {selectedMsg.queue_name}
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 向量数据库可视化 ==========
function VectorDBViewer() {
  const [data, setData] = useState<VectorDBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchVectorDB = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiGet<VectorDBData>('/api/workspace/vectordb');
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch VectorDB data');
    } finally {
      setLoading(false);
    }
  }, []);

  const [vectordbLoaded, setVectordbLoaded] = useState(false);
  useEffect(() => {
    if (!vectordbLoaded) { fetchVectorDB(); setVectordbLoaded(true); }
  }, [vectordbLoaded, fetchVectorDB]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-[var(--text-muted)]" /></div>;
  if (error) return <div className="flex items-center justify-center h-full text-red-500 text-sm">{error}</div>;
  if (!data?.collection && !data?.index) return <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">无向量数据</div>;

  const col = data.collection;
  const vec = col?.VectorIndex;
  const scalarFields = col?.ScalarIndex || [];

  return (
    <div className="p-6 space-y-5 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">向量数据库</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">vectordb/context/</p>
        </div>
        <button onClick={fetchVectorDB} className="flex items-center gap-1.5 px-3 py-1 border border-[var(--border)] rounded-md text-xs hover:bg-[var(--bg-tertiary)] transition-colors">
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      {/* 向量索引概览 */}
      {vec && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Collection', value: col?.CollectionName || '-', icon: Box },
            { label: '索引类型', value: vec.IndexType || '-', icon: SearchIcon },
            { label: '向量数量', value: vec.ElementCount || 0, icon: Hash },
            { label: '向量维度', value: vec.Dimension || 0, icon: Layers },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="border border-[var(--border)] rounded-lg p-3 bg-white">
              <div className="flex items-start justify-between mb-1">
                <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</span>
                <Icon size={14} className="text-[var(--text-muted)]" />
              </div>
              <div className="text-xl font-semibold font-mono">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 索引参数 */}
      {vec && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '距离度量', value: vec.Distance === 'ip' ? 'IP (内积)' : vec.Distance, desc: '向量相似度计算方式' },
            { label: '量化方式', value: vec.Quant || '-', desc: '向量压缩方法' },
            { label: '最大容量', value: `${vec.MaxElementCount || 0} / ${vec.ElementCount || 0}`, desc: '已使用 / 最大容量' },
          ].map(({ label, value, desc }) => (
            <div key={label} className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">{label}</div>
              <div className="text-xs font-medium font-mono">{value}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{desc}</div>
            </div>
          ))}
        </div>
      )}

      {/* 标量索引字段 */}
      {scalarFields.length > 0 && (
        <div className="border border-[var(--border)] rounded-lg p-4 bg-white">
          <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-[var(--text-secondary)] uppercase tracking-wider">
            <Tag size={14} /> 标量索引字段 ({scalarFields.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {scalarFields.map((field: any) => (
              <div key={field.FieldName} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border)]">
                <span className="text-[11px] font-mono font-medium text-[var(--text-primary)]">{field.FieldName}</span>
                <span className="text-[10px] px-1 py-0.5 rounded bg-white text-[var(--text-muted)] font-mono">{field.FieldType}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 磁盘使用 */}
      {data.diskUsage && (data.diskUsage.store || data.diskUsage.index) && (
        <div className="border border-[var(--border)] rounded-lg p-4 bg-white">
          <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-[var(--text-secondary)] uppercase tracking-wider">
            <HardDrive size={14} /> 磁盘使用
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Store (LevelDB)</div>
              <div className="text-sm font-mono font-medium">{data.diskUsage.store || '-'}</div>
              <div className="text-[10px] text-[var(--text-muted)]">向量数据存储</div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Index</div>
              <div className="text-sm font-mono font-medium">{data.diskUsage.index || '-'}</div>
              <div className="text-[10px] text-[var(--text-muted)]">向量索引文件</div>
            </div>
          </div>
        </div>
      )}

      {/* 索引版本历史 */}
      {data.versions && data.versions.length > 0 && (
        <div className="border border-[var(--border)] rounded-lg p-4 bg-white">
          <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-[var(--text-secondary)] uppercase tracking-wider">
            <GitBranch size={14} /> 索引版本 ({data.versions.length})
          </h3>
          <div className="space-y-2">
            {data.versions.map((v, idx) => (
              <div key={v.version} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-tertiary)] transition-colors">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  idx === data.versions!.length - 1 ? 'bg-black text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                }`}>
                  {idx === data.versions!.length - 1 ? 'L' : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono truncate">{v.version}</div>
                  {v.meta?.VectorIndex && (
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {v.meta.VectorIndex.ElementCount} 向量 · {v.meta.VectorIndex.Dimension}D · {v.meta.VectorIndex.IndexType}
                    </div>
                  )}
                </div>
                <div className="text-[10px] font-mono text-[var(--text-muted)]">{v.size}</div>
                {idx === data.versions!.length - 1 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">最新</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 原始元数据 */}
      {col && (
        <div className="border border-[var(--border)] rounded-lg p-4 bg-white">
          <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-[var(--text-secondary)] uppercase tracking-wider">
            <FileText size={14} /> 原始元数据
          </h3>
          <pre className="text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-words font-mono leading-relaxed bg-[var(--bg-tertiary)] p-3 rounded-lg max-h-64 overflow-auto">
            {JSON.stringify(col, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ========== Session 对话记录 ==========
function SessionViewer() {
  const [sessions, setSessions] = useState<{ session_id: string; uri: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  useEffect(() => {
    if (!sessionsLoaded) {
      apiGet('/api/workspace/sessions').then((res: any) => {
        setSessions(res.sessions || []);
        setLoading(false);
        setSessionsLoaded(true);
      }).catch(() => setLoading(false));
    }
  }, [sessionsLoaded]);

  const loadSession = useCallback((id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    apiGet(`/api/workspace/session?id=${id}`).then((res: any) => {
      setSessionDetail(res.session || null);
      setDetailLoading(false);
    }).catch(() => {
      setSessionDetail(null);
      setDetailLoading(false);
    });
  }, []);

  const messages = sessionDetail?.messages || [];
  // 从 parts 中提取文本内容
  const msgText = (msg: any): string => {
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) return msg.content.map((c: any) => c.type === 'text' ? c.text : `[${c.type}]`).join('');
    if (msg.parts && Array.isArray(msg.parts)) return msg.parts.map((p: any) => p.type === 'text' ? p.text : `[${p.type}]`).join('');
    return JSON.stringify(msg.content || msg);
  };

  return (
    <div className="flex h-full">
      {/* 左侧: Session 列表 */}
      <div className="w-72 border-r border-[var(--border)] flex flex-col bg-white">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">会话列表</h2>
          <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full">{sessions.length}</span>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[var(--text-muted)]" /></div>
        ) : sessions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">暂无会话</div>
        ) : (
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {sessions.map((s) => {
              const shortId = s.session_id.slice(0, 8);
              return (
                <button
                  key={s.session_id}
                  onClick={() => loadSession(s.session_id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                    selectedId === s.session_id
                      ? 'bg-black text-white'
                      : 'hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  }`}
                >
                  <div className="font-mono font-medium truncate">{shortId}...</div>
                  <div className="font-mono text-[10px] opacity-60 mt-0.5 truncate">{s.uri}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 右侧: 会话详情 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-primary)]">
        {detailLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-[var(--text-muted)]" /></div>
        ) : !sessionDetail ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)] gap-2">
            <MessageSquare size={24} className="opacity-30" />
            <span>选择一个会话查看详情</span>
          </div>
        ) : (
          <>
            {/* 头部: 元数据统计卡片 */}
            <div className="px-6 py-4 border-b border-[var(--border)] bg-white space-y-3">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-[var(--text-muted)]" />
                <code className="text-xs font-mono text-[var(--text-secondary)]">{sessionDetail.session_id || selectedId}</code>
              </div>

              {/* 统计信息条 */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: '消息数', value: messages.length, icon: MessageSquare, color: 'text-blue-600 bg-blue-50' },
                  { label: '提交次数', value: sessionDetail.commit_count ?? 0, icon: GitBranch, color: 'text-green-600 bg-green-50' },
                  { label: 'Prompt Tokens', value: sessionDetail.llm_token_usage?.prompt_tokens ?? 0, icon: Hash, color: 'text-purple-600 bg-purple-50' },
                  { label: '记忆提取', value: sessionDetail.memories_extracted?.total ?? 0, icon: Brain, color: 'text-amber-600 bg-amber-50' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className={`rounded-lg px-3 py-2 ${color.split(' ')[1]}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon size={11} className={color.split(' ')[0]} />
                      <span className="text-[10px] font-medium opacity-70">{label}</span>
                    </div>
                    <div className="text-lg font-bold">{value}</div>
                  </div>
                ))}
              </div>

              {/* 记忆分类明细 */}
              {sessionDetail.memories_extracted && (
                <div className="flex gap-2 flex-wrap text-[10px] text-[var(--text-muted)]">
                  {Object.entries(sessionDetail.memories_extracted).filter(([k]) => k !== 'total').map(([k, v]: [string, any]) => (
                    <span key={k} className="bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full">{k}: {v}</span>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-[var(--text-muted)]">
                创建于 {sessionDetail.created_at} · 更新于 {sessionDetail.updated_at}
              </div>
            </div>

            {/* 消息流 */}
            <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-xs text-[var(--text-muted)] pt-10">该会话暂无消息</div>
              ) : messages.map((msg: any, idx: number) => {
                const role = msg.role || 'unknown';
                const isUser = role === 'user';
                const isSystem = role === 'system';

                return (
                  <div
                    key={msg.id || idx}
                    className={`rounded-xl px-4 py-3 max-w-[85%] ${
                      isUser ? 'ml-auto bg-blue-50 border border-blue-100' :
                      isSystem ? 'mx-auto max-w-full bg-amber-50 border border-amber-100' :
                      'mr-auto bg-gray-50 border border-gray-200'
                    }`}
                  >
                    {/* 角色标签 */}
                    <div className={`flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                      isUser ? 'text-blue-600' : isSystem ? 'text-amber-600' : 'text-green-700'
                    }`}>
                      {isUser ? <User size={11} /> : isSystem ? null : <Bot size={11} />}
                      {role}
                    </div>

                    {/* 内容 */}
                    <div className="text-[13px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words">
                      {msgText(msg)}
                    </div>

                    {/* 时间戳 */}
                    {msg.created_at && (
                      <div className="mt-1.5 text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                        <Clock size={9} />{formatTime(msg.created_at)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ========== 主页面 ==========
export function Storage() {
  const [activeTab, setActiveTab] = useState<TabId>('files');

  // 重置存储相关状态
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  // 执行重置
  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const res = await apiPost<{ ok: boolean; message: string; results: Array<{ dir: string; status: string }> }>('/api/workspace/reset');
      alert(`✅ ${res.message}\n\n已清理 ${res.results.filter(r => r.status === 'cleaned').length} 项`);
      // 刷新当前 tab 的数据（通过刷新页面）
      window.location.reload();
    } catch (e: any) {
      alert(`重置失败: ${e.message}`);
    } finally {
      setResetting(false);
      setShowResetConfirm(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab 栏 */}
      <div className="flex items-center gap-0 px-6 py-0 border-b border-[var(--border)] bg-white">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-black text-black font-medium'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
        <div className="ml-auto text-[10px] text-[var(--text-muted)]">
          {TABS.find(t => t.id === activeTab)?.desc}
        </div>
        {/* 一键重置按钮 */}
        <button
          onClick={() => setShowResetConfirm(true)}
          className="ml-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors"
          title="清空所有用户数据，回归初始状态"
        >
          <RotateCcw size={13} />
          <span>重置存储</span>
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'files' && <FileBrowser />}
        {activeTab === 'queue' && <QueueViewer />}
        {activeTab === 'vectordb' && <VectorDBViewer />}
        {activeTab === 'sessions' && <SessionViewer />}
      </div>

      {/* 重置确认弹窗 */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* 弹窗头部 */}
            <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <RotateCcw size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-red-700">重置存储</h3>
                <p className="text-[11px] text-red-500/80 mt-0.5">将清空所有用户数据，回归初始安装状态</p>
              </div>
            </div>

            {/* 弹窗内容 */}
            <div className="px-5 py-4 space-y-3">
              <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                以下数据将被<strong className="text-red-600">永久删除</strong>：
              </div>
              <ul className="text-xs text-[var(--text-secondary)] space-y-1 ml-4 list-disc">
                <li>Agent 记忆与学习（<code className="bg-[var(--bg-tertiary)] px-1 rounded">viking/default/agent</code>）</li>
                <li>用户偏好与实体（<code className="bg-[var(--bg-tertiary)] px-1 rounded">viking/default/user</code>）</li>
                <li>会话历史记录（<code className="bg-[var(--bg-tertiary)] px-1 rounded">viking/default/session</code>）</li>
                <li>导入的资源文档（<code className="bg-[var(--bg-tertiary)] px-1 rounded">viking/default/resources</code>）</li>
                <li>Viking系统数据（<code className="bg-[var(--bg-tertiary)] px-1 rounded">viking/_system</code>）</li>
                <li>向量数据库索引（<code className="bg-[var(--bg-tertiary)] px-1 rounded">vectordb/context/</code> LevelDB全部文件）</li>
                <li>消息队列数据库（<code className="bg-[var(--bg-tertiary)] px-1 rounded">queue.db</code>）</li>
                <li>临时文件与PID（<code className="bg-[var(--bg-tertiary)] px-1 rounded">temp/</code><code className="bg-[var(--bg-tertiary)] px-1 rounded">.pid</code>）</li>
              </ul>
              <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>系统基础目录结构将保留，OpenViking 会在下次访问时自动重建空目录。</span>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="px-5 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                className="px-4 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-white transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="px-4 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {resetting ? (
                  <><Loader2 size={12} className="animate-spin" /> 重置中...</>
                ) : (
                  <><RotateCcw size={12} /> 确认重置</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
