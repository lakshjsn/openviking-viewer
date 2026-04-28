import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { OV_CONFIG } from '../config.js';
import { json } from '../middleware.js';

/** GET /api/workspace/queue — SQLite Queue 可视化 */
export async function handleQueue(req, res, url) {
  const queueDbPath = path.join(OV_CONFIG.workspacePath, '_system', 'queue', 'queue.db');

  if (!fs.existsSync(queueDbPath)) {
    return json(res, { ok: true, tables: [], summary: {} });
  }

  try {
    // 查询各队列统计
    const summary = execSync(`sqlite3 "${queueDbPath}" "SELECT queue_name, COUNT(*) as total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) as processing, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed FROM queue_messages GROUP BY queue_name;"`, { encoding: 'utf-8' });

    // 查询最近的消息
    const recent = execSync(`sqlite3 -json "${queueDbPath}" "SELECT id, queue_name, message_id, substr(data, 1, 500) as data_preview, timestamp, status, datetime(timestamp, 'unixepoch', 'localtime') as time_str FROM queue_messages ORDER BY id DESC LIMIT 50;"`, { encoding: 'utf-8' });

    // 查询表结构
    const schema = execSync(`sqlite3 "${queueDbPath}" ".schema"`, { encoding: 'utf-8' });

    // 解析 summary
    const queueStats = summary.trim().split('\n').filter(l => l.trim()).map(line => {
      const parts = line.split('|');
      return {
        queue_name: parts[0] || '',
        total: parseInt(parts[1]) || 0,
        pending: parseInt(parts[2]) || 0,
        processing: parseInt(parts[3]) || 0,
        completed: parseInt(parts[4]) || 0,
        failed: parseInt(parts[5]) || 0,
      };
    });

    let recentMessages = [];
    try { recentMessages = JSON.parse(recent); } catch { /* ignore */ }

    json(res, { ok: true, summary: queueStats, recent: recentMessages, schema: schema.trim() });
  } catch (e) {
    json(res, { error: 'Failed to query SQLite: ' + e.message }, 500);
  }
}
