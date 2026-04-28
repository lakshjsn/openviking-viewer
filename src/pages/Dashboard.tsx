import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet } from '../api/client';
import {
  Database, Cpu, Clock, Zap, Shield, BarChart3, AlertCircle,
  CheckCircle2, XCircle, X, Loader2, RefreshCw, Timer,
  Search as SearchIcon, HelpCircle, BookOpen, FileText, Folder,
} from 'lucide-react';

// 术语词汇表
const GLOSSARY: Record<string, string> = {
  'VLM': '视觉语言模型 (Vision Language Model) - 用于处理图文内容的 AI 模型。后面数字表示 Token 消耗量，越低成本越低',
  'Retrieval': '检索系统 - 负责快速查询和检索相关内容的组件。处理用户查询并返回最相关的结果',
  'VikingDB': 'Viking 向量数据库 - 存储和管理向量化数据的数据库。Index 是索引数、Vectors 是向量总数',
  'Queue': '处理队列 - 待处理任务的队列，包括待处理、处理中和已完成的任务。用于异步处理内容',
  'Vector': '向量 - 文本、图片等内容转化为数值表示的形式，用于语义搜索。后面数字表示向量维度（如 embedding 后 30088）',
  'Prompt': '提示词 - 发送给 AI 模型的输入内容。消耗的 Token 数用来计费',
  'Completion': '完成度 - AI 模型生成的输出结果数量。消耗的 Token 数用来计费，通常是输入的 2-3 倍',
  'Latency': '延迟 - 执行操作所需的时间，单位为毫秒。越低性能越好。平均表示中位数，最大表示 P99（99%的请求都在此时间内）',
  'Zero-Result Rate': '零结果率 - 没有返回任何结果的查询占比（百分比）。越低说明检索效果越好，理想值接近 0%',
  'Avg Score': '平均相关性分数 - 检索结果的相关性评分，范围通常为 0-1。越接近 1 说明结果越相关，质量越高',
  'Score Range': '分数范围 - 所有查询结果分数的最小值和最大值。反映检索质量的分布。范围越大说明差异越大',
  'Total Queries': '总查询次数 - 用户执行搜索/检索的总次数，用来衡量系统的使用频率',
  'Total Results': '总结果数 - 所有查询返回的结果总数。结合查询次数可以计算平均每次查询返回多少结果',
  'Avg Results/Query': '平均结果数 - 每次查询平均返回的结果数。值越大说明查询越宽泛，值越小说明查询越精准',
  'Embedding': '向量化/嵌入 - 将文本转化为高维向量的过程，用于语义搜索。后面的数字表示待处理条目数，数字旁的标记表示处理中的任务数',
  'Semantic': '语义化/语义处理 - 对文本进行深度语义理解和分析的过程，提取核心含义和关键信息',
  'Semantic-Nodes': '语义节点/语义关系 - 经过语义化处理后提取的节点或关系表示，用于构建知识图谱',
  'Collection': '集合/数据集 - VikingDB 中的数据存储单元，通常代表一类相关的文档或数据',
  'Index': '索引 - 数据库中的索引结构，加速搜索性能。索引数越多，查询越快但占用空间越大',
  'Provider': '服务提供商 - 提供 AI 模型（如 VLM）的厂商，例如 OpenAI、Anthropic 等',
  'Model': 'AI 模型 - 具体的 AI 模型名称，如 GPT-4、Claude 等。用来确认使用的具体模型版本',
  'Status': '状态 - 系统组件或数据的运行状态。通常显示为 "Healthy"（健康）或 "Error"（错误）',
  'Lock': '锁/并发控制 - 用于管理并发访问的机制，确保数据一致性。显示系统是否能正确处理并发请求',
  'Token': 'Token - 文本被分割成的最小单位，通常用于计费。1 Token ≈ 4 个字符，消耗 Token 越多费用越高',
  'Document': '文档 - 存储在 OpenViking 中的原始内容单位。可以是文本、代码、或其他数据形式',
  'Query': '查询 - 用户搜索时提交的输入内容。系统会对查询进行语义分析来找到最相关的结果',
};

