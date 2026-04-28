import path from 'node:path';
import fs from 'node:fs';
import { OV_CONFIG } from '../config.js';
import { json } from '../middleware.js';
import { runOv } from '../ov-client.js';

// ========== Workspace 物理文件系统 ==========

/**
 * OpenViking 默认基础目录（安装时自动创建，禁止删除）
 *
 * 实际 workspace 结构：
 *   workspace/
 *   ├── _system/          系统运行时（queue.db等）
 *   ├── temp/             临时文件
 *   ├── vectordb/         向量数据库存储
 *   └── viking/           Viking 数据根
 *       ├── _system/      viking系统数据
 *       └── default/      默认实例
 *           ├── agent/    Agent 记忆与学习
 *           ├── user/     用户偏好与实体
 *           ├── session/  会话历史记录
 *           ├── resources/ 导入的资源文档
 *           └── temp/     临时文件
 */
const RESERVED_DIRS = new Set([
  // === 一级系统目录（workspace直下）===
  '_system',
  'vectordb',
  'viking',

  // === Viking默认实例下的基础目录 ===
  'viking/default/agent',
  'viking/default/user',
  'viking/default/session',
  'viking/default/resources',

  // === Viking系统目录 ===
  'viking/_system',
]);

/**
 * 检查目标路径是否为受保护的默认目录或其父级
 * @param {string} relPath - workspace 相对路径，如 "viking/agent" 或 "viking"
 * @returns {{ protected: boolean; reason?: string }}
 */
function isReservedPath(relPath) {
  const normalized = relPath.replace(/^\/+/, '');

  // 精确匹配受保护目录
  if (RESERVED_DIRS.has(normalized)) {
    return {
      protected: true,
      reason: `"${normalized}" 是 OpenViking 默认基础目录，不允许删除`,
    };
  }

  // 检查是否为受保护目录的子路径（防止通过删除上级绕过）
  for (const reserved of RESERVED_DIRS) {
    if (normalized.startsWith(reserved + '/')) {
      return {
        protected: true,
        reason: `目标路径包含受保护的默认目录 "${reserved}"`,
      };
    }
  }

  return { protected: false };
}

/**
 * 将 workspace 相对路径转换为 viking:// URI
 * 例如: "viking/resources/my_project" → "viking://resources/my_project"
 */
function workspacePathToVikingUri(relPath) {
  // workspace 下的资源目录通常在 viking/ 下
  const normalized = relPath.replace(/^\/+/, '');
  return `viking://${normalized}`;
}

/** DELETE /api/workspace/rm?path=&recursive= — 删除文件/目录并同步清理向量索引 */
export async function handleWorkspaceRm(req, res, url) {
  const relPath = url.searchParams.get('path');
  if (!relPath) return json(res, { error: 'path is required' }, 400);

  const recursive = url.searchParams.get('recursive') === 'true';
  const fullPath = path.join(OV_CONFIG.workspacePath, relPath);

  // 安全检查：路径必须在 workspace 内
  if (!fullPath.startsWith(OV_CONFIG.workspacePath)) {
    return json(res, { error: 'Access denied' }, 403);
  }

  // 保护检查：禁止删除 OpenViking 默认基础目录
  const reserved = isReservedPath(relPath);
  if (reserved.protected) {
    return json(res, { error: reserved.reason, code: 'RESERVED_PATH' }, 403);
  }

  // 检查目标是否存在
  if (!fs.existsSync(fullPath)) {
    return json(res, { error: 'File or directory not found' }, 404);
  }

  const isDir = fs.statSync(fullPath).isDirectory();
  const targetName = isDir ? '目录' : '文件';

  try {
    // 步骤1: 通过 ov CLI 调用 rm 命令，自动同步清理向量索引
    // ov rm 会级联处理: 删除文件 → 清理 VectorDB 中对应的向量记录
    const vikingUri = workspacePathToVikingUri(relPath);
    const ovArgs = ['rm', vikingUri];
    if (recursive && isDir) {
      ovArgs.push('-r');
    }
    await runOv(ovArgs);

    // 步骤2: 确认物理文件已被清理（ov rm 可能已删除，做双重确认）
    if (fs.existsSync(fullPath)) {
      // 如果 ov rm 未清理物理文件（某些情况下可能只删了向量），手动删除
      if (isDir) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }

    json(res, {
      ok: true,
      message: `${targetName}已删除`,
      path: relPath,
      uri: vikingUri,
      recursive,
      vectorCleaned: true,
    });
  } catch (e) {
    // 如果 ov rm 失败（比如向量不存在），仍然尝试删除物理文件
    try {
      if (fs.existsSync(fullPath)) {
        if (isDir) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      }
      json(res, {
        ok: true,
        message: `${targetName}已删除（向量清理警告: ${e.message}）`,
        path: relPath,
        vectorCleaned: false,
        warning: e.message,
      });
    } catch (fsErr) {
      json(res, { error: `删除失败: ${fsErr.message}` }, 500);
    }
  }
}

