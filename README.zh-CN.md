# fence-check

基于 tree-sitter WASM 的对话代码块语法检查器——112 种语言，零配置。

每条 assistant 消息（正文**和**思维链）结束的瞬间即被检查；语法错误以紧凑的 `fence-check` 报告呈现。干净的代码保持静默。

## 安装

```bash
pi install npm:fence-check
```

## 能力

- **112 种语言** — js/ts/py/go/rs/java/c#/haskell/scheme/clojure/racket/erlang/julia/elm/ocaml/dart/ruby/vue + datalog(souffle)/sml/prolog（本地构建，见 `grammars/README.md`）
- **实时** — 消息结束立即注入报告（`message_end` 钩子），不等轮末
- **思维链也查** — thinking 里的代码块同样被检查
- **故障点定位** — 最深错误节点 + 区域跨度（`L6:20 ERROR (region L1-L6)`）
- **安静设计** — 只报错误；`no-check` 标记豁免；agent 结束后停止审计
- **`/fence-check`** — 手动复查最近一条 assistant 消息

## 用法

正常写代码块即可，自动被检查：

````markdown
```datalog
dep(a, b). dep(b, c). dep(c, a).
reach(X, Y) :- dep(X, Y).
```
````

**伪代码/设计图**（非真实源码）用 `no-check` 标记豁免：

````markdown
```typescript no-check
tool_call(todo) → gate → BLOCK
```
````

## 报告格式

```
**fence-check v6: 1 block(s) with syntax errors**

**`js`** (block at message line 4) — 1 issue(s):
- ✗ L3:9 ERROR — `return a + b`

_语法提示，无需回应——后续写代码注意严谨即可。_
```

报告是提示不是任务：无需专门回应——后续写代码保持严谨即可。

## 设计哲学

这个扩展源于一个简单观察：如果 AI 每轮都被告诉"你的代码块写错了"，它最终会开始解释、辩护、甚至不再写代码块。解法不是更严的纪律，而是**更好的信号设计**：

1. **语法级，非语义级**——只保证块可解析。不执行、不查类型。最小面、最少噪音。
2. **安静默认**——有错才报；干净代码完全静默。
3. **提示不是任务**——报告自带"无需回应"提示行，skill 明令禁止回应/解释/辩护。AI 知道有错；修正体现在**下一段代码**里，而不是消耗 token 的辩解中。
4. **逃生口，不是豁免文化**——`no-check` 只用于伪代码/设计图。真实代码永不豁免：报告是修复信号，不是威胁。
5. **实时但有界**——消息结束立即注入（`message_end`），`agent_end` 后停止审计。没有过时报告，没有事后唠叨。
6. **思维链也查**——thinking 里的代码块同样被检查。那是 agent 做符号推理（datalog 建模、验证草图）的地方，恰恰是最需要解析校验的代码。
7. **版本自证**——报告头带逻辑版本（v6），"reload 生效没有"由报告自己回答。
8. **实测驱动的语言集**——每个 grammar 先 probe 验证（加载+解析）才纳入；运行时（web-tree-sitter 0.26.x）与 grammar 源（tree-sitter-wasm 1.1.4，统一 ABI 15）由版本兼容性实验选定，而非声明。
9. **本地即插即用**——无预构建 wasm 的语言（sml、souffle/datalog、prolog）本地编译一次放入 `grammars/`；目录自动扫描，零代码改动。

## 原理

- `tree-sitter-wasm`（106 预构建 grammar，CLI 0.26.x，ABI 15）+ `web-tree-sitter` 0.26.x
- 本地 `grammars/` 目录承载无预构建 wasm 的 grammar（sml/souffle/prolog）——自动扫描，放入即生效
- 标签别名（`js`→javascript、`dl`→souffle、`hs`→haskell…）见 `languages.ts`

## 开发

```bash
node test.ts    # 冒烟测试（解析器/检查/no-check/思维链提取）
node probe.ts   # 验证每个 grammar 加载 + 解析
```

本地构建 grammar（emsdk 6.x 下 `tree-sitter build --wasm` 会挂，用手动配方）：见 `grammars/README.md`。

## License

MIT