// Tooltip 组件
function Tooltip({ term, children }: { term: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const explanation = GLOSSARY[term];
  
  if (!explanation) return <>{children}</>;
  
  const handleMouseEnter = () => {
    setShow(true);
  };
  
  return (
    <div className="relative inline-block" ref={containerRef}>
      <div className="flex items-center gap-1">
        {children}
        <HelpCircle 
          size={12} 
          className="text-[var(--text-muted)] opacity-50 hover:opacity-100 cursor-help transition-opacity"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={() => setShow(false)}
        />
      </div>
      {show && (
        <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 px-4 py-2.5 bg-neutral-900 text-white text-xs rounded shadow-lg z-50 pointer-events-none whitespace-normal min-w-[200px] max-w-sm break-words leading-relaxed border border-neutral-700">
          <div className="font-medium mb-1 text-neutral-100">{term}</div>
          <div className="text-neutral-300 text-[11px]">{explanation}</div>
          <div className="absolute right-full top-1/2 transform -translate-y-1/2 border-4 border-transparent border-r-neutral-900" />
        </div>
      )}
    </div>
  );
}

interface StatusData {
  ok: boolean;
  result: {
    is_healthy: boolean;
    components: {
      queue: { status: string; is_healthy: boolean };
      vikingdb: { status: string; is_healthy: boolean };
      vlm: { status: string; is_healthy: boolean };
      lock: { status: string; is_healthy: boolean };
      retrieval: { status: string; is_healthy: boolean };
    };
  };
}

interface ResourcesData {
  ok: boolean;
  uri: string;
  resources: ResourceNode[];
  summary: {
    total: number;
    ready: number;
    partial: number;
    processing: number;
    pending: number;
    failed: number;
  };
  projects?: {          // 根级请求时返回的项目汇总
    name: string;
    uri: string;
    total: number;
    ready: number;
    processing: number;
    pending: number;
  }[];
  fetchedAt: string;
}

interface ResourceNode {
  uri: string;
  name: string;
  projectName?: string;     // 所属项目名（根级请求时有值）
  projectUri?: string;      // 项目 URI（根级请求时有值）
  isDir: boolean;
  size: number;
  modTime: string;
  abstract: string | null;
  hasAbstract: boolean;
  hasOverview: boolean;
  stat: { mode: string; modTime: string } | null;
  status: 'ready' | 'partial' | 'processing' | 'pending' | 'failed';
  statusLabel: string;
  statusDetail: string;
}

function parseVlmStatus(text: string) {
  const lines = text.split('\n').filter(l => l.trim() && !l.includes('---'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 5) {
      // 验证第3、4、5列都是数字，避免解析表头行
      const promptVal = parseInt(cells[2]);
      const completionVal = parseInt(cells[3]);
      const totalVal = parseInt(cells[4]);
      if (!isNaN(promptVal) && !isNaN(completionVal) && !isNaN(totalVal)) {
        rows.push({
          model: cells[0],
          prompt: promptVal, completion: completionVal,
          total: totalVal, lastUpdated: cells[5] || '',
        });
      }
    }
  }
  return rows;
}

function parseRetrievalStatus(text: string) {
  const lines = text.split('\n').filter(l => l.trim() && !l.includes('---'));
  const map: Record<string, string> = {};
  for (const line of lines) {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length === 2) map[cells[0]] = cells[1];
  }
  return map;
}

function StatusBadge({ healthy }: { healthy: boolean }) {
  if (healthy) return <span className="inline-flex items-center gap-1 text-green-600 text-[11px]"><CheckCircle2 size={12} /> Healthy</span>;
  return <span className="inline-flex items-center gap-1 text-red-500 text-[11px]"><XCircle size={12} /> Error</span>;
}

