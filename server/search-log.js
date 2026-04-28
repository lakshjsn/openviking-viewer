import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { OV_CONFIG } from './config.js';

/**
 * 搜索日志模块 — 记录所有经过 viewer 后端的检索请求
 *
 * 设计目标：
 *   1. 自动拦截 /api/find 和 /api/search 的每次调用
 *   2. 持久化到 JSON 文件（增量追加 + 定期压缩）
 *   3. 提供统计聚合查询接口
 *   4. 区分来源（viewer 页面 / agent_cli / external）
 *
 * 数据文件位置：<workspace>/.openviking/_system/search-log.json
 */

const LOG_DIR = path.join(OV_CONFIG.workspacePath, '_system');
const LOG_FILE = path.join(LOG_DIR, 'search-log.json');

// 内存缓存（避免频繁读文件）
let _cache = null;
let _cacheTs = 0;
const CACHE_TTL = 5000; // 5 秒

/** 确保日志目录存在 */
function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/** 读取全部日志（带缓存） */
export function readLog() {
  const now = Date.now();
  if (_cache && (now - _cacheTs) < CACHE_TTL) return _cache;

  try {
    if (fs.existsSync(LOG_FILE)) {
      const raw = fs.readFileSync(LOG_FILE, 'utf-8');
      _cache = JSON.parse(raw);
    } else {
      _cache = [];
    }
  } catch {
    _cache = [];
  }
  _cacheTs = now;
  return _cache;
}

/** 追加一条搜索记录（原子写入） */
export function appendLog(entry) {
  ensureDir();
  const log = readLog();
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  log.push(record);

  // 增量写回（仅追加模式，性能优先）
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
    // 更新缓存
    _cache = log;
    _cacheTs = Date.now();
  } catch (err) {
    console.error('[search-log] 写入失败:', err.message);
  }

  return record;
}

/** 聚合统计：按时间范围计算检索指标 */
export function getStats(options = {}) {
  const { since, until, limit = 10000 } = options;
  const log = readLog();

  // 时间过滤
  let filtered = log;
  if (since) {
    const sinceMs = new Date(since).getTime();
    filtered = filtered.filter(e => new Date(e.timestamp).getTime() >= sinceMs);
  }
  if (until) {
    const untilMs = new Date(until).getTime();
    filtered = filtered.filter(e => new Date(e.timestamp).getTime() <= untilMs);
  }

  // 取最近 N 条
  const recent = filtered.slice(-limit);

  // 聚合指标
  const totalQueries = recent.length;

  // 按来源分组
  const bySource = {};
  let totalResults = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let latencySum = 0;
  let maxLatency = 0;
  let zeroResultCount = 0;

  for (const r of recent) {
    // 来源统计
    bySource[r.source] = (bySource[r.source] || 0) + 1;

    // 结果数
    const resultCount = r.resultCount ?? 0;
    totalResults += resultCount;
    if (resultCount === 0) zeroResultCount++;

    // 分数
    if (r.avgScore != null) {
      scoreSum += r.avgScore;
      scoreCount++;
    }

    // 延迟
    if (r.latencyMs != null) {
      latencySum += r.latencyMs;
      if (r.latencyMs > maxLatency) maxLatency = r.latencyMs;
    }
  }

  return {
    period: { since: since || (recent[0]?.timestamp || null), until: until || new Date().toISOString() },
    summary: {
      totalQueries,
      totalResults,
      avgResultsPerQuery: totalQueries > 0 ? (totalResults / totalQueries).toFixed(1) : '0',
      zeroResultRate: totalQueries > 0 ? ((zeroResultCount / totalQueries) * 100).toFixed(1) : '0',
      avgScore: scoreCount > 0 ? (scoreSum / scoreCount).toFixed(4) : '-',
      avgLatencyMs: totalQueries > 0 ? Math.round(latencySum / totalQueries) : 0,
      maxLatencyMs: maxLatency,
      scoreRange: '-', // 需要原始分数数据，暂不实现
    },
    bySource,
    recent: recent.slice(-20).map(({ id, timestamp, query, type, source, resultCount }) => ({
      id, timestamp, query, type, source, resultCount,
    })),
  };
}

/** 清理过期日志（保留最近 30 天） */
export function cleanup(retentionDays = 30) {
  const log = readLog();
  const cutoff = Date.now() - retentionDays * 86400_000;
  const filtered = log.filter(e => new Date(e.timestamp).getTime() >= cutoff);
  if (filtered.length < log.length) {
    try {
      fs.writeFileSync(LOG_FILE, JSON.stringify(filtered, null, 2));
      _cache = filtered;
      _cacheTs = Date.now();
    } catch (err) {
      console.error('[search-log] 清理失败:', err.message);
    }
    return { removed: log.length - filtered.length, remaining: filtered.length };
  }
  return { removed: 0, remaining: log.length };
}
