import { runOv } from '../ov-client.js';
import { json } from '../middleware.js';

/**
 * GET /api/resources?uri=viking://resources[/{project}]&depth=2
 *
 * 返回资源目录的构建状态概览：
 *   - 不指定 project 或 uri=viking://resources → 自动发现所有项目，展开每个项目的子节点
 *   - 指定具体项目 uri → 只返回该项目下的子节点
 *
 * 前端用此接口展示「知识库资源构建状态」面板。
 */
export async function handleResources(req, res, url) {
  const uri = url.searchParams.get('uri') || 'viking://resources';
  const depth = parseInt(url.searchParams.get('depth') || '2');

  // 判断是否为根级请求（列出所有项目）
  const isRootRequest = uri === 'viking://resources' || uri === 'viking://resources/';

  if (isRootRequest) {
    return handleAllProjects(res, depth);
  }

  // 单项目请求：原有逻辑
  return handleSingleProject(uri, depth, res);
}

/**
 * 根级请求：自动发现 viking://resources 下所有项目，展开每个项目的子节点
 */
async function handleAllProjects(res, depth) {
  // 1. 获取顶层项目列表（depth=1）
  const treeData = await runOv(['tree', 'viking://resources', '-L', '1', '-l', '512', '-n', '512']);

  if (!treeData?.ok || !Array.isArray(treeData.result)) {
    json(res, { ok: false, error: 'Failed to fetch resource tree', raw: treeData });
    return;
  }

  const projects = treeData.result.filter(n => n.isDir); // 只取目录（项目）
  
  if (projects.length === 0) {
    json(res, {
      ok: true,
      uri: 'viking://resources',
      depth,
      resources: [],
      summary: { total: 0, ready: 0, partial: 0, processing: 0, pending: 0, failed: 0 },
      projects: [],
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  // 2. 并行获取每个项目的子节点（depth=2，深入到项目内部）
  const projectResults = await Promise.allSettled(
    projects.map(project => 
      runOv(['tree', project.uri, '-L', String(depth), '-l', '512', '-n', '512'])
        .catch(() => ({ ok: false, result: [] }))
    )
  );

  // 3. 展平所有项目的子节点，带上项目名作为分组信息
  const allResources = [];
  const projectSummaries = [];

  // 预先获取一次 observer queue（所有项目共享），失败不影响主流程
  let queueSummary = null;
  try {
    const queueData = await runOv(['observer', 'queue']).catch(() => null);
    if (queueData?.ok && queueData.result) {
      const raw = queueData.result.status || '';
      // 简易解析：从表格文本中提取 TOTAL 行的 In Progress 和 Errors
      const lines = raw.split('\n').filter(l => l.includes('TOTAL'));
      if (lines.length > 0) {
        const cells = lines[0].split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length >= 5) {
          queueSummary = {
            totalInProgress: parseInt(cells[2]) || 0,
            totalPending: parseInt(cells[1]) || 0,
            totalErrors: parseInt(cells[4]) || 0,
          };
        }
      }
    }
  } catch { /* queue 获取失败时降级为无队列信息 */ }

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const projResult = projectResults[i];
    const nodes = (projResult?.status === 'fulfilled' && projResult.value?.ok)
      ? projResult.value.result
      : [];

    // 筛选该项目的直接子节点（rel_path 不含 / 的第二层节点）
    // 当 depth=2 时，tree 返回格式为 "project_name/child_name"
    const childNodes = nodes.filter(n => {
      // 排除项目自身（rel_path == 项目名）
      if (n.rel_path === project.rel_path) return false;
      // 对于子节点，rel_path 可能是 "external" 或 "project_name/external"
      // 我们要的是项目下的直接子节点
      const relativeToProject = n.rel_path.replace(project.rel_path + '/', '');
      return !relativeToProject.includes('/');
    });

    // 对每个子节点获取 stat
    const statResults = await Promise.allSettled(
      childNodes.map(node => runOv(['stat', node.uri]).catch(() => null))
    );

    const projectResources = childNodes.map((node, idx) => {
      const statResult = statResults[idx];
      const stat = statResult?.status === 'fulfilled' && statResult.value?.ok
        ? statResult.value.result
        : null;

      // 提取该目录节点的内部 upload 子文件状态（从全部 nodes 中查找）
      const childUploadInfo = findChildUploadInfo(node.uri, nodes);

      const processingStatus = inferProcessingStatus(node, stat, childUploadInfo, queueSummary);

      return {
        uri: node.uri,
        name: node.rel_path.includes('/') 
          ? node.rel_path.split('/').pop()   // 取纯文件名
          : node.rel_path,
        projectName: project.rel_path,       // 所属项目
        projectUri: project.uri,             // 项目 URI
        isDir: node.isDir,
        size: node.size,
        modTime: node.modTime,
        abstract: node.abstract || null,
        hasAbstract: Boolean(node.abstract && node.abstract !== 'Directory overview'),
        hasOverview: node.abstract === 'Directory overview',
        stat: stat ? { mode: stat.mode, modTime: stat.modTime } : null,
        ...processingStatus,
      };
    });

    allResources.push(...projectResources);

    // 项目级汇总
    projectSummaries.push({
      name: project.rel_path,
      uri: project.uri,
      total: projectResources.length,
      ready: projectResources.filter(r => r.status === 'ready').length,
      processing: projectResources.filter(r => r.status === 'processing').length,
      pending: projectResources.filter(r => r.status === 'pending').length,
    });
  }

  // 4. 全局汇总
  const summary = {
    total: allResources.length,
    ready: allResources.filter(r => r.status === 'ready').length,
    partial: allResources.filter(r => r.status === 'partial').length,
    processing: allResources.filter(r => r.status === 'processing').length,
    pending: allResources.filter(r => r.status === 'pending').length,
    failed: allResources.filter(r => r.status === 'failed').length,
  };

  json(res, {
    ok: true,
    uri: 'viking://resources',
    depth,
    resources: allResources,
    summary,
    projects: projectSummaries,
    fetchedAt: new Date().toISOString(),
  });
}

/**
 * 单项目请求：增强版（同样支持子文件状态 + 队列信息推断）
 */
async function handleSingleProject(uri, depth, res) {
  const treeData = await runOv(['tree', uri, '-L', String(depth), '-l', '512', '-n', '512']);

  if (!treeData?.ok || !Array.isArray(treeData.result)) {
    json(res, { ok: false, error: 'Failed to fetch resource tree', raw: treeData });
    return;
  }

  const nodes = treeData.result;

  // 筛选顶层直接子节点
  const topLevelNodes = nodes.filter(n => !n.rel_path.includes('/'));

  // 预先获取 observer queue
  let queueSummary = null;
  try {
    const queueData = await runOv(['observer', 'queue']).catch(() => null);
    if (queueData?.ok && queueData.result) {
      const raw = queueData.result.status || '';
      const lines = raw.split('\n').filter(l => l.includes('TOTAL'));
      if (lines.length > 0) {
        const cells = lines[0].split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length >= 5) {
          queueSummary = {
            totalInProgress: parseInt(cells[2]) || 0,
            totalPending: parseInt(cells[1]) || 0,
            totalErrors: parseInt(cells[4]) || 0,
          };
        }
      }
    }
  } catch { /* 降级 */ }

  const statResults = await Promise.allSettled(
    topLevelNodes.map(node => runOv(['stat', node.uri]).catch(() => null))
  );

  const resources = topLevelNodes.map((node, idx) => {
    const statResult = statResults[idx];
    const stat = statResult?.status === 'fulfilled' && statResult.value?.ok
      ? statResult.value.result
      : null;

    // 提取该目录节点的内部 upload 子文件状态
    const childUploadInfo = findChildUploadInfo(node.uri, nodes);

    const processingStatus = inferProcessingStatus(node, stat, childUploadInfo, queueSummary);

    return {
      uri: node.uri,
      name: node.rel_path,
      isDir: node.isDir,
      size: node.size,
      modTime: node.modTime,
      abstract: node.abstract || null,
      hasAbstract: Boolean(node.abstract && node.abstract !== 'Directory overview'),
      hasOverview: node.abstract === 'Directory overview',
      stat: stat ? { mode: stat.mode, modTime: stat.modTime } : null,
      ...processingStatus,
    };
  });

  const summary = {
    total: resources.length,
    ready: resources.filter(r => r.status === 'ready').length,
    partial: resources.filter(r => r.status === 'partial').length,
    processing: resources.filter(r => r.status === 'processing').length,
    pending: resources.filter(r => r.status === 'pending').length,
    failed: resources.filter(r => r.status === 'failed').length,
  };

  json(res, {
    ok: true,
    uri,
    depth,
    resources,
    summary,
    fetchedAt: new Date().toISOString(),
  });
}

