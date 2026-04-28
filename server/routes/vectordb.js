import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { OV_CONFIG } from '../config.js';
import { json } from '../middleware.js';

/** GET /api/workspace/vectordb — VectorDB 元数据 */
export async function handleVectordb(req, res, url) {
  const metaPath = path.join(OV_CONFIG.workspacePath, 'vectordb', 'context', 'collection_meta.json');
  const indexMetaPath = path.join(OV_CONFIG.workspacePath, 'vectordb', 'context', 'index', 'default', 'index_meta.json');

  const result = { ok: true, collection: null, index: null, diskUsage: {} };

  try {
    if (fs.existsSync(metaPath)) {
      result.collection = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    }
    if (fs.existsSync(indexMetaPath)) {
      result.index = JSON.parse(fs.readFileSync(indexMetaPath, 'utf-8'));
    }

    // 计算磁盘使用量
    const storePath = path.join(OV_CONFIG.workspacePath, 'vectordb', 'context', 'store');
    const indexPath = path.join(OV_CONFIG.workspacePath, 'vectordb', 'context', 'index');

    if (fs.existsSync(storePath)) {
      result.diskUsage.store = execSync(`du -sh "${storePath}"`, { encoding: 'utf-8' }).trim().split('\t')[0];
    }
    if (fs.existsSync(indexPath)) {
      result.diskUsage.index = execSync(`du -sh "${indexPath}"`, { encoding: 'utf-8' }).trim().split('\t')[0];
    }

    // 列出索引版本
    const versionsDir = path.join(OV_CONFIG.workspacePath, 'vectordb', 'context', 'index', 'default', 'versions');
    if (fs.existsSync(versionsDir)) {
      const versions = fs.readdirSync(versionsDir).filter(d => {
        const doneFile = path.join(versionsDir, d, d + '.write_done');
        return fs.statSync(path.join(versionsDir, d)).isDirectory() && fs.existsSync(doneFile);
      });

      result.versions = versions.map(v => {
        const metaFile = path.join(versionsDir, v, 'manager_meta.json');
        let meta = null;
        try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')); } catch { /* ignore */ }

        let size = '-';
        try { size = execSync(`du -sh "${path.join(versionsDir, v)}"`, { encoding: 'utf-8' }).trim().split('\t')[0]; } catch { /* ignore */ }

        return { version: v, size, meta };
      });
    }
  } catch (e) {
    json(res, { error: 'Failed to read VectorDB: ' + e.message }, 500);
    return;
  }

  json(res, result);
}
