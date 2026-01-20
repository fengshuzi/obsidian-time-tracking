import { Plugin, Editor, MarkdownView, PluginSettingTab, Setting, App, MarkdownPostProcessorContext } from 'obsidian';
import { createTimeTrackingExtension } from './editor-extension';

interface TimeTrackingSettings {
  autoAppendDuration: boolean;
  durationPosition: 'end' | 'afterStatus';
  registerHotkey: boolean;
  enableLivePreview: boolean;
  enableReadingMode: boolean;
  showStatusLabel: boolean;
  enableStrikethrough: boolean;
}

const DEFAULT_SETTINGS: TimeTrackingSettings = {
  autoAppendDuration: true,
  durationPosition: 'end',
  registerHotkey: true,
  enableLivePreview: true,
  enableReadingMode: false,  // 默认关闭阅读模式渲染
  showStatusLabel: true,
  enableStrikethrough: false
};

export default class TimeTrackingPlugin extends Plugin {
  settings: TimeTrackingSettings;

  async onload() {
    console.log('Time Tracking 插件已加载');
    
    await this.loadSettings();
    
    // 注册 Markdown 后处理器（阅读模式）
    if (this.settings.enableReadingMode) {
      this.registerMarkdownPostProcessor(this.postProcessor.bind(this));
    }

    // 注册编辑器扩展（实时预览模式）
    if (this.settings.enableLivePreview) {
      this.registerEditorExtension(createTimeTrackingExtension(this));
    }
    
    // 根据设置决定是否注册快捷键
    if (this.settings.registerHotkey) {
      this.addCommand({
        id: 'toggle-task-status',
        name: 'Toggle task status and track time',
        hotkeys: [{ modifiers: ['Mod'], key: 'Enter' }],
        editorCallback: (editor: Editor, view: MarkdownView) => {
          this.toggleTaskStatus(editor);
        }
      });
    } else {
      // 不注册快捷键，只注册命令
      this.addCommand({
        id: 'toggle-task-status',
        name: 'Toggle task status and track time',
        editorCallback: (editor: Editor, view: MarkdownView) => {
          this.toggleTaskStatus(editor);
        }
      });
    }
    
    this.addSettingTab(new TimeTrackingSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Markdown 后处理器 - 在阅读模式中渲染为复选框
   */
  postProcessor(element: HTMLElement, context: MarkdownPostProcessorContext): void {
    if (!this.settings.enableReadingMode) return;

    // 处理列表项
    const listItems = element.querySelectorAll('li');
    listItems.forEach((li) => {
      if (li instanceof HTMLElement) {
        this.processListItem(li);
      }
    });
  }

  /**
   * 处理列表项
   */
  processListItem(li: HTMLElement): void {
    const text = li.textContent || '';
    // 支持新格式：状态后可能有时间和注释
    const match = text.match(/^(TODO|DOING|LATER|NOW|DONE|CANCELED)(?:\s+\d{2}:\d{2})?(?:\s*<!--[^>]*-->)?\s*(.*)$/);

    if (match) {
      const [, status, content] = match;
      const checkbox = this.createCheckbox(status as any, content);
      li.innerHTML = '';
      li.appendChild(checkbox);
      li.classList.add('time-tracking-list-item');
      // 确保显示列表符号
      li.style.listStyleType = 'disc';
    }
  }

  /**
   * 创建复选框元素
   */
  createCheckbox(status: 'TODO' | 'DOING' | 'LATER' | 'NOW' | 'DONE' | 'CANCELED', content: string): HTMLElement {
    const container = document.createElement('span');
    container.className = 'time-tracking-item';
    container.dataset.status = status;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-list-item-checkbox time-tracking-checkbox';
    checkbox.checked = status === 'DONE' || status === 'CANCELED';
    checkbox.disabled = true; // 阅读模式下禁用点击

    // 添加状态类
    container.classList.add(`time-tracking-status-${status.toLowerCase()}`);

    // 如果启用了状态标签且不是 TODO/DONE，添加标签
    if (this.settings.showStatusLabel && status !== 'TODO' && status !== 'DONE') {
      const statusLabel = document.createElement('span');
      statusLabel.className = 'time-tracking-status-label';
      statusLabel.textContent = status;
      container.appendChild(statusLabel);
    }

    const label = document.createElement('span');
    label.className = 'time-tracking-content';
    
    // 移除 HTML 注释
    const cleanContent = content.replace(/<!--\s*ts:[^>]*?-->/g, '').trim();
    label.textContent = cleanContent;

    container.appendChild(checkbox);
    container.appendChild(label);

    return container;
  }

  /**
   * 格式化时长（参考 logseq-to-obsidian）
   * @param seconds 秒数
   * @returns 格式化的时长字符串
   */
  formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
    return `${Math.floor(seconds / 3600)}小时`;
  }

  /**
   * 格式化开始时间为 HH:MM 格式
   * @param isoString ISO 时间字符串
   * @returns 格式化的时间字符串，如 "10:32"
   */
  formatStartTime(isoString: string): string {
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * 清理意外的时间注释污染
   * @param editor 编辑器实例
   */
  cleanTimeComments(editor: Editor) {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    
    // 检查是否有时间注释但不是 DOING 状态
    const hasTimeComment = this.extractTrackingInfo(line) !== null;
    const isDoingTask = line.match(/^(\s*)([-*+]|\d+\.)\s+(DOING)\s*(?:<!--[^>]*-->)?\s*(.*)$/);
    
    if (hasTimeComment && !isDoingTask) {
      // 清理意外的时间注释
      const cleanedLine = this.removeTimeComment(line);
      console.log(`[TimeTracking] 清理时间注释污染: "${line}" → "${cleanedLine}"`);
      editor.setLine(cursor.line, cleanedLine);
      return true;
    }
    
    return false;
  }

  /**
   * 从 HTML 注释中提取开始时间和来源格式
   * @param line 当前行文本
   * @returns {startTime: string, source: 'todo' | 'checkbox'} 或 null
   */
  extractTrackingInfo(line: string): { startTime: string; source: 'todo' | 'checkbox' } | null {
    // 新格式：状态后的时间和注释 - DOING HH:MM <!-- ts:xxx|source:xxx --> content
    const newMatch = line.match(/DOING\s+(?:\d{2}:\d{2}\s+)?<!--\s*ts:([^|]+)\|source:(\w+)\s*-->/);
    if (newMatch) {
      return {
        startTime: newMatch[1],
        source: newMatch[2] as 'todo' | 'checkbox'
      };
    }
    
    // 兼容旧格式：内容后的注释 - DOING content <!-- ts:xxx|source:xxx -->
    const oldMatch = line.match(/<!--\s*ts:([^|]+)\|source:(\w+)\s*-->/);
    if (oldMatch) {
      return {
        startTime: oldMatch[1],
        source: oldMatch[2] as 'todo' | 'checkbox'
      };
    }
    
    // 兼容更旧格式（没有 source）
    const legacyMatch = line.match(/<!--\s*ts:([^>]+?)\s*-->/);
    if (legacyMatch) {
      return {
        startTime: legacyMatch[1],
        source: 'todo' // 默认为 todo
      };
    }
    return null;
  }

  /**
   * 从 HTML 注释中提取开始时间（兼容方法）
   * @param line 当前行文本
   * @returns ISO 时间字符串或 null
   */
  extractStartTime(line: string): string | null {
    const info = this.extractTrackingInfo(line);
    return info ? info.startTime : null;
  }

  /**
   * 移除行中的 HTML 时间注释
   * @param line 当前行文本
   * @returns 清理后的文本
   */
  removeTimeComment(line: string): string {
    // 移除新格式（状态后的注释）和旧格式（内容后的注释）
    return line.replace(/\s*<!--\s*ts:[^>]*?-->\s*/g, '');
  }

  /**
   * 移除行末的时长标记
   * @param line 当前行文本
   * @returns 清理后的文本
   */
  removeDuration(line: string): string {
    return line.replace(/\s+\d+(秒|分钟|小时)$/, '');
  }

  /**
   * 切换任务状态并追踪时间
   * @param editor 编辑器实例
   */
  toggleTaskStatus(editor: Editor) {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    
    console.log(`[TimeTracking] 原始行: "${line}"`);
    
    // 首先清理任何意外的时间注释（防止污染新任务）
    const cleanedLine = this.removeTimeComment(line);
    
    // 1. 优先检查是否是原生 markdown 复选框 (- [ ] 或 - [x])
    const checkboxMatch = cleanedLine.match(/^(\s*)([-*+]|\d+\.)\s+\[([ xX])\]\s+(.*)$/);
    if (checkboxMatch) {
      const [, indent, marker, checkState, content] = checkboxMatch;
      console.log(`[TimeTracking] 复选框匹配 - state: "${checkState}", content: "${content}"`);
      
      if (checkState === ' ') {
        // [ ] → DOING: 直接开始计时，记录来源为 checkbox，显示开始时间
        const startTime = new Date().toISOString();
        const displayTime = this.formatStartTime(startTime);
        
        // 检查内容中是否已经存在时间戳（格式：HH:MM）
        const existingTimeMatch = content.match(/^(\d{2}:\d{2})\s+(.*)$/);
        let taskContent = content;
        
        if (existingTimeMatch) {
          // 如果已存在时间戳，移除它（因为那是创建时间，不是开始时间）
          taskContent = existingTimeMatch[2];
          console.log(`[TimeTracking] 复选框已有时间戳 ${existingTimeMatch[1]}，替换为开始时间 ${displayTime}`);
        }
        
        const newLine = `${indent}${marker} DOING ${displayTime} <!-- ts:${startTime}|source:checkbox --> ${taskContent}`;
        console.log(`[TimeTracking] [ ] → DOING: "${newLine}"`);
        editor.setLine(cursor.line, newLine);
      } else {
        // [x] → 普通列表项
        const newLine = `${indent}${marker} ${content}`;
        console.log(`[TimeTracking] [x] → 普通列表: "${newLine}"`);
        editor.setLine(cursor.line, newLine);
      }
      return;
    }
    
    // 2. 检测任务状态（支持 Logseq 格式：已有 - 前缀）
    // 使用原始行来检测 DOING 状态（因为需要时间注释），其他状态使用清理后的行
    const todoMatch = cleanedLine.match(/^(\s*)([-*+]|\d+\.)\s+(TODO)\s+(.*)$/); // 匹配 TODO 及其后的所有内容
    const doingMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(DOING)\s+(?:\d{2}:\d{2}\s+)?(?:<!--[^>]*-->)?\s*(.*)$/); // 支持状态后的时间和注释
    const doneMatch = cleanedLine.match(/^(\s*)([-*+]|\d+\.)\s+(DONE)\s+(?:\d{2}:\d{2}\s+)?(.*)$/); // 支持 DONE 后的时间戳
    
    console.log(`[TimeTracking] 匹配结果 - TODO: ${!!todoMatch}, DOING: ${!!doingMatch}, DONE: ${!!doneMatch}`);
    
    let newLine = '';
    
    if (todoMatch) {
      // TODO → DOING: 添加开始时间，记录来源为 todo，显示开始时间
      // 如果 TODO 后已经有时间戳（创建时间），用新的开始时间替换它
      const [, indent, marker, , content] = todoMatch;
      const startTime = new Date().toISOString();
      const displayTime = this.formatStartTime(startTime);
      
      // 检查内容中是否已经存在时间戳（格式：HH:MM）
      const existingTimeMatch = content.match(/^(\d{2}:\d{2})\s+(.*)$/);
      let taskContent = content;
      
      if (existingTimeMatch) {
        // 如果已存在时间戳，移除它（因为那是创建时间，不是开始时间）
        taskContent = existingTimeMatch[2];
        console.log(`[TimeTracking] TODO 已有时间戳 ${existingTimeMatch[1]}，替换为开始时间 ${displayTime}`);
      }
      
      if (taskContent.trim()) {
        newLine = `${indent}${marker} DOING ${displayTime} <!-- ts:${startTime}|source:todo --> ${taskContent}`;
      } else {
        newLine = `${indent}${marker} DOING ${displayTime} <!-- ts:${startTime}|source:todo -->`;
      }
      console.log(`[TimeTracking] TODO → DOING: "${newLine}"`);
      
    } else if (doingMatch) {
      // DOING → DONE 或 [x]: 根据来源决定
      const [, indent, marker, , content] = doingMatch;
      
      console.log(`[TimeTracking] DOING 匹配 - content: "${content}"`);
      
      // 从原始行中提取开始时间戳（HH:MM 格式）
      const startTimeMatch = line.match(/DOING\s+(\d{2}:\d{2})/);
      const startTimeDisplay = startTimeMatch ? startTimeMatch[1] : null;
      
      // 提取开始时间和来源
      const trackingInfo = this.extractTrackingInfo(line);
      if (trackingInfo) {
        const start = new Date(trackingInfo.startTime);
        const end = new Date();
        const durationSeconds = Math.floor((end.getTime() - start.getTime()) / 1000);
        const durationStr = this.formatDuration(durationSeconds);
        
        // 获取纯净的任务内容（移除可能残留的注释）
        let taskText = this.removeTimeComment(content).trim();
        
        if (trackingInfo.source === 'checkbox') {
          // 来自复选框，返回 [x]，保留开始时间
          if (this.settings.autoAppendDuration && taskText) {
            if (startTimeDisplay) {
              newLine = `${indent}${marker} [x] ${startTimeDisplay} ${taskText} ${durationStr}`;
            } else {
              newLine = `${indent}${marker} [x] ${taskText} ${durationStr}`;
            }
          } else if (taskText) {
            if (startTimeDisplay) {
              newLine = `${indent}${marker} [x] ${startTimeDisplay} ${taskText}`;
            } else {
              newLine = `${indent}${marker} [x] ${taskText}`;
            }
          } else {
            newLine = `${indent}${marker} [x] `;
          }
          console.log(`[TimeTracking] DOING → [x] (来自复选框): "${newLine}"`);
        } else {
          // 来自 TODO，返回 DONE，保留开始时间
          if (this.settings.autoAppendDuration) {
            if (taskText) {
              if (this.settings.durationPosition === 'end') {
                if (startTimeDisplay) {
                  newLine = `${indent}${marker} DONE ${startTimeDisplay} ${taskText} ${durationStr}`;
                } else {
                  newLine = `${indent}${marker} DONE ${taskText} ${durationStr}`;
                }
              } else {
                if (startTimeDisplay) {
                  newLine = `${indent}${marker} DONE ${startTimeDisplay} ${durationStr} ${taskText}`;
                } else {
                  newLine = `${indent}${marker} DONE ${durationStr} ${taskText}`;
                }
              }
            } else {
              if (startTimeDisplay) {
                newLine = `${indent}${marker} DONE ${startTimeDisplay} ${durationStr}`;
              } else {
                newLine = `${indent}${marker} DONE ${durationStr}`;
              }
            }
          } else {
            if (taskText) {
              if (startTimeDisplay) {
                newLine = `${indent}${marker} DONE ${startTimeDisplay} ${taskText}`;
              } else {
                newLine = `${indent}${marker} DONE ${taskText}`;
              }
            } else {
              if (startTimeDisplay) {
                newLine = `${indent}${marker} DONE ${startTimeDisplay}`;
              } else {
                newLine = `${indent}${marker} DONE`;
              }
            }
          }
          console.log(`[TimeTracking] DOING → DONE (来自 TODO): "${newLine}"`);
        }
      } else {
        // 没有开始时间，默认标记为 DONE
        let taskText = this.removeTimeComment(content).trim();
        if (taskText) {
          newLine = `${indent}${marker} DONE ${taskText}`;
        } else {
          newLine = `${indent}${marker} DONE`;
        }
        console.log(`[TimeTracking] DOING → DONE (无计时): "${newLine}"`);
      }
      
    } else if (doneMatch) {
      // DONE → 普通列表项: 清除时长和状态标记，但保留时间戳
      const [, indent, marker, , content] = doneMatch;
      
      console.log(`[TimeTracking] DONE 匹配 - content: "${content}"`);
      
      // 移除时长标记
      let taskText = this.removeDuration(content).trim();
      
      console.log(`[TimeTracking] 移除时长后: "${taskText}"`);
      
      if (taskText) {
        newLine = `${indent}${marker} ${taskText}`;
      } else {
        newLine = `${indent}${marker} `;
      }
      console.log(`[TimeTracking] DONE → 普通列表: "${newLine}"`);
      
    } else {
      // 3. 检查是否是普通列表项（使用清理后的行）
      const listMatch = cleanedLine.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
      console.log(`[TimeTracking] 普通列表匹配: ${!!listMatch}`);
      
      if (listMatch) {
        const [, indent, marker, content] = listMatch;
        
        console.log(`[TimeTracking] 列表项 - marker: "${marker}", content: "${content}"`);
        
        if (content.trim()) {
          // 有内容，添加 TODO
          newLine = `${indent}${marker} TODO ${content}`;
        } else {
          // 空列表项，添加 TODO
          newLine = `${indent}${marker} TODO `;
        }
        console.log(`[TimeTracking] 普通列表 → TODO: "${newLine}"`);
      } else {
        // 4. 不是列表项（使用清理后的行）
        const indent = cleanedLine.match(/^(\s*)/)?.[1] || '';
        if (cleanedLine.trim()) {
          // 有内容，转换为 TODO 列表
          const content = cleanedLine.trim();
          newLine = `${indent}- TODO ${content}`;
        } else {
          // 空行，创建新的 TODO 列表项
          newLine = `${indent}- TODO `;
        }
        console.log(`[TimeTracking] 非列表 → TODO: "${newLine}"`);
      }
    }
    
    // 替换当前行
    console.log(`[TimeTracking] 最终替换: "${line}" → "${newLine}"`);
    editor.setLine(cursor.line, newLine);
  }
}

class TimeTrackingSettingTab extends PluginSettingTab {
  plugin: TimeTrackingPlugin;

