测试预置的 3 个 MCP 服务器工具。依次执行以下操作：

## 1. bing-search 搜索
用 MCP 工具搜索 "12306 火车票"，调用 `mcp_bing_search`（参数: query="12306 火车票"）。

## 2. fetch 获取网页
用 MCP 工具获取网页内容，调用 `mcp_fetch`（参数: url="https://httpbin.org/get"）。

## 3. sequential-thinking 思考
用 MCP 工具进行顺序思考，调用 `mcp_sequentialthinking`（参数: thought="分析今天可能下雨的概率"）。

## 4. 汇总
调用 complete_task，报告每个 MCP 工具的调用结果。
