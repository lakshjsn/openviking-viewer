import { runOv } from '../ov-client.js';
import { json } from '../middleware.js';

/** GET /api/relations?uri= */
export async function handleRelations(req, res, url) {
  const uri = url.searchParams.get('uri');
  if (!uri) return json(res, { error: 'uri is required' }, 400);
  const data = await runOv(['relations', uri]);
  json(res, data);
}