function ResourceStatusBadge({ status, label }: { status: string; label: string }) {
  const styleMap: Record<string, string> = {
    ready: 'text-green-600',
    partial: 'text-blue-500',
    processing: 'text-yellow-600',
    pending: 'text-[var(--text-muted)]',
    failed: 'text-red-500',
  };
  const iconMap: Record<string, any> = {
    ready: CheckCircle2,
    partial: BookOpen,
    processing: Loader2,
    pending: Clock,
    failed: XCircle,
  };
  const Icon = iconMap[status] || Clock;
  const colorClass = styleMap[status] || 'text-[var(--text-muted)]';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${colorClass}`}>
      <Icon size={12} className={status === 'processing' ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}

function MetricCard({ title, value, icon: Icon, sub }: {
  title: string | React.ReactNode; value: string | number; icon: any; sub?: string | React.ReactNode;
}) {
  return (
    <div className="border border-[var(--border)] rounded-lg p-4 bg-white animate-fade-in">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">{title}</span>
        <Icon size={16} className="text-[var(--text-muted)]" />
      </div>
      <div className="text-xl font-semibold font-mono">{value}</div>
      {sub && <div className="text-[11px] text-[var(--text-muted)] mt-1">{sub}</div>}
    </div>
  );
}

/**
 * 系统运行时长卡片 —— 实时计时器
 *
 * 从组件挂载开始计时，显示系统运行时长（时:分:秒 格式）。
 * 用于展示 auto-loop-verify 的 E2E 验证能力（检测动态变化的内容）。
 */
function UptimeCard() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const display = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="border border-[var(--border)] rounded-lg p-4 bg-white animate-fade-in">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">运行时长</span>
        <Timer size={16} className="text-green-500" />
      </div>
      <div className="text-xl font-semibold font-mono text-green-600">{display}</div>
      <div className="text-[11px] text-[var(--text-muted)] mt-1">页面加载后实时计时</div>
    </div>
  );
}

/** 队列信息类型 */
interface QueueInfo {
  active: boolean;              // 是否有任何队列在活跃处理
  summary: { totalPending: number; totalInProgress: number; totalProcessed: number; totalErrors: number };
  queues: Array<{ name: string; pending: number; inProgress: number; processed: number }> | null;
}

/**
 * 重建进度条组件 —— 混合模式（方案C）
 *
 * 三重信号融合，按优先级判定显示阶段：
 *   1. 终态判定：节点 status === ready → ✅ 完成
 *   2. 队列校准：observer queue 有 In Progress → 🔄 真实队列名
 *   3. 队列空闲+未完成：⚠️ 可能卡住（停止脉动）
 *   4. 兜底：时间估算阶段
 */
function RebuildProgress({ uri, name, startTime, queueInfo, error, onRetry }: {
  uri: string; name: string; startTime: number; queueInfo: QueueInfo | null;
  error?: string;
  onRetry?: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    return () => clearInterval(tick);
  }, [startTime]);

  // 格式化耗时
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ===== 三重信号融合阶段判定 =====
  const activeQueues = queueInfo?.queues?.filter(q => q.inProgress > 0) || [];
  const queueActive = queueInfo?.active ?? false;
  const isStalled = !queueActive && elapsed > 15; // 队列空闲超过15秒且还没完成

  let phase: { label: string; pct: number; color: string; pulsing: boolean; icon: React.ReactNode };

  // ===== 有错误 → 轻量内联提示（详情见右下角弹窗）=====
  if (error) {
    return (
      <div className="flex flex-col items-center gap-1 w-full">
        <div className="w-full h-1.5 bg-red-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-red-500" style={{ width: '100%' }} />
        </div>
        <button
          onClick={onRetry}
          className="text-[9px] text-red-500 font-medium whitespace-nowrap flex items-center gap-1 hover:text-red-600 transition-colors cursor-pointer"
          title="点击重试"
        >
          <XCircle size={9} />
          <span>失败</span>
          <RefreshCw size={8} className="ml-0.5" />
        </button>
      </div>
    );
  }

  if (isStalled) {
    // 队列空闲但没完成 → 可能卡住或正在写入
    phase = {
      label: '等待同步...', pct: Math.min(85, 60 + Math.floor(elapsed / 5)),
      color: 'text-amber-500', pulsing: false,
      icon: <Clock size={9} />,
    };
  } else if (activeQueues.length > 0) {
    // 队列有活跃任务 → 用真实队列名显示
    const qNames = activeQueues.map(q => q.name).join(', ');
    const basePct = elapsed < 10 ? 20 : elapsed < 30 ? 45 : elapsed < 60 ? 65 : 80;
    phase = {
      label: `${qNames} 处理中`,
      pct: basePct,
      color: 'text-blue-600',
      pulsing: true,
      icon: <Loader2 size={9} className="animate-spin" />,
    };
  } else {
    // 刚开始或队列数据还未加载 → 时间估算兜底
    phase = elapsed < 5
      ? { label: '提交中...', pct: 10, color: 'text-blue-400', pulsing: true, icon: <Loader2 size={9} className="animate-spin" /> }
      : elapsed < 15
        ? { label: '排队入队...', pct: 25, color: 'text-blue-500', pulsing: true, icon: <Loader2 size={9} className="animate-spin" /> }
        : { label: '处理中...', pct: 50, color: 'text-blue-600', pulsing: true, icon: <Loader2 size={9} className="animate-spin" /> };
  }

  return (
    <div className="flex flex-col items-center gap-1 w-full" title={`正在重新生成 ${name}...`}>
      {/* 进度条 */}
      <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${phase.pulsing ? 'bg-blue-500' : 'bg-amber-400'}`}
          style={{
            width: `${phase.pct}%`,
            animation: phase.pulsing ? 'pulse-bar 1.5s ease-in-out infinite' : 'none',
          }}
        />
      </div>
      {/* 阶段文字 + 耗时 */}
      <span className={`text-[9px] ${phase.color} font-medium whitespace-nowrap flex items-center gap-1`}>
        {phase.icon}
        {phase.label} <span className="text-[var(--text-muted)]">{fmt(elapsed)}</span>
      </span>
    </div>
  );
}

