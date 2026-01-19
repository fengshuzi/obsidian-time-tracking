# 时间追踪新格式测试

## 测试用例

### 1. 基本流程测试
- 普通任务
- TODO 任务
- DOING 任务（新格式）
- DONE 任务

### 2. 新格式示例

#### 当前格式（旧）：
```
- DOING 实现时间追踪功能 <!-- ts:2026-01-19T10:00:56|source:todo -->
```

#### 新格式（防污染）：
```
- DOING <!-- ts:2026-01-19T10:00:56|source:todo --> 实现时间追踪功能
```

### 3. 预期行为

1. **TODO → DOING**：
   - 输入：`- TODO 实现功能`
   - 输出：`- DOING <!-- ts:timestamp|source:todo --> 实现功能`

2. **[ ] → DOING**：
   - 输入：`- [ ] 实现功能`
   - 输出：`- DOING <!-- ts:timestamp|source:checkbox --> 实现功能`

3. **DOING → DONE**：
   - 输入：`- DOING <!-- ts:timestamp|source:todo --> 实现功能`
   - 输出：`- DONE 实现功能 5分钟`

4. **DOING → [x]**：
   - 输入：`- DOING <!-- ts:timestamp|source:checkbox --> 实现功能`
   - 输出：`- [x] 实现功能 5分钟`

### 4. 防污染测试

当用户复制任务内容时，应该只复制到纯净的内容，不包含时间注释：
- 复制 "实现功能" 而不是 "<!-- ts:... --> 实现功能"

### 5. 兼容性测试

插件应该能够处理旧格式的时间注释，并逐步迁移到新格式。