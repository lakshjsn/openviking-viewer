# OpenViking Viewer 配置指南

## 快速开始

### 前置要求

1. **安装 OpenViking CLI**
   ```bash
   # 使用 Rust 安装（推荐）
   cargo install openviking
   
   # 或通过其他方式安装，确保 ov 命令在 PATH 中
   which ov
   ```

2. **OpenViking 服务运行**
   ```bash
   # 启动 OpenViking 知识库服务
   ov health
   
   # 如果返回正常的 JSON 响应，说明服务正常
   ```

### 安装依赖和运行

```bash
# 安装 Node 依赖
npm install

# 开发模式运行（前端和后端同时启动）
npm run dev

# 或只运行后端
npm run dev:server

# 或只运行前端
npm run dev:client
```

## 配置说明

### 默认配置

默认情况下，Viewer 会尝试：
- 找到系统 PATH 中的 `ov` 命令
- 连接 `localhost:1933` 的 OpenViking 服务
- 在 `localhost:3199` 启动 API 服务

### 自定义配置

如果默认配置不符合你的需求，使用环境变量：

#### 1. ov 命令找不到

如果你看到这个错误：
```
❌ 错误: 找不到 OpenViking CLI (ov 命令)
```

**解决方案：**

设置 `OV_COMMAND` 环境变量指向 ov 的完整路径：

```bash
# macOS (Homebrew)
export OV_COMMAND=/usr/local/bin/ov
npm run dev

# macOS (Rust/Cargo)
export OV_COMMAND=$HOME/.cargo/bin/ov
npm run dev

# Linux (Rust/Cargo)
export OV_COMMAND=$HOME/.cargo/bin/ov
npm run dev

# 或一行命令
OV_COMMAND=/path/to/ov npm run dev
```

找到 ov 的位置：
```bash
# 方法1：使用 which
which ov

# 方法2：如果使用 Cargo 安装
ls -la $HOME/.cargo/bin/ov

# 方法3：搜索系统
find /usr -name "ov" 2>/dev/null
find /opt -name "ov" 2>/dev/null
```

#### 2. OpenViking 服务地址不同

如果 OpenViking 服务在不同的主机或端口：

```bash
export OV_HOST=<your-host-ip>
export OV_PORT=9000
npm run dev
```

#### 3. OpenViking 存储路径

如果需要指定存储路径：

```bash
export OV_STORAGE_PATH=/path/to/viking/storage
npm run dev
```

### 使用 .env 文件

创建 `.env` 文件（从 `.env.example` 复制）：

```bash
cp .env.example .env
```

编辑 `.env` 文件：
```
OV_COMMAND=/usr/local/bin/ov
OV_HOST=localhost
OV_PORT=1933
OV_VIEWER_PORT=3199
```

然后运行：
```bash
npm run dev
```

## 完整的环境变量列表

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OV_COMMAND` | ov CLI 命令的路径 | `ov` (系统 PATH) |
| `OV_HOST` | OpenViking 服务主机地址 | `localhost` |
| `OV_PORT` | OpenViking 服务端口 | `1933` |
| `OV_STORAGE_PATH` | OpenViking 存储路径（可选） | 无 |
| `OV_VIEWER_PORT` | Viewer API 服务端口 | `3199` |

## 故障排除

### 问题 1: "找不到 OpenViking CLI"

```bash
# 检查 ov 是否在 PATH 中
which ov

# 如果没有找到，查找它的位置
find ~ -name "ov" -type f 2>/dev/null

# 使用完整路径启动
OV_COMMAND=/full/path/to/ov npm run dev
```

### 问题 2: "连接 OpenViking 服务失败"

```bash
# 检查 OpenViking 服务是否运行
ov health

# 检查服务是否在正确的地址和端口
netstat -an | grep 1933  # Linux/macOS

# 如果地址或端口不同，设置环境变量
export OV_HOST=your.host
export OV_PORT=your.port
npm run dev
```

### 问题 3: "API 服务无法启动"

检查端口是否被占用：
```bash
# 查看 3199 端口是否被使用
lsof -i :3199

# 使用不同的端口
OV_VIEWER_PORT=3200 npm run dev
```

### 问题 4: 页面无法加载数据

1. 打开浏览器开发者工具 (F12)
2. 查看 Network 标签，检查 API 调用是否失败
3. 查看 Console 标签，查看是否有错误信息
4. 检查后端日志输出

## 开发和生产

### 开发环境

```bash
npm run dev
```

同时启动：
- 前端: `http://localhost:5173` (Vite)
- 后端: `http://localhost:3199` (API)

### 生产构建

```bash
npm run build
```

生成文件在 `dist/` 目录下，可以用任何 HTTP 服务器提供服务。

### 部署后端

后端服务 (`server.mjs`) 可以独立部署：

```bash
# 直接运行（需要 Node.js >= 18）
node server.mjs

# 或使用 pm2 进程管理
pm2 start server.mjs --name "ov-viewer-api"

# 设置环境变量后再运行
OV_COMMAND=/usr/local/bin/ov node server.mjs
```

## 系统要求

- **Node.js**: >= 18.0.0
- **OpenViking CLI**: 最新版本
- **网络**: OpenViking 服务可访问

## 常见问题 (FAQ)

**Q: 如果 OpenViking 路径改变了怎么办？**
A: 重新设置 `OV_COMMAND` 环境变量，或更新 `.env` 文件。

**Q: 能否支持多个 OpenViking 实例？**
A: 目前只支持一个实例，但可以通过修改源码支持多个。

**Q: 数据会被修改吗？**
A: 不会。Viewer 只读取数据，不修改 OpenViking 存储。

**Q: 能在网络上访问吗？**
A: 可以，通过设置合适的主机地址和端口，以及配置防火墙。
