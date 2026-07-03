---
alwaysApply: true
---

# TypeScript 开发标准

## 代码规范

*   **函数注释**: 必须添加函数级注释
*   **语言**: 中文注释，英文技术术语
*   **类型**: 严格 TypeScript 模式，禁止使用 `any`
*   **静态检查**: Lint 采用严格模式，所有告警（warning）均视为错误（error）。lint + typecheck 均必须零错误通过，任何级别的问题都不得跳过或降级
*   **格式**: 统一使用 Prettier 格式化
*   **文件大小**: 单个代码文件应小于 300 行，严禁超过 500 行；过大代码应拆分为多个模块

## TypeScript 运行方式

*   **单文件执行**: 优先使用 `npx tsx` 直接运行 TypeScript 文件
*   **项目级命令**: 构建、测试、lint 等仍通过 `npm run` 脚本入口执行

## 脚本语言规范

技能开发必须采用 **TypeScript** 作为唯一脚本语言，禁止使用其他脚本语言。

| 语言 | 状态 | 说明 |
|------|------|------|
| TypeScript（`.ts` / `.tsx`） | **强制使用** | 唯一允许的脚本语言，支持类型安全和编译期检查 |
| Python（`.py`） | **禁止** | 不允许在 skill 的 `scripts/` 目录中使用 |
| Batch（`.bat` / `.cmd`） | **禁止** | 不允许使用 Windows 批处理脚本 |
| PowerShell（`.ps1`） | **禁止** | 不允许使用 PowerShell 脚本 |
| Shell（`.sh`） | **禁止** | 不允许使用 Shell 脚本 |

**执行方式**：使用 `npx tsx` 直接运行 TypeScript 文件，或通过 `npm run` 脚本入口执行。

## 路径处理强制规则

### 绝对路径获取与校验

所有路径处理必须遵循以下流程：

1. **获取绝对路径**：使用 `path.resolve()` 或 `path.join()` 将相对路径转换为绝对路径
2. **路径校验**：校验路径是否在允许的范围内（如项目根目录、临时目录）
3. **安全检查**：检查路径是否包含 `..` 跳转、符号链接等安全风险

**禁止**直接使用用户输入的相对路径或未经校验的路径。

### 路径拼接规范

**禁止文本路径拼接**：禁止使用字符串拼接（`+` / template literal）构建路径。

**强制使用 `path.join()`**：所有路径组合必须通过 Node.js 的 `path.join()` 方法进行。

```typescript
import path from 'path';
const fullPath = path.join(baseDir, 'subdir', 'file.txt');
```

### 敏感目录访问授权

访问以下系统敏感目录时，必须**强制要求人类授权**。敏感目录按操作系统分类，涵盖 Linux、macOS 和 Windows 平台：

| 操作系统 | 敏感目录 | 触发条件 | 授权方式 |
|----------|----------|----------|----------|
| **Linux** | `/etc/` | 读取或写入系统配置文件 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `/root/` | 任何访问 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `/home/`（其他用户） | 访问非当前用户目录 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `~/.ssh/` | 读取 SSH 密钥 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `~/.aws/` | 读取 AWS 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `~/.gcp/` | 读取 GCP 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `/var/log/` | 读取系统日志 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/Library/` | 读取或写入系统库文件 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/private/` | 任何访问 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/Users/`（其他用户） | 访问非当前用户目录 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/Users/<User>/.ssh/` | 读取 SSH 密钥 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/Users/<User>/.aws/` | 读取 AWS 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/Users/<User>/.gcp/` | 读取 GCP 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/var/log/` | 读取系统日志 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Windows\` | 读取或写入系统目录 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\ProgramData\` | 读取或写入程序数据 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Users\`（其他用户） | 访问非当前用户目录 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Users\<User>\.ssh\` | 读取 SSH 密钥 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Users\<User>\.aws\` | 读取 AWS 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Users\<User>\.gcp\` | 读取 GCP 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Users\<User>\AppData\` | 读取或写入应用数据 | 添加强制参数 `--confirm-sensitive-access` |

**授权机制**：脚本执行时必须检查是否携带强制授权参数，未授权则立即终止并提示用户。

**跨平台检测**：脚本必须使用 `os.platform()` 检测当前操作系统，根据平台选择对应的敏感目录列表进行校验。