# OpenViking Viewer 快速启动

## 30 秒快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动（前端 + 后端）
npm run dev

# 3. 打开浏览器
# 前端: http://localhost:5173
# API: http://localhost:3199
```

## 常见问题

### ❌ 启动失败："找不到 OpenViking CLI"

**问题**: 系统中没有 `ov` 命令

**解决方案**：

1. **查找 ov 的位置：**
   ```bash
   which ov
   # 或
   find ~ -name "ov" -type f 2>/dev/null
   ```

2. **使用完整路径启动：**
   ```bash
   OV_COMMAND=/usr/local/bin/ov npm run dev
   # 或
   OV_COMMAND=$HOME/.cargo/bin/ov npm run dev
   ```

3. **或者添加到 PATH：**
   ```bash
   export PATH="/usr/local/bin:$PATH"
   npm run dev
   ```

### ❌ 页面显示"连接 OpenViking 失败"

**问题**: OpenViking 服务没有运行

**解决方案**：

```bash
# 检查服务是否运行
ov health

# 如果失败，启动服务（根据你的安装方式）
# 通常 OpenViking 是后台服务，应该自动运行
```

### ❌ 端口已被占用

**问题**: 3199 或 5173 端口已被其他程序使用

**解决方案**：

```bash
# 使用不同端口
OV_VIEWER_PORT=3200 npm run dev
```

### ✅ 一切正常！

- 打开 Dashboard 看系统状态
- 打开 Explorer 浏览知识库
- 打开 Search 搜索内容
- 打开 Relations 查看关系

## 配置

### 环境变量

在启动前设置这些变量来自定义配置：

```bash
# ov 命令路径
export OV_COMMAND=/path/to/ov

# OpenViking 服务地址
export OV_HOST=localhost
export OV_PORT=1933

# Viewer 服务端口
export OV_VIEWER_PORT=3199

# 然后启动
npm run dev
```

### 或使用 .env 文件

```bash
# 复制模板
cp .env.example .env

# 编辑 .env 文件
nano .env

# 启动（自动读取 .env）
npm run dev
```

## 详细配置

详见 `SETUP.md` 了解完整的配置和故障排除指南。
