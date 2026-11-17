# MCP 地点与地图

用户的 Agent 不需要 Google Maps 数据库权限或 Google API Key。Trip Planner 复用服务端已有 Places API；OAuth 授权中新增可选的 `places:read`。Google Places 的计费、API 启用及 Key 限制由部署方管理，模型 Key 与此无关。

Global 使用 Google Places，CN 使用已有 AMap 服务。不能用一个提供商的 ID 向另一个提供商查询。返回与持久化坐标统一为 WGS84；AMap 的 GCJ02 由现有 provider 转换。

## 用户的 Agent 如何带地点

| 已有信息             | 操作                                                                    | 保存结果                                              |
| -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| 名称、城市或地址     | `place_search`，从候选选择，再 `place_resolve`                          | 已解析的地点选择，供收藏及行程使用                    |
| Google/AMap place ID | 当前区域的 `place_resolve(provider_place_id)`                           | 通过本平台服务重新核实，不能直接信任 Agent 给出的坐标 |
| Google Maps 链接     | 可存为 `source_url`；Agent 能提取 ID 时走上面流程，否则用名称和地区搜索 | 不抓取任意 URL，不自动跟随短链接，不凭链接猜坐标      |
| 暂时只有名称         | 正常 `idea_save_many`；地点可缺失                                       | 保留收藏；缺地区或未解析引用标为待补充                |
| 用户明确提供手动坐标 | `location.custom`，必须为 WGS84                                         | 标记 `user_provided`，不会冒充 Google 核实结果        |

第一次启用后，旧连接仍只有原来四个 scope；需要重新在浏览器授权并选中 `places:read`。只有地图读取权限不能保存 Idea 或修改 Trip；写入仍需要相应 scope、Trip 范围和当前协作角色。

## 完整示例

1. `place_search({query:"京都 清水寺",limit:3})` 返回 `search_id`、最多五个候选、提供商及 Maps 链接。名称不明确时请用户选择，不能自动把第一个候选当作正确地点。
2. `place_resolve({search_id,provider_place_id})` 返回 `selection_id`、有效期、完整的临时地点信息及 `attribution`。一次搜索只结束一次详情解析；如要解析另一个候选，重新搜索或直接解析其 ID。
3. `idea_save_many({idempotency_key,ideas:[{name:"清水寺",region:"京都",notes:"用户自己的备注",location:{selection_id}}]})`。收藏保存提供商 ID 和解析状态，不复制提供商的名称、地址、照片、评价或坐标。地点解析不等于攻略内容已核实。
4. 读取 Trip 的 days/items/revision。`itinerary_apply_changes` 添加引用 Idea 的项目，并提供 `fields.location:{selection_id}`；先 `dry_run`，再用返回的 `preview_id`、同一基础 revision 和新幂等 key 提交。
5. 提交通过现有 `save_itinerary_item_v3` / Places 服务写入真实 `place_id`，网页地图和位置字段读取同一份数据。`trip_get(section:"items")` 返回地点引用、坐标及地图链接。只在正式提交后使用新 `place_id`；预演中的临时 ID 不可当作已保存记录。

同一有效选择可用于同一连接的多个收藏/行程写入。已有 Trip 中的地点可用 `fields.location:{place_id}` 引用；其他 Trip 的内部 UUID 不可挪用。带有提供商引用的 Idea 加入另一 Trip 时，需要匹配的新解析选择；过期后再次解析。显式 `fields.location:null` 表示本次行程不带地点，不会清除原始 Idea 的位置。

收藏、行程快照仍各自独立。修改收藏地点不会自动移动已有行程的地图点；修改行程位置也不会改收藏。`idea_update.patch.location` 支持替换或清空位置；网页个人收藏支持查看位置链接和清空已保存位置。原 Trip Ideas 和个人收藏保留两个入口。

稳定地点 ID 优先去重。两个不同的稳定 ID 即使来自同一篇攻略也分别保存；缺少可区分 ID 时仍按规范化来源链接去重。重复项返回原记录，不覆盖用户备注；共享来源/相似名称作为候选返回。

