import { runOv } from '../ov-client.js';
import { json } from '../middleware.js';
import { appendLog } from '../search-log.js';

/**
 * 从请求头或参数中推断搜索来源
 *
 * 来源分类：
 *   - viewer   : 从 Dashboard/Search 页面发起（前端 UI）
 *   - agent_cli: Agent 通过 CLI/脚本调用（带 X-Search-Source 头或 source 参数）
 *   - external : 其他来源（默认）
 */
function detectSource(req, url) {
  // 优先从请求头读取
  const headerSource = req.headers['x-search-source'];
  if (headerSource) return headerSource;
  // 其次从 URL 参数
  const paramSource = url.searchParams.get('source');
  if (paramSource) return paramSource;
  // 默认：检查 Referer 判断是否来自 viewer 自身页面
  const referer = req.headers['referer'] || '';
  if (referer.includes('/search') || referer.includes('/dashboard')) return 'viewer';
  return 'external';
}

/** 提取 OV 返回结果中的统计信息 */
function extractOvStats(ovData) {
  if (!ovData || !ovData.ok) return null;
  const results = ovData.result;
  if (!Array.isArray(results)) return null;

  let scoreSum = 0;
  let scoreCount = 0;
  for (const r of results) {
    if (r.score != null) { scoreSum += r.score; scoreCount++; }
  }

  return {
    resultCount: results.length,
    avgScore: scoreCount > 0 ? scoreSum / scoreCount : 0,
  };
}

/** GET /api/find?q=&n=20&uri= — 语义搜索 */
export async function handleFind(req, res, url) {
  const query = url.searchParams.get('q');
  const uri = url.searchParams.get('uri') || '';
  const n = url.searchParams.get('n') || '20';
  if (!query) return json(res, { error: 'q is required' }, 400);

  const source = detectSource(req, url);
  const startTime = Date.now();

  const args = ['find', query, '-n', n];
  if (uri) args.push('--uri', uri);
  const data = await runOv(args);

  const latencyMs = Date.now() - startTime;
  const stats = extractOvStats(data);

  // 写入搜索日志（同步，不阻塞响应）
  try {
    appendLog({
      type: 'find',
      query,
      uri: uri || undefined,
      resultCount: n, // 请求的 n 值
      actualResults: stats?.resultCount ?? 0,
      avgScore: stats?.avgScore ?? null,
      latencyMs,
      source,
    });
  } catch {}

  json(res, data);
}

/** GET /api/search?q=&n=20 — 上下文感知搜索 */
export async function handleSearch(req, res, url) {
  const query = url.searchParams.get('q');
  const n = url.searchParams.get('n') || '20';
  if (!query) return json(res, { error: 'q is required' }, 400);

  const source = detectSource(req, url);
  const startTime = Date.now();

  const data = await runOv(['search', query, '-n', n]);

  const latencyMs = Date.now() - startTime;
  const stats = extractOvStats(data);

  // 写入搜索日志（同步，不阻塞响应）
  try {
    appendLog({
      type: 'search',
      query,
      resultCount: n,
      actualResults: stats?.resultCount ?? 0,
      avgScore: stats?.avgScore ?? null,
      latencyMs,
      source,
    });
  } catch {}

  json(res, data);
}

/** GET /api/grep?q=&uri= — 正则搜索 */
export async function handleGrep(req, res, url) {
  const pattern = url.searchParams.get('q');
  const uri = url.searchParams.get('uri') || '';
  if (!pattern) return json(res, { error: 'q is required' }, 400);

  const source = detectSource(req, url);
  const startTime = Date.now();

  const args = ['grep', pattern];
  if (uri) args.push('--uri', uri);
  const data = await runOv(args);

  const latencyMs = Date.now() - startTime;

  try {
    appendLog({
      type: 'grep',
      query: pattern,
      uri: uri || undefined,
      latencyMs,
      source,
    });
  } catch {}

  json(res, data);
}

/** GET /api/glob?q=&uri= — 文件名模式匹配 */
export async function handleGlob(req, res, url) {
  const pattern = url.searchParams.get('q');
  const uri = url.searchParams.get('uri') || '';
  if (!pattern) return json(res, { error: 'q is required' }, 400);

  const source = detectSource(req, url);
  const startTime = Date.now();

  const args = ['glob', pattern];
  if (uri) args.push('--uri', uri);
  const data = await runOv(args);

  const latencyMs = Date.now() - startTime;

  try {
    appendLog({
      type: 'glob',
      query: pattern,
      uri: uri || undefined,
      latencyMs,
      source,
    });
  } catch {}

  json(res, data);
}
