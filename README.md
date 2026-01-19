# Obsidian Time Tracking

一个简洁的 Obsidian 时间追踪插件，通过快捷键自动追踪任务耗时。

## 功能特性

- ⌨️ 使用 `Cmd/Ctrl + Enter` 快捷键切换任务状态
- ⏱️ 自动追踪任务耗时
- 📊 智能时长显示（秒/分钟/小时）
- 🔄 支持任务状态循环切换
- 🎯 简洁设计，不干扰其他插件

## 使用方法

### 基本流程

1. **创建普通列表项**
   ```markdown
   - 实现时间追踪功能
   ```

2. **添加 TODO 标记** - 按 `Cmd/Ctrl + Enter`
   ```markdown
   - TODO 实现时间追踪功能
   ```

3. **开始计时** - 再次按 `Cmd/Ctrl + Enter`
   ```markdown
   - DOING <!-- ts:2026-01-19T10:00:56|source:todo --> 实现时间追踪功能
   ```

4. **完成任务** - 再次按 `Cmd/Ctrl + Enter`
   ```markdown
   - DONE 实现时间追踪功能 5分钟
   ```

5. **移除状态**（可选）- 再次按 `Cmd/Ctrl + Enter`
   ```markdown
   - 实现时间追踪功能
   ```

### 状态流转

```
- task  →  - TODO  →  - DOING  →  - DONE  →  - task
         (添加标记)  (开始计时)   (显示耗时)  (移除状态)
```

## 时长显示格式

插件会根据任务耗时自动选择合适的单位：

- **小于 60 秒**：显示秒数（例如：`30秒`）
- **小于 1 小时**：显示分钟数（例如：`15分钟`）
- **大于等于 1 小时**：显示小时数（例如：`2小时`）

## 设置选项

### 自动追加时长
- 默认：开启
- 完成任务时自动在任务末尾追加耗时

### 时长显示位置
- **任务末尾**（默认）：`- DONE 任务名称 5分钟`
- **状态后面**：`- DONE 5分钟 任务名称`

## 技术细节

- 使用 HTML 注释存储开始时间，不影响笔记渲染
- 完成任务后自动清理 HTML 注释
- 兼容其他 Obsidian 插件（如闪卡插件）
- 默认绑定 `Cmd/Ctrl + Enter` 快捷键

### 快捷键冲突

如果你安装了其他使用 `Cmd+Enter` 的插件（如 logseq-todo-compatibility），可能会有冲突。解决方法：

1. 在 Obsidian 设置 → 快捷键中
2. 禁用其他插件的 `Cmd+Enter` 绑定
3. 或者修改本插件的快捷键为其他组合

## 安装

### 手动安装

1. 下载最新的 `main.js` 和 `manifest.json`
2. 在 vault 的 `.obsidian/plugins/` 目录下创建 `obsidian-time-tracking` 文件夹
3. 将文件复制到该文件夹
4. 在 Obsidian 设置中启用插件

## 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建生产版本
npm run build

# 部署到 vaults
npm run deploy

# 发布新版本
npm run release
```

## 许可证

MIT

## 作者

lizhifeng
