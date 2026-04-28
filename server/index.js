import http from 'node:http';
import { URL } from 'node:url';
import { PORT, OV_CONFIG } from './config.js';
import { checkOvAvailable } from './ov-client.js';
import { setupCors, handleOptions, json } from './middleware.js';

// 路由处理器
import { handleConfig } from './routes/config.js';
import { handleStatus, handleHealth, handleVersion, handleWait } from './routes/status.js';
import { handleTree, handleLs } from './routes/browse.js';
import { handleRead, handleAbstract, handleOverview, handleStat } from './routes/files.js';
import { handleFind, handleSearch, handleGrep, handleGlob } from './routes/search.js';
import { handleRelations } from './routes/relations.js';
import { handleWorkspaceLs, handleWorkspaceFile, handleWorkspaceBinary, handleWorkspaceRm } from './routes/workspace.js';
import { handleWorkspaceReset } from './routes/workspace-reset.js';
import { handleQueue } from './routes/queue.js';
import { handleVectordb } from './routes/vectordb.js';
import { handleSessionList, handleSessionGet } from './routes/sessions.js';
import { handleResources } from './routes/resources.js';
import { handleRebuild } from './routes/rebuild.js';
import { handleObserverQueue } from './routes/observer.js';
import { handleSearchStats, handleSearchLog, handleCleanup } from './routes/search-stats.js';

// ========== 路由表 ==========
const routes = [
  // 配置信息
  { method: 'GET',  path: '/api/config',           handler: handleConfig },

  // 系统状态
  { method: 'GET',  path: '/api/status',            handler: handleStatus },
  { method: 'GET',  path: '/api/health',            handler: handleHealth },
  { method: 'GET',  path: '/api/version',           handler: handleVersion },

  // 目录浏览
  { method: 'GET',  path: '/api/tree',              handler: handleTree },
  { method: 'GET',  path: '/api/ls',                handler: handleLs },

  // 文件读取（三个层级）
  { method: 'GET',  path: '/api/read',              handler: handleRead },
  { method: 'GET',  path: '/api/abstract',          handler: handleAbstract },
  { method: 'GET',  path: '/api/overview',          handler: handleOverview },
  { method: 'GET',  path: '/api/stat',              handler: handleStat },

  // 搜索
  { method: 'GET',  path: '/api/find',              handler: handleFind },
  { method: 'GET',  path: '/api/search',            handler: handleSearch },
  { method: 'GET',  path: '/api/grep',              handler: handleGrep },
  { method: 'GET',  path: '/api/glob',              handler: handleGlob },

  // 关系
  { method: 'GET',  path: '/api/relations',         handler: handleRelations },

  // Workspace 物理文件系统
  { method: 'GET',    path: '/api/workspace/ls',      handler: handleWorkspaceLs },
  { method: 'GET',    path: '/api/workspace/file',    handler: handleWorkspaceFile },
  { method: 'GET',    path: '/api/workspace/binary',  handler: handleWorkspaceBinary },
  { method: 'DELETE', path: '/api/workspace/rm',      handler: handleWorkspaceRm },
  { method: 'POST',   path: '/api/workspace/reset',   handler: handleWorkspaceReset },

  // SQLite Queue 可视化
  { method: 'GET',  path: '/api/workspace/queue',   handler: handleQueue },

  // VectorDB 元数据
  { method: 'GET',  path: '/api/workspace/vectordb', handler: handleVectordb },

  // Session 对话记录
  { method: 'GET',  path: '/api/workspace/sessions', handler: handleSessionList },
  { method: 'GET',  path: '/api/workspace/session',  handler: handleSessionGet },

  // 知识库资源构建状态
  { method: 'GET', path: '/api/resources',          handler: handleResources },

  // 重新生成摘要
  { method: 'POST', path: '/api/rebuild',            handler: handleRebuild },

  // Observer 队列状态（进度条校准用）
  { method: 'GET',  path: '/api/observer/queue',     handler: handleObserverQueue },

  // 搜索统计（全量检索日志聚合）
  { method: 'GET',    path: '/api/search-stats',      handler: handleSearchStats },
  { method: 'GET',    path: '/api/search-log',        handler: handleSearchLog },
  { method: 'POST',   path: '/api/search-log/cleanup', handler: handleCleanup },

  // 其他
  { method: 'POST', path: '/api/wait',              handler: handleWait },
];

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS + OPTIONS 预检
  setupCors(res);
  if (handleOptions(req, res)) return;

  // 查找匹配的路由
  const match = routes.find(r => r.method === req.method && r.path === pathname);

  if (match) {
    try {
      await match.handler(req, res, url);
    } catch (err) {
      json(res, { error: err.error || 'Unknown error', detail: err.stderr || err.message }, 500);
    }
  } else {
    json(res, {
      error: 'Not found',
      available: routes.map(r => `${r.method} ${r.path}`)
    }, 404);
  }
}

// ========== 启动 ==========
const server = http.createServer(handleRequest);

async function startServer() {
  console.log('🔍 检查 OpenViking CLI 可用性...');
  const isAvailable = await checkOvAvailable();

  if (!isAvailable) {
    console.error('❌ 错误: 找不到 OpenViking CLI (ov 命令)');
    console.error('');
    console.error('请确保:');
    console.error('1. OpenViking 已安装: https://github.com/openviking/openviking');
    console.error('2. ov 命令在 PATH 中，或通过环境变量配置:');
    console.error('   export OV_COMMAND=/path/to/ov');
    console.error('3. 或通过完整路径设置:');
    console.error('   OV_COMMAND=/usr/local/bin/ov npm run dev');
    console.error('');
    console.error('当前配置:');
    console.error(`  OV_COMMAND: ${OV_CONFIG.ovCommand}`);
    process.exit(1);
  }

  console.log('✅ OpenViking CLI 可用');
  console.log('');
  console.log('📋 配置信息:');
  console.log(`  ov 命令: ${OV_CONFIG.ovCommand}`);
  console.log(`  OpenViking Host: ${OV_CONFIG.host}:${OV_CONFIG.port}`);
  if (OV_CONFIG.storagePath) {
    console.log(`  存储路径: ${OV_CONFIG.storagePath}`);
  }
  console.log('');
  console.log('💡 环境变量可配置:');
  console.log('  OV_COMMAND     - ov 命令路径');
  console.log('  OV_HOST        - OpenViking 服务地址 (默认: localhost)');
  console.log('  OV_PORT        - OpenViking 服务端口 (默认: 1933)');
  console.log('  OV_STORAGE_PATH - OpenViking 存储路径');
  console.log('  OV_VIEWER_PORT - Viewer 服务端口 (默认: 3199)');
  console.log('');

  server.listen(PORT, () => {
    console.log(`🎯 OpenViking Viewer API 运行在: http://localhost:${PORT}`);
    console.log('📱 前端在: http://localhost:5173 (如果使用 vite dev)');
  });
}

startServer().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
