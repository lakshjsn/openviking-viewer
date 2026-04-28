import { runOv } from '../ov-client.js';
import { json } from '../middleware.js';

/**
 * OpenViking 三层阅读模型：
 *   L0: ov abstract <目录URI>  → 目录/实体的摘要描述
 *   L1: ov overview <目录URI>  → 目录的结构化概览
 *   L2: ov read    <文件URI>  → 文件的完整原文
 *
 * 注意：abstract / overview 只接受目录 URI，read 只接受文件 URI。
 *       ov CLI 不支持 --raw 参数，直接用 -o json（由 runOv 自动追加）。
 */

/** GET /api/read?uri= — 原始文件内容 (L2) */
export async function handleRead(req, res, url) {
  const uri = url.searchParams.get('uri');
  if (!uri) return json(res, { error: 'uri is required' }, 400);
  const data = await runOv(['read', uri]);
  json(res, data);
}

/** GET /api/abstract?uri= — 摘要层 (L0，仅接受目录 URI) */
export async function handleAbstract(req, res, url) {
  const uri = url.searchParams.get('uri');
  if (!uri) return json(res, { error: 'uri is required' }, 400);
  const data = await runOv(['abstract', uri]);
  json(res, data);
}

/** GET /api/overview?uri= — 概览层 (L1，仅接受目录 URI) */
export async function handleOverview(req, res, url) {
  const uri = url.searchParams.get('uri');
  if (!uri) return json(res, { error: 'uri is required' }, 400);
  const data = await runOv(['overview', uri]);
  json(res, data);
}

/** GET /api/stat?uri= — 文件元信息 */
export async function handleStat(req, res, url) {
  const uri = url.searchParams.get('uri');
  if (!uri) return json(res, { error: 'uri is required' }, 400);
  const data = await runOv(['stat', uri]);
  json(res, data);
}
