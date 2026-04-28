import { runOv } from '../ov-client.js';
import { json } from '../middleware.js';

/**
 * POST /api/rebuild
 *
 * 触发对指定资源节点重新生成 abstract（L0 摘要）。
 * 前端"重试按钮"调用此接口，而非简单刷新状态。
 *
 * Body: { uri: string }  — 目标资源节点的 URI
 */
export async function handleRebuild(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);

  await new Promise(resolve => req.on('end', resolve));

  let params;
  try {
    params = JSON.parse(body || '{}');
  } catch {
    return json(res, { error: 'Invalid JSON body' }, 400);
  }

  const uri = params.uri;
  if (!uri) {
    return json(res, { error: 'uri is required in request body' }, 400);
  }

  try {
    // 调用 ov reindex -r 重新生成该节点的 .abstract.md 和 .overview.md
    // --regenerate: 强制重新生成摘要，即使 .abstract.md 已存在（包括占位文本）
    // reindex 会触发 VLM 对目录内容进行语义分析，重新生成 L0 摘要和 L1 概览
    const result = await runOv(['reindex', '-r', uri]);

    if (result?.ok) {
      json(res, {
        ok: true,
        uri,
        message: '摘要重新生成已触发',
        result: result.result,
        rebuiltAt: new Date().toISOString(),
      });
    } else {
      json(res, {
        ok: false,
        uri,
        error: '重新生成失败',
        detail: result,
      }, 500);
    }
  } catch (err) {
    json(res, {
      ok: false,
      uri,
      error: err.error || 'Rebuild failed',
      stderr: err.stderr || null,
    }, 500);
  }
}
