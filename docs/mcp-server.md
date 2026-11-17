# Trip Planner 远程 MCP

实现日期：2026-11-17。真实客户端结果见 [验收记录](mcp-e2e.md)，接入方式见 [客户端教程](mcp-clients.md)。**实现了协议和服务，不等于已通过某个客户端验收。**

## 运行边界

`/mcp` 是同一 Next.js 后端中的 Streamable HTTP 端点，使用官方 MCP TypeScript SDK，采用无会话的 JSON 响应模式，适合 Vercel 多实例及 CloudBase Run。只发布 tools 能力，不请求 sampling，不调用模型，不配置用户或平台模型 Key。提取攻略、聊天、截图和规划由用户的 AI 完成。无抓取、订票、支付、资源永久删除工具。

请求链路：MCP adapter → `invokeTool` 的 Zod 校验 → `ai_invoke_v1` → scope、授权资源、当前数据库协作权限 → 共享业务服务 → 现有 Trip/item RPC → PostgreSQL 事务提交。adapter 不直接改表。浏览器个人收藏页使用同一个服务，通过现有网页登录身份调用 `ai_web_invoke_v1`。现有 Plan、Trip 设置继续使用原业务 RPC；数据和版本机制一致。

原 Research/Idea 依附某个 Trip，保留原功能。`saved_ideas` 是新增个人收藏库，允许没有日期或 Trip。行程保存独立快照与 `saved_idea_id`，同一 Idea 可用于多个 Trip。改快照不修改收藏，改收藏不修改快照。网页入口：`/ideas`、`/account/ai`，Trip 菜单中的“复制给 AI 的任务”只包含 ID 和任务要求。

## OAuth

现有网页登录不是第三方授权。新增授权服务使用维护中的 `@node-oauth/oauth2-server`，只开放 Authorization Code（强制 S256 PKCE）和刷新流程，禁用密码、隐式和客户端凭据 grant。

| 地址                                                      | 用途                                                  |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `/.well-known/oauth-protected-resource/mcp`（根路径也可） | RFC 9728 资源发现                                     |
| `/.well-known/oauth-authorization-server`                 | RFC 8414 授权服务发现                                 |
| `/oauth/authorize` → `/oauth/consent`                     | 浏览器登录、选择 scope 和 Trip 范围                   |
| `/oauth/token`                                            | code 交换、刷新令牌轮换                               |
| `/oauth/revoke`                                           | RFC 7009：提交 `token` 和 `client_id`，独立撤销该连接 |
| `/oauth/register`                                         | 可选 RFC 7591 公共客户端动态注册                      |

支持预注册公共客户端和受限动态注册；不声称支持 CIMD，不拉取任意客户端元数据 URL。动态注册限制每分钟 10 次，最多 5 个回调地址，只允许 HTTPS 或 loopback HTTP，禁止 fragment、用户名/密码、通配符。预注册也匹配完整回调地址（包括端口），CLI 应固定回调端口或用动态注册。只支持 `token_endpoint_auth_method=none`；要求 confidential client secret 的客户端模式暂不支持。

访问令牌为高熵 opaque token，15 分钟到期；刷新令牌 30 天，单次使用后轮换。数据库只保存 SHA-256 摘要，不存原始 code/access/refresh token。JWT、错误签名、错误 issuer/resource 的令牌不能冒用 opaque 凭据。授权与 token 绑定配置的 issuer 和资源 `/mcp`，不能由请求 Host 决定。客户端参数中的 `user_id` 不被接受；用户来自有效凭据。

每个浏览器授权产生独立 connection。scope 至少覆盖 `trips:read/write`、`ideas:read/write`，用户明确选择指定 Trip 或有权限访问的全部现有/未来 Trip。个人 Idea 权限与 Trip 范围分开显示。scope 不替代协作权限；当前协作关系每次重新查询。原系统只有 owner 和 collaborator，二者可编辑；只读连接由只读 scope 表达，不新增不受原业务支持的 viewer 角色。新建 Trip 需要全部 Trip 的明确授权。

撤销行锁与调用事务串行：已提交撤销后，下一次业务调用拒绝旧 access token，refresh token 也无法恢复。进行中的调用可能在撤销之前完成；撤销请求返回后不会再开始有权限的旧令牌调用。重试命中幂等结果之前同样重新授权。其他连接不受影响。拒绝、取消、错误 PKCE 不产生可使用的 access/refresh token。

## 配置和迁移

