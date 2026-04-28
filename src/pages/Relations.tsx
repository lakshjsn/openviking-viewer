import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet } from '../api/client';
import {
  GitBranch, Loader2, RefreshCw, CircleDot, Folder, FileText, ChevronRight, ArrowUp, Home,
} from 'lucide-react';

interface RelationItem {
  uri: string;
  type?: string;
  abstract?: string;
}

interface TreeNode {
  uri: string;
  isDir: boolean;
  abstract: string;
  rel_path: string;
  size: number;
  modTime: string;
}

function getFileName(item: TreeNode): string {
  const path = item.rel_path || item.uri || '';
  return path.split('/').pop() || path;
}

export function Relations() {
  const [currentUri, setCurrentUri] = useState('viking://agent/3e36e4f3f761/memories');
  const [relations, setRelations] = useState<RelationItem[]>([]);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [selectedRelations, setSelectedRelations] = useState<RelationItem[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  const fetchRelations = useCallback(async (uri: string) => {
    setLoading(true);
    setSelectedUri(uri);
    try {
      const data = await apiGet<{ ok: boolean; result: RelationItem[] }>('/api/relations', { uri });
      setRelations(data.result || []);
      setSelectedRelations(data.result || []);
    } catch {
      setRelations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTree = useCallback(async (uri: string) => {
    setTreeLoading(true);
    try {
      const data = await apiGet<{ ok: boolean; result: TreeNode[] }>('/api/ls', { uri });
      const sorted = (data.result || []).sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return getFileName(a).localeCompare(getFileName(b));
      });
      setTreeData(sorted);
    } catch { setTreeData([]); }
    finally { setTreeLoading(false); }
  }, []);

  useEffect(() => {
    if (currentUri) { fetchRelations(currentUri); fetchTree(currentUri); }
  }, [currentUri, fetchRelations, fetchTree]);

  const handleItemClick = (item: TreeNode) => {
    if (item.isDir) {
      setCurrentUri(item.uri);
    } else {
      setSelectedUri(item.uri);
      setLoading(true);
      try {
        fetchRelations(item.uri).then(() => {});
      } catch { setSelectedRelations([]); }
      finally { setLoading(false); }
    }
  };

  const navigateTo = (uri: string) => {
    setCurrentUri(uri);
  };

  const goUp = () => {
    const parent = currentUri.substring(0, currentUri.lastIndexOf('/'));
    if (parent && parent.startsWith('viking://')) navigateTo(parent);
  };

  // URI segments for breadcrumb
  const withoutProtocol = currentUri.replace('viking://', '');
  const segments = withoutProtocol.split('/').filter(Boolean);

  const graphNodes = [
    { id: 'center', label: currentUri.split('/').pop() || currentUri, x: 300, y: 200, isCenter: true },
    ...selectedRelations.map((r, i) => {
      const angle = (2 * Math.PI * i) / Math.max(selectedRelations.length, 1);
      const radius = 150;
      return {
        id: r.uri,
        label: r.uri.split('/').pop() || r.uri,
        x: 300 + radius * Math.cos(angle),
        y: 200 + radius * Math.sin(angle),
        isCenter: false,
      };
    }),
  ];
  const graphEdges = selectedRelations.map(r => ({ source: 'center', target: r.uri }));
  const hasRelations = selectedRelations.length > 0;
  const dirCount = treeData.filter(i => i.isDir).length;
  const fileCount = treeData.filter(i => !i.isDir).length;

  return (
    <div className="p-6 space-y-5 h-full overflow-auto">
      <div>
        <h2 className="text-lg font-semibold">关系图谱</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">浏览目录结构，查看资源关联关系</p>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs">
        <button onClick={() => navigateTo('viking://')}
          className="text-[var(--text-muted)] hover:text-black flex items-center gap-0.5">
          <Home size={12} /> viking://
        </button>
        {segments.map((seg, i) => {
          const uri = 'viking://' + segments.slice(0, i + 1).join('/');
          const isLast = i === segments.length - 1;
          return (
            <span key={uri} className="flex items-center gap-0.5">
              <ChevronRight size={10} className="text-[var(--text-muted)]" />
              {isLast ? (
                <span className="text-black font-medium">{seg}</span>
              ) : (
                <button onClick={() => navigateTo(uri)}
                  className="text-[var(--text-muted)] hover:text-black">{seg}</button>
              )}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Left: Graph */}
        <div className="border border-[var(--border)] rounded-lg p-4 bg-white">
          <h3 className="text-[11px] font-semibold mb-3 text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
            <CircleDot size={12} /> 关系图 — {selectedUri?.split('/').pop() || currentUri.split('/').pop()}
          </h3>
          {loading ? (
            <div className="flex items-center justify-center h-64"><Loader2 size={20} className="animate-spin text-[var(--text-muted)]" /></div>
          ) : !hasRelations ? (
            <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
              <GitBranch size={36} className="mb-2 opacity-15" />
              <p className="text-xs">当前资源暂无显式关联</p>
              <p className="text-[10px] mt-1">可通过 ov link 命令创建资源间的关联</p>
            </div>
          ) : (
            <svg ref={svgRef} viewBox="0 0 600 400" className="w-full h-auto">
              {graphEdges.map((edge, i) => {
                const source = graphNodes.find(n => n.id === edge.source);
                const target = graphNodes.find(n => n.id === edge.target);
                if (!source || !target) return null;
                return <line key={i} x1={source.x} y1={source.y} x2={target.x} y2={target.y}
                  stroke="#d4d4d8" strokeWidth={1} strokeDasharray="4 2" />;
              })}
              {graphNodes.map(node => (
                <g key={node.id}>
                  <circle cx={node.x} cy={node.y} r={node.isCenter ? 20 : 12}
                    fill={node.isCenter ? '#18181b' : '#f4f4f5'}
                    stroke="#18181b" strokeWidth={1.5}
                    className="cursor-pointer"
                    onClick={() => !node.isCenter && handleItemClick({ uri: node.id, isDir: false, abstract: '', rel_path: node.id, size: 0, modTime: '' })} />
                  <text x={node.x} y={node.y + (node.isCenter ? 30 : 24)}
                    textAnchor="middle" fill="#71717a" fontSize="10" className="pointer-events-none">
                    {node.label.length > 20 ? node.label.slice(0, 20) + '...' : node.label}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>

        {/* Right: Directory browser */}
        <div className="space-y-4">
          <div className="border border-[var(--border)] rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                目录内容
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-muted)]">
                  {dirCount} dirs, {fileCount} files
                </span>
                <button onClick={goUp} className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                  title="返回上一级">
                  <ArrowUp size={12} />
                </button>
                <button onClick={() => { fetchRelations(currentUri); fetchTree(currentUri); }}
                  className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                  <RefreshCw size={12} className={treeLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {treeLoading ? (
              <Loader2 size={16} className="animate-spin text-[var(--text-muted)]" />
            ) : (
              <div className="space-y-px max-h-72 overflow-auto">
                {treeData.map(item => (
                  <button key={item.uri} onClick={() => handleItemClick(item)}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-all flex items-center gap-2 ${
                      selectedUri === item.uri
                        ? 'bg-black text-white'
                        : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                    }`}>
                    {item.isDir ? (
                      <Folder size={13} className="flex-shrink-0 opacity-60" />
                    ) : (
                      <FileText size={13} className="flex-shrink-0 opacity-40" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{getFileName(item)}</div>
                      {item.abstract && (
                        <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5 opacity-70">{item.abstract}</div>
                      )}
                    </div>
                    {item.isDir && <ChevronRight size={12} className="flex-shrink-0 opacity-40" />}
                  </button>
                ))}
                {treeData.length === 0 && (
                  <div className="text-[11px] text-[var(--text-muted)] py-4 text-center">空目录</div>
                )}
              </div>
            )}
          </div>

          {/* Selected info */}
          <div className="border border-[var(--border)] rounded-lg p-4 bg-white">
            <h3 className="text-[11px] font-semibold mb-2 text-[var(--text-muted)] uppercase tracking-wider">选中资源</h3>
            {selectedUri ? (
              <div className="space-y-2">
                <div className="text-[11px] text-[var(--text-muted)] break-all font-mono">{selectedUri}</div>
                {selectedRelations.length > 0 ? (
                  <div>
                    <div className="text-[11px] text-[var(--text-secondary)] mb-1">关联 ({selectedRelations.length})</div>
                    <div className="space-y-0.5">
                      {selectedRelations.map((r, i) => (
                        <div key={i} className="text-[11px] px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] truncate font-mono">{r.uri}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-[var(--text-muted)]">无显式关联 — 点击子目录或文件继续浏览</div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-[var(--text-muted)]">点击文件查看关系，点击目录深入浏览</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
