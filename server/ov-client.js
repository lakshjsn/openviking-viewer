import { execFile } from 'node:child_process';
import { OV_CONFIG } from './config.js';

/** 检测 OpenViking CLI 是否可用 */
export async function checkOvAvailable() {
  return new Promise((resolve) => {
    execFile(OV_CONFIG.ovCommand, ['--version'], { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

/** 调用 ov CLI 命令，自动解析 JSON 输出 */
export function runOv(args) {
  return new Promise((resolve, reject) => {
    const allArgs = [...args, '-o', 'json'];
    execFile(OV_CONFIG.ovCommand, allArgs, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject({ error: err.message, stderr: stderr.trim(), stdout: stdout.trim() });
        return;
      }
      // ov CLI sometimes outputs a "cmd: ..." debug line before JSON
      const lines = stdout.trim().split('\n');
      let jsonStr = '';
      for (const line of lines) {
        if (line.startsWith('{')) {
          jsonStr = line;
          break;
        }
      }
      if (!jsonStr) {
        // Maybe multi-line JSON or pure text
        const combined = lines.filter(l => !l.startsWith('cmd:')).join('\n').trim();
        try {
          resolve(JSON.parse(combined));
        } catch {
          resolve({ raw: combined });
        }
        return;
      }
      try {
        resolve(JSON.parse(jsonStr));
      } catch {
        resolve({ raw: stdout.trim() });
      }
    });
  });
}