无需模型 Key。复用区域已有的服务端数据库凭据：Global 的 `SUPABASE_SECRET_KEY`，或 CN 的 `CLOUDBASE_API_KEY`；这些不是给 AI 客户端的凭据。

```dotenv
MCP_ENABLED=1
MCP_PUBLIC_ORIGIN=https://your-public-test-origin.example
MCP_DYNAMIC_REGISTRATION=1
MCP_RATE_LIMIT_PER_MINUTE=60
MCP_ALLOWED_ORIGINS=https://chatgpt.com,https://claude.ai
MCP_CLIENTS_JSON=[]
MCP_ALLOW_LOCAL_HTTP=0
```

生产/Preview 必须是公网 HTTPS，发现、MCP、OAuth 路径不能落入 Vercel 登录保护。优先给测试部署配置单独的公网自定义域名，不把自动化 bypass secret 放入用户配置。现有浏览器登录的 site URL、安全域名、上游 OAuth callback 也必须使用正确区域和地址。服务端 Origin 校验使用明确 allowlist；无 Origin 的原生/服务端客户端可以连接。反向代理必须覆盖外部传入的 X-Forwarded-For，另有每凭据数据库限流。`MCP_ALLOW_LOCAL_HTTP=1` 仅供 loopback 本地测试，不允许用于 Vercel。

可选预注册（固定回调示例，按客户端实际显示的地址修改）：

```json
[
  {
    "client_id": "my-codex",
    "client_name": "My Codex",
    "redirect_uris": ["http://127.0.0.1:5555/callback"],
    "token_endpoint_auth_method": "none"
  }
]
```

先部署以下五个共享迁移生成的区域版本，再启用端点：

1. `20261117090000_mcp_authorization.sql`
2. `20261117091000_personal_idea_library.sql`
3. `20261117092000_mcp_itinerary_service.sql`
4. `20261117093000_mcp_business_gateway.sql`
5. `20261117094000_mcp_scoped_invocation.sql`

遵守仓库统一迁移流程：编辑 `database/shared/migrations`，运行 `npm run build:database-pg-migrations` 和 `npm run build:cloudbase-pg-rpc-surface`，提交生成的 Supabase/CloudBase 文件及 catalog。不要编辑冻结 baseline。Supabase 使用项目已配置的 CLI migration deploy 流程，CN 使用现有受控 workflow；不要跳过目标环境校验、迁移账本、清理或 residue audit。

## 工具及一致性

共 12 个工具：`account_get`、`trip_list/get/create/update/archive`、`idea_search/save_many/update/archive`、`itinerary_apply_changes`、`change_undo`。读取工具有 `readOnlyHint=true`；写入有幂等语义，批量行程/撤销标为可能破坏性修改。annotations 仅是客户端提示，服务端始终授权。

可编辑资源返回 revision。Idea revision 为整数的字符串形式；Trip revision 是现有 `version:content_version`，任何相关网页修改都会使旧版本失效。更新必须提交 `expected_revision`；冲突不得覆盖，重新读后重做决定。归档 Trip 复用产品现有 Completed (`status=done`) 状态，恢复设 `trip_update.patch.archived=false`；Idea 同样用 `idea_update.patch.archived=false`。

`trip_get` 默认只返回摘要，可指定 `section=days/items`、`day_id`、`variant_id`，用 `cursor`/`limit` 分页。所有列表最多 50 条。日期是 PostgreSQL `date` / ISO `YYYY-MM-DD`，时间是当地 wall-clock，Trip timezone 是 IANA 名称，不通过 UTC 时间戳表示旅行日期。

`idea_save_many` 最多 50 条，只需 name。稳定地点 ID 使用 `provider:id` 格式；链接去 fragment 和常见跟踪参数、排序查询参数后去重。原来源链接、来源类型、notes、reason、tags 保留。新来源默认待核实；缺 region 可保存，并出现在 `needs_completion`。同稳定 ID 或规范化链接返回 duplicate，不覆盖备注；名称相似返回候选，仍保存为独立收藏。明确返回 `created/duplicates/needs_completion/failed`。输入结构不合法时请求返回 `INVALID_INPUT`；数据库可识别的单条保存失败进入 failed。

