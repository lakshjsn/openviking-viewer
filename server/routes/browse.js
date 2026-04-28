import { runOv } from '../ov-client.js';
import { json } from '../middleware.js';

/** GET /api/tree?uri=&depth=3 */
export async function handleTree(req, res, url) {
  const uri = url.searchParams.get('uri') || 'viking://';
  const depth = parseInt(url.searchParams.get('depth') || '3');
  const data = await runOv(['tree', uri, '-L', String(depth), '-l', '512', '-n', '1024']);
  json(res, data);
}

/** GET /api/ls?uri= */
export async function handleLs(req, res, url) {
  const uri = url.searchParams.get('uri') || 'viking://';
  const data = await runOv(['ls', uri, '-l', '512', '-n', '1024']);
  json(res, data);
}
