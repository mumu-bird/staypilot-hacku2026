# 真实酒店平台接入与待申请事项

核验日期：2026-10-04，上海时间。示例行程：杭州西湖附近，2026-11-06 至 11-08。用户授权仅查询、浏览与规则验证，不创建真实订单。

## 用户优先办理的事项

| 优先级 | 平台 | 申请或确认内容 | 需要交付的凭证 | 本项目状态 |
| --- | --- | --- | --- | --- |
| 1 | 飞猪 FlyAI | 向现有平台联系人确认房型库存、含税报价、取消退款、订单查询/创建、评论原文权限；是否有不付款的沙箱订单 | 现有搜索密钥已足够；新增业务权限的文档与凭证另行配置 | 已真实查询 8 家酒店；网页核验 1 家酒店；自动真实交易禁止 |
| 2 | Booking.com | Managed Affiliate Partner、Demand API 与官方 MCP 开通；确认搜索、订单及沙箱范围 | Affiliate ID、Demand API Key | 官方 MCP 发现连接器已写，缺凭证，尚未认证联调 |
| 3 | Expedia | Rapid 合作伙伴审批；开发沙箱及测试预订能力 | API Key、Shared Secret | 已核验官方流程；尚未编写酒店业务适配器 |
| 已接通只读 | RollingGo 酒店 MCP | 已用专属凭证核验；进一步向平台确认订单、取消、退款与沙箱开通方式 | 专属Key已配置，当前只读无需再登录 | 鉴权成功，3工具、5酒店、3房型；清单无交易工具 |
| 备选 | Agoda | Demand 合作账号；根据模式确认是否包含 Book/取消能力 | 平台颁发的对应接入凭证、文档及权限说明 | 尚未接入 |

普通酒店消费者账号登录不等于开发者/合作伙伴业务权限。不要发送密码、验证码或支付信息；新增 API 凭证填写本机 `.env`，不要放进截图、报告或 Git。更新后需要重启服务器，重启会停止当前监控。

Booking.com 已有官方 MCP，不能再按旧对比表中的“暂无官方 MCP”判断。工具名称和能力须依据账号返回的 `tools/list`，不能假定有下单权限。[官方 MCP 接入指南](https://developers.booking.com/mcp-server/docs/implementation-guide)、[Demand 前置条件](https://developers.booking.com/demand/docs/getting-started/prerequisites)。

Expedia Rapid 需要先通过合作审批；测试环境 `https://test.ean.com/` 的测试预订不会真实占房或扣款。生产开通还涉及审核，不把沙箱凭证当成生产交易授权。[官方接入流程](https://developers.expediagroup.com/rapid/setup)。

Agoda 的接口范围取决于合作模式：仅搜索的合作模式不能完成 Book；需要订单及取消时应在申请阶段明确业务模式。[官方入门文档](https://developer.agoda.com/demand/docs/getting-started)。

Amadeus 官网当前公告自助门户已于 7 月 17 日停用，现为 Enterprise 门户，因此不推荐按旧的 Self-Service 教程注册。该结论在 Chrome 实际页面核验；搜索引擎仍可能返回旧教程。[官方门户](https://developers.amadeus.com/)、[企业合作联系入口](https://amadeus.com/en/contact)。

## 可交给平台的申请说明草稿

我们正在开发酒店选择 Agent，先以固定目的地和日期开展只读测试：搜索酒店、比较绑定人数/房型/餐食的含税价格、核验取消条款和评论证据。后续希望在不会产生真实支付的沙箱中验证预订、订单查询、取消、退款及幂等重试。

请确认：账号可开通哪些接口；是否支持沙箱和测试订单；报价有效期与库存复核机制；免费取消截止的时区与退款到账流程；评论原文与日期的许可；调用额度和费用；正式交易权限的申请及审核要求。

这是本地申请草稿，尚未发送或提交任何合作申请。

## 已实现的统一工具层

运行 `npm run mcp` 启动本机 stdio MCP；运行 `npm run test:mcp` 做实际 FlyAI 查询与协议冒烟测试。后者会调用真实搜索接口，应配置现有 FlyAI 密钥。

- `search_hotels`：默认FlyAI；`provider: "rollinggo"`调用RollingGo搜索并保存观察。
- `get_hotel_details`：飞猪返回汉庭黄龙文三路历史证据；RollingGo带日期、人数及整数酒店ID查询真实房型，缺失评论不生成。
- `get_live_price`：飞猪重查搜索价；RollingGo重查房型均价和取消政策。税费缺失时均不能作为成交报价。
- `book_hotel`：当前实际返回阻断，不创建订单。不是可用的真实预订接口。

Booking 官方连接器只发现工具及其 schema，不转发交易；无合作凭证时明确失败，不用模拟结果冒充成功。

可供支持 stdio 的 MCP 客户端配置，未自动修改 Codex 或其他客户端设置：

```json
{
  "mcpServers": {
    "staypilot-hotels": {
      "command": "/usr/local/bin/node",
      "args": [
        "--env-file-if-exists=/Users/pomelo/Desktop/hacku_副本2/hotel-agent/.env",
        "--experimental-strip-types",
        "/Users/pomelo/Desktop/hacku_副本2/hotel-agent/server/real-mcp.ts"
      ],
      "cwd": "/Users/pomelo/Desktop/hacku_副本2/hotel-agent"
    }
  }
}
```

需在项目目录运行，因为 CLI、数据库路径以工作目录为基准；不同客户端的工作目录配置字段可能不同。凭证只从本机文件读取。

## 真实监控与边界

本机 [飞猪验证页](http://localhost:4173/live/fliggy) 提供每 30 真实分钟查询、截止停止、SQLite 历史记录、评论容忍度演示及实际交易阻断。2026-10-04 02:22 启用了示例查询监控，截止为同日 08:21（上海时间）；04:01已保存5轮观察。服务器升级后通过页面重新启用，历史记录保留。

后台服务和电脑必须运行，电脑休眠会暂停执行；不保证休眠期间准点查询。重启不自动恢复监控，须重新启用。进行中的查询在停止后可以完成，但不会继续安排新查询。

未来要启用真实成交，还需要用户明确实际住宿条件、总预算、入住信息、降级底线及不可取消授权，并取得商户成交、取消、退款接口。当前测试钱包与真实支付完全独立。

## 本次验证结果

生产构建通过，32 项单元测试、9项仿真网页验收及6项截止边界核验通过；统一 MCP 实际初始化、发现 4 个工具、返回 8 家真实酒店、读取 10 条历史评论证据、阻止下单并拒绝未知酒店证据。网页已实际启用监控并显示 8 家新查询结果；点击交易边界验证后显示服务端阻断理由。未创建真实订单或付款；公开交付只包含代码及脱敏说明，不包含密钥、本机数据库或原始接口响应。

参考PDF对应的 [RollingGo 官方仓库](https://github.com/RollingGo-AI/rollinggo-hotel-mcp)指向 https://mcp.rollinggo.cn/mcp。此前匿名探测401，现已用用户提供的专属Key鉴权成功，实际发现searchHotels、getHotelDetail、getHotelSearchTags，并完成5酒店、3房型查询。清单没有交易工具；只读不需额外消费者登录，真实成交仍需平台能力与用户购买授权。未安装教程脚本，未代用户申请账号。详见 [实测报告](rollinggo-real-verification.md)，飞猪仍为主数据源。

用户提出的Jev已核验为TypeSafe决策模型，需要另行申请TypeSafe账号及模型API Key，现有服务Key不能复用。尚未调用，分工及接入方式见 [设计说明](jev-decision-design.md)。