行程修改必须先 `dry_run=true`，包含最多 50 条 add/update/move/remove。返回 10 分钟有效 preview ID、规范化变更（新 item ID 已分配）、基础 revision 和提议快照。dry-run 在数据库子事务中执行真实校验，再完整回滚；只保存预览和重试结果，不保存正式行程。提交提供同 Trip、基础 revision、preview ID、`dry_run=false` 和新的幂等 key，可省略 changes；如带 changes，必须与规范化预览完全一致。预览绑定用户和连接；基础版本变化后不可使用。提交在一个事务中执行，任何失败全部回滚。

V1 可管理 activity/meal，不跨 Plan 移动已有 item。复杂 flight/stay/transport 仍需现有专用编辑器。删除带附件、Day route 或旧 Research 关联的 item 会明确拒绝，防止通用操作破坏复合业务数据。移除普通 item 的快照与链接可撤销。没有永久删除 Trip/Idea 的工具。

所有写工具要求 8–128 字符 `idempotency_key`，按用户和连接隔离。数据库锁和唯一主键保证并发首次请求也只写一次；同 key 同规范化请求返回已提交结果，不同请求报错。收据未自动过期，重试不会生成第二份数据。每次写入记录来源连接、用户、时间和必要的前后快照；返回 change ID。撤销重新检查权限、资源范围和后续 revision，拒绝覆盖后续编辑。创建的资源通过归档撤销。复原 item 使用递增版本，避免删除/恢复后旧版本重新生效。

| 稳定错误码                                   | 处理                                   |
| -------------------------------------------- | -------------------------------------- |
| `INVALID_TOKEN`                              | 浏览器重新连接；撤销后不得重试刷新恢复 |
| `INSUFFICIENT_SCOPE` / `RESOURCE_FORBIDDEN`  | 查看连接范围或当前协作权限             |
| `REVISION_CONFLICT`                          | 重读资源并重新规划                     |
| `UNDO_CONFLICT`                              | 保留后续编辑，人工决定下一步           |
| `PREVIEW_INVALID`                            | 使用当前版本创建新预览                 |
| `IDEMPOTENCY_MISMATCH`                       | 原请求重试用原 key，新请求用新 key     |
| `RATE_LIMITED`                               | 按 `Retry-After: 60` 等待              |
| `REQUEST_TOO_LARGE` / `BATCH_LIMIT_EXCEEDED` | 减小请求，最多 128 KiB、50 条          |

工具返回结构化 JSON、网页链接、错误码。端点有请求体流式上限（不只信任 Content-Length），OAuth 表单/注册最多 16 KiB。数据库共享分钟限流可用环境变量调低验证。应用不记录原始凭据，错误不回显数据库异常、工具参数或 token；反向代理/APM 也应禁止 Authorization、cookie、token body 和 OAuth code 查询参数采集。

## 可复现验证

```bash
npm ci
npm run test:mcp
npm run typecheck
npm run lint
npm run check:i18n
npm run check:database-pg-migrations
npm run check:cloudbase-pg-rpc-surface
npm run check:backend-provider-boundary
```

`test:mcp` 启动独立 PostgreSQL 17 容器，对两个区域分别运行完整真实迁移和业务 RPC，用真实 OAuth 库进行 code/PKCE/token/refresh/revoke，并用官方 SDK 测初始化和工具调用。准备 A/B 及 owner/collaborator、只读 scope，测试并发首写、越权、撤销、预览事务回滚、网页服务双向读取、日期、冲突、undo、请求限额。容器销毁后独立检查 residue。managed auth/storage schema 是本地适配器，不代表已测试真实区域登录服务；不依赖模型 Key，不用模型 mock。

区域全量发布门禁仍需 `npm run test:e2e:preflight`、Global/CN live E2E、清理和 residue 检查，或同 SHA 的必需 CI。真实客户端的自然语言与浏览器流程另行验收，不能由这里的 SDK/脚本代替。

## 回滚及限制

先设 `MCP_ENABLED=0` 并重新部署，阻止新授权及调用；必要时在受控数据库会话中将 `app_private.ai_connections.revoked_at` 统一设为当前时间，永久失效旧授权，再回滚应用部署。迁移为增量，保留收藏、引用和审计表，**不执行删表或丢数据的 down migration**。回退旧网页时新增列不影响旧 RPC。重新开启前应重做部署和客户端验收。

当前尚未接入自动过期凭据/预览/rate bucket 清理任务，数据库记录会增长；运维可按 expires_at 清理过期临时记录，保留审计、有效连接及幂等收据。未实现服务端网页提取、模型规划、CIMD、confidential clients 或复杂预订项目编辑。客户端支持状态仅以验收矩阵为准。
