import path from 'node:path';
import fs from 'node:fs';
import { OV_CONFIG } from '../config.js';
import { json } from '../middleware.js';
import { runOv } from '../ov-client.js';

/**
 * 需要清理的用户数据目录（递归删除整个目录）
 * 清理这些目录 = 回归初始安装状态
 *
 * 实际 workspace 结构：
 *   workspace/
 *   ├── .openviking.pid    ← PID文件（ov自动重建）
 *   ├── _system/           ← 系统运行时骨架（保留目录）
 *   │   └── queue/        ← 消息队列数据（可重建）
 *   ├── temp/             ← 临时文件
 *   ├── vectordb/         ← 向量数据库存储
 *   │   └── context/      ← LevelDB向量索引
 *   └── viking/           ← Viking数据根
 *       ├── _system/      ← viking系统数据
 *       └── default/      ← 默认实例
 *           ├── agent/    ← Agent记忆与学习
 *           ├── user/     ← 用户偏好与实体
 *           ├── session/  ← 会话历史记录
 *           ├── resources/← 导入的资源文档
 *           └── temp/     ← 临时文件
 */
const RESETTABLE_DIRS = [
  // Viking默认实例下的用户数据
  'viking/default/agent',
  'viking/default/user',
  'viking/default/session',
  'viking/default/resources',
  'viking/default/temp',
  // Viking系统可重置数据
  'viking/_system',
  // 一级用户/临时数据
  'temp',
];

/**
 * 需要清空内容但保留目录本身的项目
 * key: 目录路径, value: 文件名匹配模式（匹配则删，不匹配则留）
 */
const CLEAN_CONTENT_DIRS = {
  '_system/queue': /^queue\./,   // 只删 queue.db / .shm / .wal，保留目录
  'vectordb/context': /.*/,     // 清空 context 下所有内容（LevelDB会自动重建）
};

/** POST /api/workspace/reset — 一键清空用户数据，回归初始状态 */
export async function handleWorkspaceReset(req, res) {
  const results = [];
  let hasError = false;

  // 1. 递归删除整个用户数据目录
  for (const dir of RESETTABLE_DIRS) {
    const fullPath = path.join(OV_CONFIG.workspacePath, dir);
    try {
      if (fs.existsSync(fullPath)) {
        // 先通过 ov CLI 清理对应的向量索引
        const vikingUri = `viking://${dir}`;
        try {
          await runOv(['rm', vikingUri, '-r']);
        } catch {
          // ov rm 失败也继续清理物理文件
        }
        // 再递归删除物理文件
        fs.rmSync(fullPath, { recursive: true, force: true });
        results.push({ dir, status: 'cleaned' });
      } else {
        results.push({ dir, status: 'skipped', reason: 'not found' });
      }
    } catch (e) {
      hasError = true;
      results.push({ dir, status: 'error', message: e.message });
    }
  }

  // 2. 清空指定目录的内容（保留目录骨架）
  for (const [dir, pattern] of Object.entries(CLEAN_CONTENT_DIRS)) {
    const fullPath = path.join(OV_CONFIG.workspacePath, dir);
    try {
      if (fs.existsSync(fullPath)) {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        let cleanedCount = 0;
        for (const entry of entries) {
          if (pattern.test(entry.name)) {
            const ep = path.join(fullPath, entry.name);
            entry.isDirectory()
              ? fs.rmSync(ep, { recursive: true, force: true })
              : fs.unlinkSync(ep);
            cleanedCount++;
          }
        }
        results.push({ dir, status: 'cleaned', detail: `${cleanedCount} items removed` });
      } else {
        results.push({ dir, status: 'skipped', reason: 'not found' });
      }
    } catch (e) {
      hasError = true;
      results.push({ dir, status: 'error', message: e.message });
    }
  }

  // 3. 删除PID文件（ov启动时会自动重新生成）
  const pidFile = path.join(OV_CONFIG.workspacePath, '.openviking.pid');
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
      results.push({ dir: '.openviking.pid', status: 'cleaned' });
    }
  } catch (e) {
    hasError = true;
    results.push({ dir: '.openviking.pid', status: 'error', message: e.message });
  }

  json(res, {
    ok: !hasError,
    message: hasError ? '部分清理完成，存在错误' : '存储已重置为初始状态',
    results,
    note: '系统基础目录结构已保留，OpenViking 将在下次访问时自动重建空目录和数据文件',
  }, hasError ? 207 : 200);
}
