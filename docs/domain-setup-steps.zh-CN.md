# ThereWeGo行至：域名上线操作清单

本清单按实际配置顺序排列。核查时间：2026-09-29。后台名称可能随平台更新略有差异。

## 先确认最终结构

| 地址                          | 用途                                         | 后端与数据库                      |
| ----------------------------- | -------------------------------------------- | --------------------------------- |
| `https://therewego.world`     | Global 正式站                                | 现有 Supabase                     |
| `https://www.therewego.world` | 308 跳转到 Global 主域名，保留路径和查询参数 | 同一个 Global 应用                |
| Vercel Preview 地址           | Global 预览                                  | 与 Global 正式站共用现有 Supabase |
| `https://cn.therewego.world`  | CN 站                                        | 现有上海 CloudBase 环境           |

Global 的 Preview 与 Production 继续共用 Supabase 项目
`ewyefmnadibnampbeyzc`，包括登录、数据库和存储。不新建 Supabase 项目或分支。
CN 与 Global 仍是独立账户和数据体系。

两站首页都显示低调的 `沪ICP备2026049500号-1`，链接到工信部查询页面。
首页标题及其他页面的标题后缀都连续包含完整的 `ThereWeGo行至`，中间没有空格或符号。
CN 首页为 `ThereWeGo行至 - 协作旅行规划`，Global 首页为
`ThereWeGo行至 - Collaborative trip planner`；其他页面使用 `页面名称 | ThereWeGo行至`。
`www` 会进入同一个 Global 页面，具有相同标题。

## 目前完成与待办

- 已完成：Vercel 绑定主域名和 `www`，设置 `www` 的 308 跳转。
- 已核查：Global 主域名 A 记录和 `www` CNAME 已生效，HTTPS 可以访问。
- 已完成：Supabase 允许主域名和 `www` 的登录回跳地址，保留原有地址。
- 已完成：CloudBase 安全域名加入 `cn.therewego.world`，原有 12 项完整保留。
- 待核查／填写：Google Cloud 和 Cloudflare 的新域名白名单。
- 待切换：Vercel Production、GitHub 和 Supabase 的正式站点地址。
- 待办理：CN 证书、CloudBase 自定义域名／路由、高德白名单、`cn` 解析。
- 待办理：公安联网备案；通过后补正式公安备案号、官方图标和查询链接。

当前连接不能写 DNSPod，不能管理 Google Cloud／Cloudflare。CloudBase 安全域名已自动添加；
CN 证书和域名绑定尚待办理。下列标注后台入口的步骤需要在对应账号中完成。
Google Drive 连接不能修改 Google Cloud 配置，此次无需修改 Drive 文件或权限。

## 第 1 步：Google 登录

