import { runOv } from '../ov-client.js';
import { json } from '../middleware.js';

export async function handleStatus(req, res, url) {
  const data = await runOv(['status']);
  json(res, data);
}

export async function handleHealth(req, res, url) {
  const data = await runOv(['health']);
  json(res, data);
}

export async function handleVersion(req, res, url) {
  const data = await runOv(['version']);
  json(res, data);
}

export async function handleWait(req, res, url) {
  const data = await runOv(['wait']);
  json(res, data);
}