  constructor(app: App, plugin: TimeTrackingPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Time Tracking 设置' });

    new Setting(containerEl)
      .setName('注册 Cmd+Enter 快捷键')
      .setDesc('启用后自动绑定 Cmd+Enter 快捷键。如果与其他插件冲突，可以关闭此选项（需要重启 Obsidian）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.registerHotkey)
        .onChange(async (value) => {
          this.plugin.settings.registerHotkey = value;
          await this.plugin.saveSettings();
          // 提示需要重启
          const notice = document.createElement('div');
          notice.textContent = '请重启 Obsidian 以使快捷键设置生效';
          notice.style.cssText = 'color: var(--text-warning); margin-top: 8px;';
          toggle.controlEl.parentElement?.appendChild(notice);
        }));

    new Setting(containerEl)
      .setName('启用实时预览渲染')
      .setDesc('在实时预览模式中将 TODO/DOING/DONE 渲染为复选框（需要重启 Obsidian）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableLivePreview)
        .onChange(async (value) => {
          this.plugin.settings.enableLivePreview = value;
          await this.plugin.saveSettings();
          const notice = document.createElement('div');
          notice.textContent = '请重启 Obsidian 以使设置生效';
          notice.style.cssText = 'color: var(--text-warning); margin-top: 8px;';
          toggle.controlEl.parentElement?.appendChild(notice);
        }));

    new Setting(containerEl)
      .setName('启用阅读模式渲染')
      .setDesc('在阅读模式中将 TODO/DOING/DONE 渲染为复选框')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableReadingMode)
        .onChange(async (value) => {
          this.plugin.settings.enableReadingMode = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('显示状态标签')
      .setDesc('显示 DOING、LATER、NOW 等状态标签')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showStatusLabel)
        .onChange(async (value) => {
          this.plugin.settings.showStatusLabel = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('启用删除线')
      .setDesc('为 DONE 和 CANCELED 任务添加删除线样式')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableStrikethrough)
        .onChange(async (value) => {
          this.plugin.settings.enableStrikethrough = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('自动追加时长')
      .setDesc('完成任务时自动在任务末尾追加耗时')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoAppendDuration)
        .onChange(async (value) => {
          this.plugin.settings.autoAppendDuration = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('时长显示位置')
      .setDesc('选择时长显示在任务文本的位置')
      .addDropdown(dropdown => dropdown
        .addOption('end', '任务末尾 (- DONE 任务名称 5分钟)')
        .addOption('afterStatus', '状态后面 (- DONE 5分钟 任务名称)')
        .setValue(this.plugin.settings.durationPosition)
        .onChange(async (value: 'end' | 'afterStatus') => {
          this.plugin.settings.durationPosition = value;
          await this.plugin.saveSettings();
        }));
  }
}