export function Dashboard() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [resources, setResources] = useState<ResourcesData | null>(null);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  // 搜索统计数据（来自 /api/search-stats，全量聚合所有检索请求）
  const [searchStats, setSearchStats] = useState<{ summary: any; bySource: any } | null>(null);
  const [rebuildingUris, setRebuildingUris] = useState<Set<string>>(() => {
    // 从 sessionStorage 恢复重建中状态（防止 HMR/刷新丢失）
    try {
      const saved = sessionStorage.getItem('rebuilding');
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set();
  });
  // 用 ref 保存正在重建的 URI 集合，避免 async 竞态导致状态丢失
  const rebuildingRef = useRef<Set<string>>(new Set());
  // 用 ref 保存轮询定时器，便于清理
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  // 记录每个 URI 开始重建的时间，用于计算进度
  const [rebuildStartTime, setRebuildStartTime] = useState<Record<string, number>>(() => {
    try {
      const saved = sessionStorage.getItem('rebuildStartTimes');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  const rebuildStartTimeRef = useRef<Record<string, number>>(rebuildStartTime);
  // 全局队列状态（observer queue），供 RebuildProgress 校准进度
  const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
  // 重建失败的错误信息（URI → 错误描述）
  const [rebuildErrors, setRebuildErrors] = useState<Record<string, string>>({});
  // 错误弹窗：{ uri, name, message, timestamp }
  const [errorToast, setErrorToast] = useState<{ uri: string; name: string; message: string; time: number } | null>(null);

  const fetchConfig = async () => {
    try {
      const cfg = await apiGet<any>('/api/config');
      setConfig(cfg?.config);
    } catch {
      // Ignore config fetch errors
    }
  };

  const fetchStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet<StatusData>('/api/status');
      setStatus(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  };

  const fetchResources = async () => {
    setResourcesLoading(true);
    try {
      const data = await apiGet<ResourcesData>('/api/resources?uri=viking://resources&depth=2');
      setResources(data);
      // 自动清理已变为 ready 的 URI（避免"状态显示就绪但按钮仍显示生成中"的不一致）
      if (data?.resources) {
        for (const r of data.resources) {
          if (r.status === 'ready' && rebuildingRef.current.has(r.uri)) {
            stopPolling(r.uri);
          }
        }
      }
    } catch {
      // 资源数据获取失败不阻塞主面板
    } finally {
      setResourcesLoading(false);
    }
  };

  // 获取搜索统计数据（全量聚合：viewer + agent_cli + external 所有来源）
  const fetchSearchStats = async () => {
    try {
      const data = await apiGet<{ ok: boolean; summary: any; bySource: any }>('/api/search-stats');
      if (data?.ok) {
        setSearchStats({ summary: data.summary, bySource: data.bySource });
      }
    } catch {
      // 搜索统计获取失败不阻塞主面板，静默降级到 ov status 的 retrieval 数据
    }
  };

  // 清理指定 URI 的轮询定时器
  const stopPolling = useCallback((uri: string) => {
    const timer = pollTimersRef.current.get(uri);
    if (timer) {
      clearInterval(timer);
      pollTimersRef.current.delete(uri);
    }
    // 从状态中移除（同步更新 ref + state + sessionStorage）
    rebuildingRef.current.delete(uri);
    setRebuildingUris(prev => { const s = new Set(prev); s.delete(uri); return s; });
    setRebuildStartTime(prev => { const next = { ...prev }; delete next[uri]; rebuildStartTimeRef.current = next; try { sessionStorage.setItem('rebuildStartTimes', JSON.stringify(next)); } catch {} return next; });
    try { sessionStorage.setItem('rebuilding', JSON.stringify([...rebuildingRef.current])); } catch {}
  }, []);

  // 单个节点重试：触发 reindex，启动定时器轮询直到 ready 或超时
  const handleRetryNode = async (node: ResourceNode) => {
    const uri = node.uri;

    // 如果已在重建中，忽略重复点击
    if (rebuildingRef.current.has(uri)) return;

    // 1. 加入重建中集合（ref + state + sessionStorage 三写）
    const now = Date.now();
    rebuildingRef.current.add(uri);
    setRebuildingUris(prev => new Set(prev).add(uri));
    setRebuildStartTime(prev => { const next = { ...prev, [uri]: now }; rebuildStartTimeRef.current = next; try { sessionStorage.setItem('rebuildStartTimes', JSON.stringify(next)); } catch {} return next; });
    try { sessionStorage.setItem('rebuilding', JSON.stringify([...rebuildingRef.current])); } catch {}

    try {
      // 2. 触发 reindex（异步，入队即返回）
      const res = await fetch('/api/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
      });
      const data = await res.json();
      if (!data.ok) {
        // 保存错误信息 + 弹出 Toast
        const errMsg = data.error || data.stderr || '未知错误';
        setRebuildErrors(prev => ({ ...prev, [uri]: errMsg }));
        setErrorToast({ uri, name: node.name, message: errMsg, time: Date.now() });
        stopPolling(uri);
        return;
      }
      // 清除该 URI 可能残留的错误（重试成功时）
      setRebuildErrors(prev => { const next = { ...prev }; delete next[uri]; return next; });

      // 3. 启动定时器轮询：每5秒检查一次，最长120秒
      const MAX_POLL_TIME = 120_000;
      const startTime = Date.now();

      const timer = setInterval(async () => {
        // 超时检查
        if (Date.now() - startTime > MAX_POLL_TIME) {
          stopPolling(uri);
          return;
        }

        // 刷新资源数据 + 队列状态（并行请求）
        await Promise.all([
          fetchResources(),
          fetch('/api/observer/queue')
            .then(r => r.json())
            .then(d => { if (d.ok) setQueueInfo(d); })
            .catch(() => {}),
        ]);

        // 检查该节点是否已变为 ready（从最新 resources state 读取）
        // 注意：这里通过 DOM/data 属性或重新获取来判断，避免闭包陷阱
        // 简单方案：直接再调一次 API 检查该节点
        try {
          const checkRes = await fetch('/api/resources?uri=viking://resources&depth=2');
          const checkData = await checkRes.json();
          if (checkData?.ok) {
            const updated = checkData.resources?.find((r: any) => r.uri === uri);
            if (updated && updated.status === 'ready') {
              // 完成后再刷新一次确保数据同步
              await fetchResources();
              stopPolling(uri);
            }
          }
        } catch {
          // 轮询错误不中断，继续下次轮询
        }
      }, 5000);

      // 保存定时器引用
      pollTimersRef.current.set(uri, timer);
    } catch {
      stopPolling(uri);
    }
  };

  // 组件卸载时清理所有轮询定时器
  useEffect(() => {
    return () => {
      pollTimersRef.current.forEach(timer => clearInterval(timer));
      pollTimersRef.current.clear();
      rebuildingRef.current.clear();
    };
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchStatus();
    fetchResources();
    fetchSearchStats();

    // 从 sessionStorage 恢复 rebuildingRef（与 useState 初始化同步）
    try {
      const saved = sessionStorage.getItem('rebuilding');
      if (saved) {
        const uris = JSON.parse(saved);
        uris.forEach((u: string) => rebuildingRef.current.add(u));
      }
    } catch {}
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} config={config} onRetry={fetchStatus} />;

  const vlmRows = parseVlmStatus(status?.result?.components?.vlm?.status || '');
  const retrievalMap = parseRetrievalStatus(status?.result?.components?.retrieval?.status || '');

  // 检索统计数据：优先使用 search-stats API（全量聚合），fallback 到 ov status retrieval
  const ss = searchStats?.summary;
  const displayQueries = ss?.totalQueries ?? retrievalMap['Total Queries'] ?? '0';
  const displayLatency = ss?.avgLatMs ?? retrievalMap['Avg Latency (ms)'] ?? '-';
  const displayScore = ss?.avgScore ?? retrievalMap['Avg Score'] ?? '-';
  const displayZeroRate = ss?.zeroResultRate ?? retrievalMap['Zero-Result Rate'] ?? '-';
  const displayTotalResults = ss?.totalResults ?? retrievalMap['Total Results'] ?? '0';
  const displayAvgResults = ss?.avgResultsPerQuery ?? retrievalMap['Avg Results/Query'] ?? '-';

  return (
    <div className="p-6 space-y-5 animate-fade-in relative">
      {/* 重建错误 Toast */}
      {errorToast && (
        <RebuildErrorToast
          toast={errorToast}
          onRetry={() => {
            // 找到对应节点并触发重试
            const node = resources?.resources?.find((n: ResourceNode) => n.uri === errorToast.uri);
            if (node) handleRetryNode(node);
          }}
          onClose={() => setErrorToast(null)}
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">系统概览</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">OpenViking 服务运行状态</p>
        </div>
        <button onClick={fetchStatus} className="flex items-center gap-1.5 px-3 py-1 border border-[var(--border)] rounded-md text-xs hover:bg-[var(--bg-tertiary)] transition-colors">
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-5 gap-3">
        <MetricCard title={<Tooltip term="Latency">平均检索延迟</Tooltip>} value={typeof displayLatency === 'number' ? displayLatency : displayLatency} icon={Zap} sub={`查询: ${displayQueries}`} />
        <MetricCard title={<Tooltip term="Avg Score">平均相关性</Tooltip>} value={displayScore} icon={BarChart3} sub={<Tooltip term="Zero-Result Rate">零结果率: {displayZeroRate}</Tooltip>} />
        <MetricCard title="资源节点" value={resources?.summary?.total ?? '-'} icon={BookOpen} sub={`就绪 ${resources?.summary?.ready ?? '-'} / 处理中 ${resources?.summary?.processing ?? '-'}`} />
        <MetricCard title="系统健康" value={`${Object.values(status?.result?.components || {}).filter(c => c.is_healthy).length}/${Object.keys(status?.result?.components || {}).length}`} icon={Shield} sub="组件运行状态" />
        <UptimeCard />
      </div>

      {/* Health */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(status?.result?.components || {}).map(([name, comp]) => (
          <div key={name} className="border border-[var(--border)] rounded-lg p-2.5 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">{name}</span>
              <StatusBadge healthy={comp.is_healthy} />
            </div>
          </div>
        ))}
      </div>

      {/* VLM + Retrieval */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-[var(--border)] rounded-lg p-4 bg-white">
          <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-[var(--text-secondary)] uppercase tracking-wider">
            <Cpu size={14} /> <Tooltip term="VLM">VLM 模型用量</Tooltip>
          </h3>
          {vlmRows.length > 0 ? (
            <div className="space-y-3">
              {vlmRows.map((row, idx) => (
                  <div key={`vlm-${row.model}-${idx}`}>
                    <div className="text-xs mb-1">
                      <span className="font-medium font-mono"><Tooltip term="Model">{row.model}</Tooltip></span>
                    </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="text-center p-1.5 rounded bg-[var(--bg-tertiary)]">
                      <div className="text-[var(--text-muted)]"><Tooltip term="Prompt">Prompt</Tooltip></div>
                      <div className="font-mono font-medium">{row.prompt.toLocaleString()}</div>
                    </div>
                    <div className="text-center p-1.5 rounded bg-[var(--bg-tertiary)]">
                      <div className="text-[var(--text-muted)]"><Tooltip term="Completion">Completion</Tooltip></div>
                      <div className="font-mono font-medium">{row.completion.toLocaleString()}</div>
                    </div>
                    <div className="text-center p-1.5 rounded bg-[var(--bg-tertiary)]">
                      <div className="text-[var(--text-muted)]">Total</div>
                      <div className="font-mono font-medium">{row.total.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="text-xs text-[var(--text-muted)]">暂无数据</div>}
        </div>

        <div className="border border-[var(--border)] rounded-lg p-4 bg-white">
          <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-[var(--text-secondary)] uppercase tracking-wider">
            <BarChart3 size={14} /> <Tooltip term="Retrieval">检索统计</Tooltip>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: <Tooltip term="Total Queries">总查询次数</Tooltip>, value: String(displayQueries), icon: SearchIcon },
              { label: <Tooltip term="Total Results">总结果数</Tooltip>, value: String(displayTotalResults), icon: Database },
              { label: <Tooltip term="Avg Results/Query">平均结果/查询</Tooltip>, value: String(displayAvgResults), icon: BarChart3 },
              { label: <Tooltip term="Zero-Result Rate">零结果率</Tooltip>, value: displayZeroRate, icon: AlertCircle },
              { label: <Tooltip term="Avg Score">平均分数</Tooltip>, value: displayScore, icon: Zap },
              { label: <Tooltip term="Score Range">分数范围</Tooltip>, value: ss?.scoreRange || retrievalMap['Score Range'] || '-', icon: Shield },
              { label: <Tooltip term="Latency">平均延迟 ms</Tooltip>, value: typeof displayLatency === 'number' ? String(displayLatency) : displayLatency, icon: Clock },
              { label: <Tooltip term="Max Latency">最大延迟 ms</Tooltip>, value: ss?.maxLatencyMs != null ? String(ss.maxLatencyMs) : (retrievalMap['Max Latency (ms)'] || '-'), icon: AlertCircle },
            ].map(({ label, value, icon: Icon }, idx) => (
              <div key={`retrieval-metric-${idx}`} className="p-2 rounded bg-[var(--bg-tertiary)]">
                <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] mb-0.5"><Icon size={10} />{label}</div>
                <div className="text-xs font-medium font-mono">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 知识库资源构建状态 */}
      {(resources || resourcesLoading) && (
        <div className="border border-[var(--border)] rounded-lg p-4 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold flex items-center gap-1.5 text-[var(--text-secondary)] uppercase tracking-wider">
              <BookOpen size={14} /> 知识库资源构建状态
            </h3>
            {resources?.summary && (
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-green-600"><CheckCircle2 size={10} className="inline mr-0.5" />就绪 {resources.summary.ready}</span>
                <span className="text-blue-500"><BookOpen size={10} className="inline mr-0.5" />概览就绪 {resources.summary.partial ?? 0}</span>
                <span className="text-yellow-600"><Loader2 size={10} className="inline mr-0.5 animate-spin" />处理中 {resources.summary.processing}</span>
                <span className="text-[var(--text-muted)]">等待中 {resources.summary.pending}</span>
                {resources.summary.failed > 0 && <span className="text-red-500"><XCircle size={10} className="inline mr-0.5" />失败 {resources.summary.failed}</span>}
              </div>
            )}
          </div>
          {resourcesLoading && !resources ? (
            <div className="flex items-center justify-center py-6 text-xs text-[var(--text-muted)]">
              <Loader2 size={16} className="animate-spin mr-2" /> 加载资源状态...
            </div>
          ) : resources?.resources && resources.resources.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--text-muted)] text-[10px] uppercase border-b border-[var(--border)]">
                    {(resources.projects && resources.projects.length > 1) && (
                      <th className="text-left py-2 px-2 font-medium">项目</th>
                    )}
                    <th className="text-left py-2 px-2 font-medium">名称</th>
                    <th className="text-left py-2 px-2 font-medium">类型</th>
                    <th className="text-left py-2 px-2 font-medium">状态</th>
                    <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">详情</th>
                    <th className="text-right py-2 px-2 font-medium hidden md:table-cell">摘要</th>
                    <th className="text-center py-2 px-2 font-medium w-16">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.resources.map((node, idx) => (
                    <tr key={node.uri || idx} className="border-b border-[var(--border)] last:border-b-0">
                      {(resources.projects && resources.projects.length > 1) && (
                        <td className="py-2 px-2 text-[var(--text-muted)] whitespace-nowrap" title={node.projectUri}>
                          <span className="text-[10px] font-mono bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">{node.projectName || '-'}</span>
                        </td>
                      )}
                      <td className="py-2 px-2 font-medium text-[var(--text-secondary)] truncate max-w-[160px]" title={node.name}>
                        <div className="flex items-center gap-1.5">
                          {node.isDir ? <Folder size={12} className="text-amber-500 shrink-0" /> : <FileText size={12} className="text-blue-500 shrink-0" />}
                          <span className="truncate font-mono">{node.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-[var(--text-muted)]">
                        {node.isDir ? '目录' : '文件'}
                      </td>
                      <td className="py-2 px-2">
                        <ResourceStatusBadge status={node.status} label={node.statusLabel} />
                      </td>
                      <td className="py-2 px-2 text-[var(--text-muted)] hidden sm:table-cell max-w-[180px] truncate" title={node.statusDetail}>
                        {node.statusDetail}
                      </td>
                      <td className="py-2 px-2 text-right hidden md:table-cell">
                        {node.hasAbstract ? (
                          <span className="text-green-600 text-[10px]">✓ 已生成</span>
                        ) : node.hasOverview ? (
                          <span className="text-green-600 text-[10px]">✓ 概览已生成</span>
                        ) : (
                          <span className="text-[var(--text-muted)] text-[10px]">— 未生成</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center min-w-[120px]">
                        {rebuildingUris.has(node.uri) ? (
                          <RebuildProgress uri={node.uri} name={node.name} startTime={rebuildStartTime[node.uri] || 0} queueInfo={queueInfo} error={rebuildErrors[node.uri]} onRetry={() => handleRetryNode(node)} />
                        ) : (
                          <button
                            onClick={() => handleRetryNode(node)}
                            className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] hover:bg-[var(--bg-tertiary)] transition-colors min-w-[52px]"
                            title={`重新生成摘要: ${node.name}`}
                          >
                            <RefreshCw size={11} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[10px] text-[var(--text-muted)] mt-2 flex items-center justify-between">
                <span>共 {resources.summary.total} 个资源节点 · 更新于 {new Date(resources.fetchedAt).toLocaleTimeString()}</span>
                <button
                  onClick={() => fetchResources()}
                  disabled={resourcesLoading}
                  className="inline-flex items-center gap-1 hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={10} className={resourcesLoading ? 'animate-spin' : ''} />
                  {resourcesLoading ? '刷新中...' : '刷新资源'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-muted)] py-4 text-center">暂无资源数据</div>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-2">
        <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
        <span className="text-xs text-[var(--text-muted)]">加载中...</span>
      </div>
    </div>
  );
}

function ErrorState({ error, config, onRetry }: { error: string; config?: any; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <AlertCircle size={48} className="text-red-500" />
        <div>
          <p className="text-sm font-medium text-red-500 mb-1">连接 OpenViking 失败</p>
          <p className="text-xs text-[var(--text-muted)]">{error}</p>
        </div>
        
        {config && (
          <div className="w-full text-left bg-[var(--bg-tertiary)] rounded-lg p-3 mt-2">
            <p className="text-[10px] font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">当前配置:</p>
            <div className="space-y-1 text-[11px] font-mono">
              <div><span className="text-[var(--text-muted)]">ov 命令:</span> {config.ovCommand}</div>
              <div><span className="text-[var(--text-muted)]">主机:</span> {config.host}:{config.port}</div>
              {config.workspacePath && <div><span className="text-[var(--text-muted)]">Workspace:</span> {config.workspacePath}</div>}
            </div>
          </div>
        )}
        
        <div className="text-left text-[11px] text-[var(--text-muted)] w-full">
          <p className="font-semibold mb-2">可能的解决方案:</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>检查 OpenViking CLI 是否安装: <code className="bg-[var(--bg-tertiary)] px-1">which ov</code></li>
            <li>确保 OpenViking 服务正在运行: <code className="bg-[var(--bg-tertiary)] px-1">ov health</code></li>
            <li>检查主机和端口配置是否正确</li>
            <li>查看 <code className="bg-[var(--bg-tertiary)] px-1">SETUP.md</code> 了解更多配置选项</li>
          </ol>
        </div>
        
        <button onClick={onRetry} className="px-4 py-2 border border-[var(--border)] rounded-md text-xs hover:bg-[var(--bg-tertiary)] transition-colors mt-2 font-medium">
          <RefreshCw size={12} className="inline mr-1" />重试连接
        </button>
      </div>
    </div>
  );
}

/** 重建失败 Toast 弹窗 */
function RebuildErrorToast({ toast, onRetry, onClose }: {
  toast: { uri: string; name: string; message: string; time: number };
  onRetry: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000); // 8秒自动消失
    return () => clearTimeout(t);
  }, [onClose]);

  // 清洗错误文本：去除命令前缀
  const cleanMsg = toast.message
    .replace(/ov reindex.*?Error:\s*/i, '')
    .replace(/API error:\s*/i, '')
    .replace(/Command failed:\s*/i, '')
    .trim();

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] animate-slide-up">
      <div className="bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-800 rounded-lg shadow-xl overflow-hidden">
        {/* 红色顶条 */}
        <div className="h-1 bg-red-500" />
        <div className="p-4">
          {/* 标题行 */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-sm font-semibold text-red-600 dark:text-red-400 truncate">{toast.name} 重建失败</span>
            </div>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] shrink-0 p-0.5 cursor-pointer">
              <X size={14} />
            </button>
          </div>
          {/* 错误详情 */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-md p-2.5 mb-3">
            <p className="text-xs text-red-700 dark:text-red-300 break-words leading-relaxed font-mono">{cleanMsg}</p>
          </div>
          {/* 操作按钮 */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--text-muted)]">{new Date(toast.time).toLocaleTimeString()}</span>
            <button
              onClick={() => { onRetry(); onClose(); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
            >
              <RefreshCw size={11} /> 重试
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
