# 客户端接入教程

核对官方文档日期：2026-11-18。此前 Codex Desktop 26.1111.21308 的 Cloud 对话通过的是 Global 单区域 E2E；当前双区域流程仍须单独验收。其他客户端和运行模式见 [矩阵](mcp-e2e.md)。菜单可能随客户端版本、账号、工作区政策变化；没有入口时记录“待验收/当前账号不支持”，不要跳过 OAuth 改用共享 token。

统一公网 MCP URL 为 `https://therewego.world/mcp`。在网站“连接你的 AI”页面绑定 CN 并设置默认区域，客户端地址不变。选择 OAuth；浏览器内登录 Trip Planner，查看客户端名及回调地址，选择 scope、个人 Idea 权限和指定/全部 Trip 范围。写入需要对应 write scope；Trip 中引用个人 Idea 也需要 ideas:read。创建新 Trip 需要明确授权全部行程。密码和验证码只输入浏览器登录页面，工具中不提供这些信息，也不需要模型 API Key。

## Codex CLI、Desktop 和网页

官方说明：[Codex MCP](https://developers.openai.com/codex/mcp/)。本文核对的文档支持 Streamable HTTP、OAuth、CIMD 和 DCR；本服务选择 DCR/预注册，不宣称 CIMD。

CLI（先查看本机 `codex --version` 和 `codex mcp --help`）：

```bash
codex mcp add trip-planner --url https://therewego.world/mcp
codex mcp login trip-planner
```

也可在用户配置中添加：

```toml
[mcp_servers.trip-planner]
url = "https://therewego.world/mcp"
```

Desktop 在 MCP 设置中添加远程地址并登录；如果该版本共享 CLI 配置，重载后检查 `/mcp` 中的状态。网页/Cloud 模式是否接受任意远程服务器取决于当前产品能力及组织策略，不能将 CLI 的通过结果直接当作网页已支持。

启用 DCR 可让客户端注册实际的随机 loopback 回调。预注册时按客户端显示的**完整**回调地址配置，包含端口和路径。当前 Codex 文档有 `--oauth-client-id` 和 `mcp_oauth_callback_port`；不同 issuer 识别能力会改变回调路径，不能复制一个猜测地址。不要使用 `bearer_token_env_var` 配置产品授权，以免绕开浏览器范围选择与独立撤销。

### 授权成功但对话没有工具

先重启客户端并新建对话，单独调用 `account_get`，成功后再执行业务任务。本次 Desktop 的 Cloud 会话在重启前未加载工具，重启后已实际完成业务调用；完整结果见验收矩阵。记录实际 Local/Cloud 模式，分别核对 MCP 配置、网络和认证，不能由某次工具未加载就推断整个模式不支持。模型在 shell 中请求 URL 的结果不能代替 MCP 工具调用。

当前官方文档中，可选 MCP 的初始工具目录默认只等待 1000 毫秒（顶层 `mcp_optional_startup_grace_ms`）。需要排查启动时，可在**现有该服务器配置块**中临时加入：

```toml
required = true
startup_timeout_sec = 30
```

重启客户端并新建对话；必需服务若启动失败，会显示具体错误。检查服务器是否 enabled、是否有误设的 enabled_tools/disabled_tools，以及 Settings/MCP 的实际状态。排查结束可移除 `required`，避免服务器不可用时阻塞其他任务。不要粘贴 OAuth 存储文件或令牌到聊天中。

## ChatGPT 网页 / Desktop

官方说明：[Add custom MCP server](https://platform.openai.com/docs/guides/developer-mode)。该文档当前指向 [ChatGPT Plugins](https://chatgpt.com/plugins)：点击加号 → “Add custom MCP server”，填写 Server URL，选择 OAuth，审核风险提示后 “Create as a plugin”，随后安装插件。组织管理员的权限和 Lockdown 策略可能限制该能力；以当前官方文档和账号界面为准。

填写本产品 `/mcp` 地址。服务未声明 CIMD；使用 DCR，或由部署者预注册该 ChatGPT 应用的实际回调。仅支持公共客户端 `none`，若该账号只允许 confidential secret，记为当前模式不支持。授权后在聊天中明确启用对应应用，再运行下文任务。Desktop 是否展示同一自定义应用需在其实际版本验证，不由网页结果推断。

## Claude Code

官方说明：[Claude Code MCP](https://code.claude.com/docs/en/mcp)。先记录 `claude --version`：

```bash
claude mcp add --transport http trip-planner https://therewego.world/mcp
claude mcp login trip-planner
```

也可打开 `/mcp` 检查并认证。当前官方文档提供 `--callback-port` 固定 loopback 端口，以及预注册 client ID 配置；以本机帮助为准。DCR 模式优先，预注册需要匹配完整回调。未在真实 Claude Code 运行前保持待验收。

## Claude 网页 / Desktop

官方说明：[Remote MCP custom connectors](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)。在账号提供 custom connector 功能时添加公网 MCP 地址并浏览器授权。不要用 Desktop 的本地 stdio JSON 配置替代远程 OAuth 测试；若依赖桥接器，应单列桥接模式及版本，不能算原生支持。本次尚无账号验收。

## 豆包工作桌面端

[官方产品入口](https://www.doubao.com/)。当前尚未核实可引用的远程 Streamable HTTP + 第三方 OAuth 接入文档或账号入口。需要在安装版本的帮助中心核对传输、OAuth、动态/预注册能力。只提供本地 stdio、静态 token 或没有 scope 授权入口时，不应宣称兼容；记录具体版本和“当前不支持”或“待验收”。

## 每个客户端都执行的任务

1. 记录客户端版本、网页构建/账号模式、日期、传输和认证方式，添加 MCP，完成浏览器登录及范围选择。
2. 对 AI 说：“请将以下四个收藏保存为 Idea；先查询已有收藏，只按稳定地点 ID 或同一来源链接去重，保留我的备注，缺区域也保存并标为待补充。”输入一条已预置、三条新数据，其中一条无 region。
3. 打开 `/ideas` 刷新，核对新增三条、重复一条、来源和备注、待补充状态。不要用工具返回的成功文本代替网页核对。
4. 用自然语言创建或读取 Trip，将两个已有 Idea 加入活动行程；先预览，用户确认后提交。打开真实 Trip 页面核对日期、时区和引用。
5. 对 AI 说：“将这两个活动批量移到第二天；先显示预览。”确认后提交，刷新网页核对。
6. 在网页修改标题、备注或项目，再让 AI 重读获得新状态。使用旧 revision 的工具提交应报告冲突。
7. 在 `/account/ai` 撤销该连接，然后让同客户端再次读取私人 Trip；必须失败。其他独立连接应仍有效。

每步记录结果和必要脱敏截图，只保存业务测试数据、版本、日期和错误码；不保存 cookie、Authorization、code、token、HAR 凭据或密码页面。至少一客户端需要完成“批量调整 → 网页核对 → 撤销”完整流程，才具备真实客户端发布验收证据。

## 地点扩展

启用后重新授权并选择 `places:read`，客户端可使用 `place_search` / `place_resolve`。用户不用提供 Google Key。先搜索并确认地点，再把 `selection_id` 带入收藏及行程写入；只有来源链接时先保存，不猜坐标。完整示例、有效期和限额见 [地点文档](mcp-places.md)。各客户端的地图扩展实际验收另记，原有文本流程通过不等于地点扩展通过。
