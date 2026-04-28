import { runOv } from '../ov-client.js';
import { json } from '../middleware.js';

/** GET /api/workspace/sessions — 会话列表 */
export async function handleSessionList(req, res, url) {
  try {
    const data = await runOv(['session', 'list']);
    json(res, { ok: true, sessions: data.result || [] });
  } catch (e) {
    json(res, { ok: true, sessions: [], error: e.message });
  }
}

/** GET /api/workspace/session?id= — 单个会话详情（含消息） */
export async function handleSessionGet(req, res, url) {
  const sessionId = url.searchParams.get('id');
  if (!sessionId) return json(res, { error: 'id is required' }, 400);

  try {
    // 获取 session 元数据（可能 NOT_FOUND 如果已归档/删除）
    let meta = {};
    try {
      const data = await runOv(['session', 'get', sessionId]);
      meta = data.result || {};
    } catch (metaErr) {
      // session get 失败（如 NOT_FOUND），fallback 到空 meta，仍尝试读文件
      console.error('[session] get meta failed:', metaErr.message || metaErr);
      meta = { session_id: sessionId };
    }

    // 读取消息：先读 messages.jsonl，再读 history/archive_*/messages.jsonl
    let messages = [];
    const baseUri = `viking://session/default/${sessionId}`;

    // 辅助函数：从 ov read 结果中提取文本
    const extractText = (data) => {
      if (typeof data === 'string') return data;
      if (data && data.raw) return data.raw;
      return JSON.stringify(data);
    };

    // 1. 当前活跃消息
    try {
      const msgData = await runOv(['read', `${baseUri}/messages.jsonl`]);
      const raw = extractText(msgData);
      messages.push(...raw.trim().split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean));
    } catch {
      /* 无活跃消息 */
    }

    // 2. 归档历史消息 (history/archive_XXX/messages.jsonl)
    try {
      const lsData = await runOv(['ls', `${baseUri}/history/`]);
      const archives = (lsData.result || []).filter((item) => item.is_dir && item.uri.includes('archive_'));
      for (const arch of archives) {
        try {
          const archMsgData = await runOv(['read', `${arch.uri}/messages.jsonl`]);
          const raw = extractText(archMsgData);
          messages.push(...raw.trim().split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean));
        } catch {
          /* 该归档无消息 */
        }
      }
    } catch {
      /* 无 history 目录 */
    }

    json(res, { ok: true, session: { ...meta, messages } });
  } catch (e) {
    json(res, { ok: false, error: e.message }, 500);
  }
}
