import path from 'node:path';
import os from 'node:os';

export const PORT = process.env.OV_VIEWER_PORT || 3199;

export const OV_CONFIG = {
  host: process.env.OV_HOST || 'localhost',
  port: process.env.OV_PORT || 1933,
  workspacePath: process.env.OV_STORAGE_PATH || path.join(os.homedir(), '.openviking', 'workspace'),
  ovCommand: process.env.OV_COMMAND || 'ov',
};