## 授权、有效期和费用

```dotenv
MCP_PLACES_ENABLED=1
MCP_PLACES_PER_MINUTE=5
MCP_PLACES_PER_DAY=100
MCP_PLACES_GLOBAL_PER_DAY=1000
# 继续使用已有服务端 GOOGLE_PLACES_API_KEY（Global）或 AMAP_WEB_SERVICE_KEY（CN）。
# 不要把这些 Key 放入 MCP 配置、工具参数、浏览器表单或文档。
```

默认关闭。先部署四个共享迁移 `20261117110000`、`111000`、`112000`、`113000` 的区域生成版本，再开启。服务端 Key 必须具有对应 Places API 权限和计费配置；现有浏览器地图能打开不能代替服务端 Places 验收。HTTP referrer 限制的浏览器 Key 不能假设可用于服务端。没有有效服务端 Key 时返回 `PLACE_PROVIDER_UNAVAILABLE`，文本收藏仍可使用。

每次搜索和详情各消耗一次逻辑查询配额，在访问提供商之前由数据库原子检查。额度按用户跨连接累计，并有整个平台每日总上限；UTC 00:00 重置日额度。上游网络/5xx 最多三次尝试，单次请求有超时和响应体上限。配额不是 Google 账单的精确金额；部署方还应在提供商控制台设置预算/配额。最大可配置值为每分钟 30、用户每天 1000、平台每天 10000。

搜索十分钟过期，解析选择十五分钟过期，绑定用户、连接和提供商。预览最多十分钟且不超过地点选择有效期；过期、撤销、基础版本改变、Idea 版本改变或地点不匹配均拒绝提交。提供商失败或授权在查询途中被撤销，不产生可使用的选择。浏览器无权调用服务端查询完成接口或伪造提供商结果。

查询临时表只存候选 ID、会话状态和短期坐标，不存搜索词或 Google 描述内容；调用时清理及已有定时清理任务删除过期记录。审计/幂等收据保留选择 ID 或稳定引用，不复制详情响应。工具响应为 private/no-store；返回 `attribution` 和 Maps 链接，AI 客户端应展示提供商归属。网页仍使用现有 Google/AMap 地图及归属展示。

Google 数据不等于可以任意复制的自有地点库。Place ID、临时内容和已选择行程位置分别处理；本扩展复用网页已有 Places 持久化行为，没有新增评论、照片、开放地点镜像或跨提供商内容缓存。部署方仍需按自己的 Google 协议确认已有 Places 存储/刷新及展示规则，不能把本实现视为对所有 Google 内容永久存储的授权：

- [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id)
- [Autocomplete sessions](https://developers.google.com/maps/documentation/places/web-service/session-pricing)

## 验证和回滚

`npm run test:mcp` 使用两个隔离 PostgreSQL 17 容器、完整区域迁移、真实 OAuth/MCP/业务服务，外部地图 HTTP 使用固定响应；覆盖授权、跨连接隔离、地点解析、真实 place 外键、dry-run 回滚、来源独立、过期/撤销及并发配额。它不声称已访问真实 Google。

只运行失败的地图阶段：`MCP_TEST_NAME_PATTERN=Maps npm run test:mcp`。配置真实区域服务端 Places Key 后，可运行 `MCP_PLACES_LIVE=1 MCP_TEST_NAME_PATTERN='Maps real provider' npm run test:mcp`；该检查才实际访问提供商，并仍把业务写入放在销毁后审计的独立数据库中。不要把 Key 写进命令行。真实客户端扩展验收必须另行记录，不能用脚本代替。

关闭 `MCP_PLACES_ENABLED` 可立即停止公开地图查询和隐藏两个工具；不删除收藏或行程位置。保留四个增量迁移及现有代码作为首选回滚方式；如需撤销某个连接，在产品连接页撤销。不要回滚已应用迁移或直接删除共享 Places 数据。
