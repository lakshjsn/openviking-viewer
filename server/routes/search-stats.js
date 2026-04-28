import { getStats, cleanup, readLog } from '../search-log.js';
import { json } from '../middleware.js';

/**
 * GET /api/search-stats?since=&until= — 搜索统计聚合
 *
 * 返回所有经过 viewer 后端的检索请求的聚合指标：
 *   - 总查询次数、总结果数、平均延迟、零结果率
 *   - 按来源分组（viewer / agent_cli / external）
 *   - 最近 20 条搜索记录
 *
 * Dashboard 的「检索统计」面板使用此接口。
 */
export async function handleSearchStats(req, res, url) {
  const since = url.searchParams.get('since') || '';
  const until = url.searchParams.get('until') || '';

  try {
    const stats = getStats({
      since: since || undefined,
      until: until || undefined,
    });
    json(res, { ok: true, ...stats });
  } catch (err) {
    json(res, { ok: false, error: err.message }, 500);
  }
}

/**
 * GET /api/search-log?limit=50 — 原始搜索日志（调试用）
 */
export async function handleSearchLog(req, res, url) {
  const limit = parseInt(url.searchParams.get('limit') || '50');

  try {
    const log = readLog();
    const recent = log.slice(-limit).map(({ id, timestamp, query, type, source, resultCount, actualResults, avgScore, latencyMs }) => ({
      id, timestamp, query, type, source, resultCount, actualResults,
      avgScore: avgScore != null ? +avgScore.toFixed(4) : null,
      latencyMs,
    }));
    json(res, { ok: true, total: log.length, records: recent });
  } catch (err) {
    json(res, { ok: false, error: err.message }, 500);
  }
}

/**
 * POST /api/search-log/cleanup — 清理过期日志（保留默认 30 天）
 */
export async function handleCleanup(req, res, url) {
  const days = parseInt(url.searchParams.get('days') || '30');

  try {
    const result = cleanup(days);
    json(res, { ok: true, ...result });
  } catch (err) {
    json(res, { ok: false, error: err.message }, 500);
  }
}