/**
 * 根据节点信息推断处理状态（增强版：结合子文件状态 + 队列信息）
 *
 * 判断逻辑（三级信号融合）：
 * 1. 目录 abstract 有实际内容 → ready（VLM 已生成摘要）
 * 2. 子文件有 abstract 内容 → processing（VLM 正在处理该目录的子步骤）
 * 3. 队列空闲 + 节点长时间未变化 → failed/stalled（疑似卡住或失败）
 * 4. 兜底 → pending（等待处理）
 *
 * @param {Object} node - tree 返回的节点信息
 * @param {Object|null} stat - stat 返回的元信息
 * @param {Object|null} childUploadInfo - 内部 upload 子文件的状态信息（可选）
 *   { hasAbstract: boolean, size: number, modTime: string }
 * @param {Object|null} queueSummary - observer queue 全局汇总（可选）
 *   { totalInProgress: number, totalPending: number, totalErrors: number }
 */
function inferProcessingStatus(node, stat, childUploadInfo = null, queueSummary = null) {
  const abstract = node.abstract || '';

  if (node.isDir) {
    // ===== 目录节点 =====

    // 第一优先级：目录自身已有真正的摘要 → 完全就绪
    if (abstract && abstract !== 'Directory overview' && abstract.length > 10) {
      return { status: 'ready', statusLabel: '就绪', statusDetail: '摘要已生成' };
    }

    // 第二优先级：检查内部 upload 子文件的状态
    if (childUploadInfo) {
      const queueActive = queueSummary?.totalInProgress > 0;
      const queueErrors = queueSummary?.totalErrors > 0;
      const childHasAbstract = childUploadInfo.hasAbstract;

      // 计算节点年龄（分钟）
      // node.modTime 格式为 "HH:mm:ss"，需拼接今日日期才能正确计算
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const nodeTime = new Date(`${today}T${node.modTime}`);
      const ageMinutes = isNaN(nodeTime.getTime()) ? 0 : (Date.now() - nodeTime.getTime()) / 60000;

      // ★ 新增：长时间等待 + 队列空闲/低活跃 → 疑似 VLM Rate Limit 失败
      // 特征：节点存在超过15分钟，子文件无 abstract，队列无任务或只有1个在跑
      if (!childHasAbstract && ageMinutes > 15 && !queueActive) {
        return { status: 'failed', statusLabel: '异常', statusDetail: `疑似 API 限流失败（已等待 ${Math.floor(ageMinutes)} 分钟），建议手动 reindex --regenerate` };
      }

      // 长时间排队（>20分钟）即使队列活跃也提示异常
      if (!childHasAbstract && ageMinutes > 20 && queueActive) {
        return { status: 'failed', statusLabel: '异常', statusDetail: `排队超时（已等待 ${Math.floor(ageMinutes)} 分钟），可能触发 API 限流` };
      }

      if (childHasAbstract && queueActive) {
        // 子文件已向量化但目录摘要还没生成 → Semantic 阶段处理中
        return { status: 'processing', statusLabel: '处理中', statusDetail: '语义分析中...' };
      }

      if (!childHasAbstract && queueActive) {
        // 子文件未向量化且队列活跃 → 排队或 Embedding 处理中
        // ★ 新增：通过 modTime 推断是否为"当前正在处理"的节点
        // 当 In Progress=1 时，modTime 最新且 abstract 未生成的节点大概率是当前处理项
        const isLikelyCurrentTask = ageMinutes < 3; // 3分钟内更新过 = 很可能正在处理

        if (isLikelyCurrentTask && queueSummary?.totalInProgress <= 1) {
          return { status: 'processing', statusLabel: '🔄 处理中', statusDetail: '正在生成摘要...' };
        }

        // 如果排队超过10分钟，给出更详细的详情提示
        if (ageMinutes > 10) {
          return { status: 'processing', statusLabel: '处理中', statusDetail: `排队中（已等待 ${Math.floor(ageMinutes)} 分钟）` };
        }
        return { status: 'processing', statusLabel: '处理中', statusDetail: '排队等待向量化' };
      }

      // 队列空闲时的判断
      if (!childHasAbstract && !queueActive) {
        // 子文件没处理好、队列也没任务 → 可能卡住或失败
        // 用 modTime 判断是否已经很久没有变化
        const todayStall = new Date().toISOString().slice(0, 10);
        const nodeTimeStall = new Date(`${todayStall}T${node.modTime}`);
        const ageMinutesStall = isNaN(nodeTimeStall.getTime()) ? 0 : (Date.now() - nodeTimeStall.getTime()) / 60000;
        if (ageMinutesStall > 5) {
          // 超过5分钟无变化且队列空闲 → 疑似失败/卡住
          return { status: 'failed', statusLabel: '异常', statusDetail: '处理可能卡住（队列空闲超时）' };
        }
        // 刚提交不久，还在初始化阶段
        return { status: 'pending', statusLabel: '等待中', statusDetail: '初始化中...' };
      }

      // 子文件已向量化但队列空闲 → 可能是 reindex 后还没来得及生成目录摘要
      if (childHasAbstract && !queueActive) {
        // 给短暂窗口期
        const todayWindow = new Date().toISOString().slice(0, 10);
        const nodeTimeWindow = new Date(`${todayWindow}T${node.modTime}`);
        const ageMinutesWindow = isNaN(nodeTimeWindow.getTime()) ? 0 : (Date.now() - nodeTimeWindow.getTime()) / 60000;
        if (ageMinutesWindow > 3) {
          return { status: 'failed', statusLabel: '异常', statusDetail: '目录摘要生成超时' };
        }
        return { status: 'processing', statusLabel: '处理中', statusDetail: '生成目录摘要...' };
      }
    }

    // 无子文件信息时的兜底（降级 + modTime 推断）
    // ★ 某些目录结构特殊（如内容在子目录下），findChildUploadInfo 找不到 upload 文件
    // 此时用 modTime 推断：如果队列活跃且节点最近更新过 → 很可能正在处理
    if (queueActive) {
      const todayFallback = new Date().toISOString().slice(0, 10);
      const nodeTimeFallback = new Date(`${todayFallback}T${node.modTime}`);
      const ageMinutesFallback = isNaN(nodeTimeFallback.getTime()) ? 0 : (Date.now() - nodeTimeFallback.getTime()) / 60000;
      if (ageMinutesFallback < 3 && queueSummary?.totalInProgress <= 1) {
        return { status: 'processing', statusLabel: '🔄 处理中', statusDetail: '正在生成摘要...' };
      }
      if (ageMinutesFallback > 10) {
        return { status: 'processing', statusLabel: '处理中', statusDetail: `排队中（已等待 ${Math.floor(ageMinutesFallback)} 分钟）` };
      }
      return { status: 'processing', statusLabel: '处理中', statusDetail: '排队处理中' };
    }
    return { status: 'pending', statusLabel: '等待中', statusDetail: '排队等待向量化' };
  }

  // ===== 文件节点（原有逻辑保持不变）=====
  if (abstract && abstract.length > 10) {
    return { status: 'ready', statusLabel: '就绪', statusDetail: '已索引' };
  }
  if (node.rel_path.startsWith('upload_')) {
    if (stat || (node.size && node.size < 100)) {
      return { status: 'ready', statusLabel: '就绪', statusDetail: '已索引' };
    }
    return { status: 'processing', statusLabel: '处理中', statusDetail: '语义分析中...' };
  }
  return { status: 'pending', statusLabel: '等待中', statusDetail: '排队中' };
}

/**
 * 从 tree 返回的全部节点中，提取指定目录节点的内部 upload 子文件信息
 *
 * @param {string} dirUri - 目录节点的 URI
 * @param {Array} allNodes - tree 返回的全部节点数组
 * @returns {{ hasAbstract: boolean, size: number, modTime: string } | null}
 */
function findChildUploadInfo(dirUri, allNodes) {
  // 找到以 dirUri/ 开头 且 rel_path 包含 upload_ 的子文件
  const prefix = dirUri + '/';
  const childNode = allNodes.find(n =>
    n.uri.startsWith(prefix) &&
    n.rel_path.includes('upload_') &&
    !n.isDir
  );
  if (!childNode) return null;
  return {
    hasAbstract: Boolean(childNode.abstract && childNode.abstract.length > 10),
    size: childNode.size || 0,
    modTime: childNode.modTime || '',
  };
}
