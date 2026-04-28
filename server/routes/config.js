import { OV_CONFIG, PORT } from '../config.js';
import { json } from '../middleware.js';

export function handleConfig(req, res, url) {
  json(res, {
    ok: true,
    config: {
      ovCommand: OV_CONFIG.ovCommand,
      host: OV_CONFIG.host,
      port: OV_CONFIG.port,
      workspacePath: OV_CONFIG.workspacePath,
      viewerPort: PORT,
    }
  });
}