/** GET /api/workspace/ls?path= — 列出 workspace 目录 */
export async function handleWorkspaceLs(req, res, url) {
  const relPath = url.searchParams.get('path') || '';
  const targetDir = path.join(OV_CONFIG.workspacePath, relPath);

  // 安全检查：确保路径在 workspace 内
  if (!targetDir.startsWith(OV_CONFIG.workspacePath)) {
    return json(res, { error: 'Access denied' }, 403);
  }
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return json(res, { error: 'Directory not found' }, 404);
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const items = entries
    .filter(e => !e.name.startsWith('.DS_Store'))
    .map(e => {
      const fullPath = path.join(targetDir, e.name);
      const stat = fs.statSync(fullPath);
      return {
        name: e.name,
        isDir: e.isDirectory(),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        relPath: path.join(relPath, e.name),
      };
    })
    .sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

  json(res, { ok: true, path: relPath, items });
}

/** GET /api/workspace/file?path= — 读取 workspace 文件内容 */
export async function handleWorkspaceFile(req, res, url) {
  const relPath = url.searchParams.get('path');
  if (!relPath) return json(res, { error: 'path is required' }, 400);

  const fullPath = path.join(OV_CONFIG.workspacePath, relPath);
  if (!fullPath.startsWith(OV_CONFIG.workspacePath)) {
    return json(res, { error: 'Access denied' }, 403);
  }
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return json(res, { error: 'File not found' }, 404);
  }

  const stat = fs.statSync(fullPath);
  const maxSize = 1024 * 1024; // 最大读取 1MB

  if (stat.size > maxSize) {
    json(res, { ok: true, name: path.basename(fullPath), size: stat.size, truncated: true, content: `(文件过大: ${(stat.size / 1024).toFixed(1)} KB，仅显示前 ${maxSize / 1024} KB)` });
  } else {
    const content = fs.readFileSync(fullPath, 'utf-8');
    json(res, { ok: true, name: path.basename(fullPath), size: stat.size, content });
  }
}

/** GET /api/workspace/binary?path= — LevelDB 二进制文件处理 */
export async function handleWorkspaceBinary(req, res, url) {
  const relPath = url.searchParams.get('path');
  if (!relPath) return json(res, { error: 'path is required' }, 400);

  // 对于 vectordb/context/store 下的文件，通过 ov ls 读取存储的数据目录
  if (relPath.includes('vectordb/context/store')) {
    try {
      const listData = await runOv(['ls', 'viking://']);

      let statusData = null;
      try {
        statusData = await runOv(['status']);
      } catch { /* ignore */ }

      json(res, {
        ok: true,
        binary: true,
        path: relPath,
        message: 'LevelDB 二进制存储文件 - 存储数据总览',
        hint: '下面显示通过 ov 命令获取的存储数据。',
        resources: listData,
        status: statusData
      });
      return;
    } catch (e) {
      json(res, {
        ok: true,
        binary: true,
        path: relPath,
        message: 'LevelDB 二进制存储文件',
        error: e.message,
        hint: '使用 ov CLI 命令可以访问存储的数据：ov ls viking:// 或 ov status'
      });
      return;
    }
  }

  json(res, {
    ok: true,
    binary: true,
    path: relPath,
    message: 'LevelDB 二进制存储文件',
    hint: '使用 ov CLI 命令可以访问存储的数据：ov read viking://... 或 ov search "keyword"'
  });
}