进入 [Google Cloud Console](https://console.cloud.google.com/)，选择已有 OAuth 客户端所在项目。

1. 打开 **Google Auth Platform → Clients**，编辑已有 **Web application** 客户端。
   当前使用的客户端 ID 为
   `106808837886-gvi8ga2n0iuqt3h9hq7s03slnfr3mc1f.apps.googleusercontent.com`。
   不另建客户端，不更换 Client Secret。
2. 在 **Authorized JavaScript origins** 中添加：
   - `https://therewego.world`
   - `https://www.therewego.world`
     保留原有 Vercel 和本地开发地址。
3. 在 **Authorized redirect URIs** 中保留唯一对应当前 Supabase 的回调：
   `https://ewyefmnadibnampbeyzc.supabase.co/auth/v1/callback`。
   此处不要改成应用的 `/auth/callback`，也不要填 Preview 通配符。
4. 打开 **Branding**，填写主页 `https://therewego.world`、隐私政策
   `https://therewego.world/privacy`、服务条款 `https://therewego.world/terms`。
   在授权域名中加入 `therewego.world`；如后台要求验证所有权，按其提示操作。
5. 打开 **Audience**，确认面向公众的应用使用 External，发布状态允许正式用户登录。
   已发布的配置保留；如仍为 Testing，按后台要求完成发布。
6. 保存。登录只使用 `openid`、`email`、`profile` 基础身份权限。

验收：从 Global `/login` 点击 Google 登录，选择账号后回到当前站点并进入旅行列表。
Google 的 Client Secret 始终只放在 Supabase 的 Google Provider 中。
[官方说明](https://supabase.com/docs/guides/auth/social-login/auth-google)。

## 第 2 步：Google Maps

1. 在同一个或当前 Maps 所在 Google Cloud 项目，打开 **APIs & Services → Credentials**。
2. 找到 Vercel `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 对应的已有浏览器 Key。
3. 在 **Application restrictions → Websites / HTTP referrers** 中添加：
   - `https://therewego.world/*`
   - `https://www.therewego.world/*`
4. 保留原有 Vercel／Preview 地址，保留现有 API restrictions，保存。
5. Places／Routes 服务端 Key 继续只用于服务器，不把它们改成浏览器 Key。

验收：Global 行程页地图、地点搜索和路线正常，没有域名限制错误。
[官方说明](https://developers.google.com/maps/api-security-best-practices)。

## 第 3 步：Cloudflare Turnstile

1. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Turnstile**。
2. 编辑现有 Site Key 为 `0x4AAAAAAE1X6kJBdpA36hjd` 的 widget。
3. 在 **Hostname Management** 中允许 `therewego.world`，并确认 `www.therewego.world`
   被覆盖／允许。这里填纯主机名，不能带 `https://` 或路径。
4. 保留已有 Vercel／Preview 主机名，保存。不需要把域名 DNS 搬到 Cloudflare。
5. 保留现有 Site Key 和 Supabase 内的 Secret Key。共享后端时不要为 Preview
   把 Supabase 的 CAPTCHA Secret 换成测试 Secret。

验收：Global `/signup` 和 `/forgot-password` 的验证组件没有 invalid domain／sitekey 错误。
Turnstile 的根域名条目可覆盖子域名，具体以 widget 后台为准。
[官方说明](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)。

## 第 4 步：确认 DNSPod 和 Vercel 域名

进入腾讯云 **DNSPod → 我的域名 → therewego.world → 解析记录**。
当前以下记录已经生效，不必重复添加：

| 类型  | 主机记录 | 记录值                                | 线路 |
| ----- | -------- | ------------------------------------- | ---- |
| A     | `@`      | `216.198.79.1`                        | 默认 |
| CNAME | `www`    | `443c5344fc5d2083.vercel-dns-017.com` | 默认 |

Vercel 同时接受 `64.29.17.1`，但当前记录正常时无需增添。
以后如 Vercel 项目 **Settings → Domains** 给出不同推荐值，以该后台实时值为准。
保留现有邮件 SPF、DKIM、MX、DMARC，不更换 nameserver、不添加冲突的 AAAA 或 URL 转发。

在 Vercel **trip-planner → Settings → Domains** 中确认：

1. `therewego.world` 为 Production 域名，状态 **Valid Configuration**。
2. `www.therewego.world` 为 **Redirect to therewego.world → 308 Permanent Redirect**。
3. 两个域名的 HTTPS 正常。打开 `https://www.therewego.world/login?next=%2Ftrips`，
   应到 `https://therewego.world/login?next=%2Ftrips`。

[Vercel 官方说明](https://vercel.com/docs/domains/set-up-custom-domain)。

## 第 5 步：切换 Global 的正式站点地址

先完成第 1—4 步，再按下列顺序保存配置：

1. **Vercel → trip-planner → Settings → Environment Variables**：
   编辑 Production 的 `NEXT_PUBLIC_SITE_URL` 为 `https://therewego.world`。
   Preview 的原值保留。两者的 Supabase URL、Key、后端和数据库继续共用现有配置。
2. **GitHub → trip-planner → Settings → Environments → global-production → Variables**：
   将 `NEXT_PUBLIC_SITE_URL` 设为 `https://therewego.world`。
   这是 Variable，不是 Secret。
3. **Supabase → ewyefmnadibnampbeyzc → Authentication → URL Configuration**：
   将 **Site URL** 改为 `https://therewego.world`。
   **Redirect URLs** 中应保留：
   - `https://therewego.world/**`
   - `https://www.therewego.world/**`
   - `https://trip-planner-ivory-one.vercel.app/**`
   - `https://*-shus-projects-f7d1dcd0.vercel.app/**`
   - 现有本地开发和受控测试地址。
     前两个已添加，不必删除后面的地址。保留 Google、邮件确认、SMTP 和 CAPTCHA 配置。
4. 对已通过验证的同一个 commit 执行 **Deploy Global**，或在 Vercel 对该 Production
   deployment 选择 **Redeploy**。环境变量保存后需要重新构建才会进入客户端。
5. 验收首页、登录、注册、密码恢复、隐私／条款／支持页、Google 登录、地图、公开分享。
   用已有账号确认行程仍在；Preview 仍连接同一个 Global 后端。

[Supabase 回跳地址说明](https://supabase.com/docs/guides/auth/redirect-urls)。

## 第 6 步：CN 复用现有环境的上线准备

使用现有上海环境 `trip-planner-cn-dev-d3bz94038b26`，PG `pgdb-l4lhtrv7`，
Run 服务 `trip-planner-cn`。环境名中含 `dev` 本身不影响自定义域名，不创建新收费生产环境。

这里有一项现有仓库限制需要先处理：该环境同时是固定 live 测试目标，
`scripts/AGENTS.md` 明确要求 “never point live tests at production”。
正式接入真实用户前，需要把 live 测试目标迁到独立的受控环境，并保留所有目标检查、清理和残留审计。
专用 `Deploy CN Production` 工作流目前也明确排除这个 EnvId／PG。
不能通过删除保护或把 GitHub environment 改名来绕过；相关配置迁移需要 PR 验证。
目前仍可用现有 **Deploy CN** 完成代码和域名准备；未来独立开发环境准备好后再迁移测试目标。

## 第 7 步：CN 证书、域名绑定与安全域名

1. 腾讯云 **SSL 证书 → 我的证书**：申请或导入覆盖 `cn.therewego.world` 的可信证书，
   按证书后台提示完成 DNS 验证。签发后记录 Certificate ID。
2. 云开发 **CloudBase → 现有上海环境 → HTTP 访问服务／HTTP Gateway → 自定义域名**：
   添加 `cn.therewego.world`，选择该证书。确认套餐支持绑定、ICP 信息校验通过。
3. 在该域名下添加服务路由：目标为 Run 服务 `trip-planner-cn`，路径 `/`，开启路径透传。
   保留应用自身的登录判断，首页和 `/login`、`/signup` 必须可公开访问。
4. 复制这次域名绑定返回的 **CNAME 目标**。
5. 到 DNSPod 添加 **CNAME → 主机记录 `cn` → 记录值为上一步返回的目标 → 默认线路**。
   不要用旧 Run 地址猜测 CNAME。等待域名绑定和 HTTPS 状态正常。
6. CloudBase 环境 **环境设置 → 安全来源／安全域名**：确认已有 `cn.therewego.world`，
   保留旧域名。这一项已自动添加，无需重复。
7. 高德 **控制台 → 应用管理 → 对应 Web JS Key**：在域名限制中加入
   `cn.therewego.world`，保留旧 Run 域名。保留现有 JS 安全码和独立服务端 Key。
8. CN Run 的站点配置及 GitHub 当前部署 environment 的 Variable
   `NEXT_PUBLIC_SITE_URL` 改为 `https://cn.therewego.world`，重新构建并部署通过验证的 SHA。
   当前 Deploy CN 使用的 GitHub environment 是 `cloudbase-cn-dev`；未来迁移后以新部署配置为准。
9. 验收首页、手机登录页面、地图／路线、私有图片、公开分享及健康检查。
   实际收取登录短信需使用你控制的手机号。

[CloudBase 域名绑定说明](https://docs.cloudbase.net/run/deploy/networking/custom-domains)。

## 第 8 步：切换两站页脚的区域链接

1. Global 新域名正常后，在 CN Run 服务器运行环境设置
   `GLOBAL_SITE_URL=https://therewego.world`，按平台要求更新服务。
2. CN 新域名正常后，在 Vercel Production 设置
   `CN_SITE_URL=https://cn.therewego.world`，重新部署。
3. 这两个变量是服务器端配置，不加 `NEXT_PUBLIC_` 前缀。
   尚未设置时，页脚继续使用当前可工作的 Vercel／Run 默认地址。
4. 两站各点击一次区域切换链接，确认进入对应站点。

## 第 9 步：完成公安联网备案

1. 进入 [公安联网备案平台](https://beian.mps.gov.cn/)，使用你收到的联网数据码
   导入主体和网站资料。数据码只填在官方备案平台，不放到网站或代码。
2. 核对网站名称 `ThereWeGo行至`、ICP备案信息、域名、负责人和平台要求的接入信息，提交审核。
   网站备案号使用你提供的完整 `沪ICP备2026049500号-1`。
   可在腾讯云 **ICP 备案 → 我的备案 → 网站信息** 中点击网站备案号核对；不要与主体备案号混用。
3. 数据码有效期为 30 天；网站联网备案也有开通后 30 日内办理的要求，尽快完成。
4. 审核通过后，从官方平台下载备案图标和展示代码，把正式 `沪公网安备…号`、图标、
   官方查询链接补到两站的共同首页页脚。当前联网数据码不是这个正式号码。

[腾讯云数据码操作说明](https://cloud.tencent.com/document/product/243/120137)；
[腾讯云公安备案说明](https://cloud.tencent.com/document/product/243/19616)。

本次域名、标题和备案展示改动本身不需要数据库迁移。
