import { runOv } from '../ov-client.js';
import { json } from '../middleware.js';

/**
 * GET /api/observer/queue
 *
 * 返回 OpenViking 队列的实时处理状态（Embedding / Semantic / Semantic-Nodes）。
 * 前端 RebuildProgress 组件用此数据校准进度条阶段显示。
 */
export async function handleObserverQueue(req, res) {
  try {
    const data = await runOv(['observer', 'queue']);

    if (!data?.ok) {
      return json(res, { ok: false, error: 'Failed to fetch queue status' }, 500);
    }

    // 解析队列表格为结构化数据
    const raw = data.result?.status || '';
    const queues = parseQueueTable(raw);

    json(res, {
      ok: true,
      queues,
      // 便捷聚合：是否有任何队列在活跃处理中
      active: queues.some(q => q.inProgress > 0),
      // 总体摘要
      summary: {
        totalPending: queues.reduce((s, q) => s + q.pending, 0),
        totalInProgress: queues.reduce((s, q) => s + q.inProgress, 0),
        totalProcessed: queues.reduce((s, q) => s + q.processed, 0),
        totalErrors: queues.reduce((s, q) => s + q.errors, 0),
      },
    });
  } catch (err) {
    json(res, { ok: false, error: err.error || 'Observer queue failed' }, 500);
  }
}

/**
 * 解析 ov observer queue 的表格输出为结构化数组
 *
 * 输入格式：
 *   | Queue | Pending | In Progress | Processed | Errors | Total |
 *   | Embedding | 0 | 0 | 408 | 0 | 408 |
 *   | Semantic | 0 | 2 | 78 | 0 | 80 |
 */
function parseQueueTable(raw) {
  const lines = raw.split('\n').filter(l => l.trim() && !l.includes('---') && !l.includes('Queue'));
  return lines.map(line => {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 6) {
      return {
        name: cells[0],
        pending: parseInt(cells[1]) || 0,
        inProgress: parseInt(cells[2]) || 0,
        processed: parseInt(cells[3]) || 0,
        errors: parseInt(cells[4]) || 0,
        total: parseInt(cells[5]) || 0,
      };
    }
    return null;
  }).filter(Boolean);
}
