# MCP 验收记录

记录日期：2026-11-17（Asia/Shanghai）。初次实现记录；后续按实际部署 SHA、版本及人工观察更新，不能预填通过。

## 自动化与区域条件

本地：Node 24.19.0，Docker，PostgreSQL 17，真实区域迁移和业务服务、OAuth 库、MCP SDK。managed auth/storage 身份适配不代替真实服务登录。测试数据仅在独立容器中；容器销毁后独立 residue 检查。完整命令见 [服务文档](mcp-server.md)。最终测试结果、候选 SHA 及 CI URL 在 PR 中记录。

区域 preflight 实际结果：Global/CN 均阻塞。当前 shell 缺 Global 的数据库/Maps/cron 测试配置，缺 CN Maps、目标环境及 A/B 账号密码；Chrome 可用。GitHub 凭据可访问仓库，但列出 Actions 变量及 secret 名称返回 HTTP 403；不尝试读取 secret 值。受保护 CI 是否能运行，仍需实际执行确认。

现有 Vercel 项目 `trip-planner` 位于 `team_nZGqZiDqqoQWWKVm0SdCUMGx`，项目 ID `prj_51kZNlaZEWGpQo6a1Gn0p9jr9wbd`。检查到 `ssoProtection=all_except_custom_domains`；普通 Preview URL 不能直接作为真实客户端 OAuth 端点。需可公开访问的受控测试 origin、正确区域数据库和站点登录回调配置。

已完成的部署检查：用户已添加 DNSPod CNAME，专用域名 `mcp-preview.therewego.world` 已有 HTTPS。用户明确授权仅该域名的 Vercel 平台认证例外，已生效。Supabase 项目 `ewyefmnadibnampbeyzc` 已应用全部五个新增迁移，迁移 API 自动时间戳已对齐仓库版本，后续 CLI 不会重复应用。已查询确认 anon 无 `ai_invoke_v1` 权限，authenticated 无 `ai_oauth_store_v1` 权限，service_role 有调用权限。

公网脚本实际观察：资源发现 HTTP 200、未带凭据的 MCP HTTP 401/`INVALID_TOKEN`、公共客户端动态注册 HTTP 201。它们仅是部署协议检查，不计真实客户端通过。新的 Next.js 16.4.6 候选在合入主分支后重新部署，最终 SHA/CI 以 PR 结果为准。

## 真实客户端矩阵

| 客户端                | 版本 / 运行模式                        | 验证日期 | 认证方式                  | 结果与证据                               |
| --------------------- | -------------------------------------- | -------- | ------------------------- | ---------------------------------------- |
| Codex                 | 用户可提供网页/Desktop；具体版本待记录 | 未执行   | 拟 OAuth Code + S256 PKCE | 待验收；尚无添加 MCP、自然语言或撤销证据 |
| Claude Code           | 未提供账号或安装版本                   | 未执行   | 拟 OAuth Code + S256 PKCE | 待验收                                   |
| ChatGPT 网页          | 用户可提供账号；开发者模式能力待核对   | 未执行   | 拟 OAuth Code + S256 PKCE | 待验收；尚无自然语言及网页持久化核对证据 |
| Claude 网页 / Desktop | 未提供账号或版本                       | 未执行   | 拟 OAuth Code + S256 PKCE | 待验收                                   |
| 豆包工作桌面端        | 版本和远程 OAuth 支持未核实            | 未执行   | 未核实                    | 待验收；不宣称当前支持                   |

ChatGPT Desktop 是额外待验收项，不能由 ChatGPT 网页结果推断。Codex 网页也不能由 CLI/Desktop 结果推断。用户确认可配合 ChatGPT/Codex 网页及 Desktop，但尚未完成登录和业务流程。

“批量调整 → 网页核对 → 撤销”的真实客户端完整流程：**未执行**。脚本已覆盖对应服务逻辑，不计入真实客户端通过。

## 更新每行的证据模板

记录候选 SHA、部署 origin、客户端具体版本/运行模式、日期、OAuth 注册方式、授权 scope/Trip 范围，以及七步 [验收任务](mcp-clients.md) 的结果。保留脱敏业务截图与稳定错误码；隐藏帐号标识、所有原始凭据和 code/token 查询参数。若组织不开放自定义 MCP，记录“当前账号不支持”与观察到的限制，不能填写通过。
