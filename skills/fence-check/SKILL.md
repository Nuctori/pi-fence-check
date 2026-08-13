---
name: fence-check
description: 对话代码块语法检查器。agent 回复中的 fenced code blocks 会被自动做语法检查（109+ 语言，tree-sitter WASM），有语法错误时在回复后弹出 fence-check:report（无错静默）。涉及图可达性/传递闭包/依赖传播/约束推导的推理时，用 datalog 块显式建模（会被校验）。Triggers include "datalog 推理", "代码块语法检查", "fence-check", "syntax check", "逻辑推理建模".
---

# fence-check

## 能力

- **实时检查**：每条 assistant 消息（正文+思维链）结束即检查并注入报告（message_end 钩子，不等到轮末）；有错才报（tree-sitter ERROR/MISSING 节点）
- **只报错误**：全部干净时零输出；有错时发 `fence-check:report` 自定义消息（v3 格式：故障行 + 区域跨度）
- **/fence-check 命令**：手动复查最近一条 assistant 消息，总是报告
- **语言**：109+ 预构建（js/ts/py/go/rs/java/haskell/scheme/clojure/racket/erlang/julia/elm/ocaml/dart/ruby/vue…）；sml/datalog(souffle)/prolog 由本地 grammars/ 目录提供（若存在）

## 推荐用法

1. **用代码验证思路，不瞎想**：编码/调试中遇到不确定（语法行为、API 语义、算法正确性、报错根因），写最小可执行片段验证假设（临时脚本 + shell 执行），或写代码块让语法校验确认——不要仅靠脑内推理。例如：不确定某个 tree-sitter 行为时，写个 10 行 probe 脚本跑一下（本会话即用此法定位了 ERROR 区域覆盖问题）。

2. **符号推理**：涉及图/传递闭包/依赖/环检测/约束推导的难题，用 datalog 块显式建模：

   ```datalog
   dep(a, b). dep(b, c). dep(c, a).
   reach(X, Y) :- dep(X, Y).
   reach(X, Y) :- dep(X, Z), reach(Z, Y).
   cycle(X) :- reach(X, X).
   ```

   块会被语法校验；写错（漏句点、括号不匹配、变量大小写）会立即收到报告。

3. **no-check 只用于明确非代码**：只有确定是**设计图/伪代码/文件内容预览**（带 → 箭头、占位符、非目标语言语法）时才标 ` ```ts no-check `。**真实代码一律不标 no-check**——即使残缺、中间状态、报错，也不要逃避审计。
4. **报告是提示，不是任务——不要回应**：fence-check:report 是自动语法检查的提示（每块 Lx:y + 故障行摘录）。看到报告时：
   - ❌ 不要专门回应、解释、辩护报告（不花 token 解释"这是伪代码"）
   - ❌ 不要改变行为（不停止写代码块、不给真实代码标 no-check）
   - ✅ 继续当前任务；下次写代码时注意严谨即可
   - ✅ 若确认某块确实不是代码（伪代码误标语言），下次用 no-check

6. **审计只在 agent 运行期间**：agent_end 后不再注入新报告。不要等待/引用旧的报告。

## 边界

- **语法级**：只保证代码块可解析，不执行、不查语义/类型
- **标签映射**：别名（js→javascript、dl→souffle、hs→haskell…）见扩展 languages.ts
- **已知跳过**：markdown/markdown_inline/comment 标签、无 grammar 的语言、含 "..." 省略行的块（截断降噪）
