# Jev 酒店证据核验模块：设计与实测

2026-10-04 已完成 TypeSafe 技能安装、鉴权及一次真实模型调用。技能使用用户指定的唯一安装方式：

```sh
npx --yes skills add typesafe-ai/skills --skill typesafe-ai --agent codex --global --yes
```

安装至本机 `/Users/pomelo/.agents/skills/typesafe-ai/SKILL.md`；本轮已读取并应用，后续 Codex 会话可发现。文件 SHA256 为 `71ea90d7906c6554c4f4c460ef7361b2d26f59116ccdae986dc6d997b9389f52`。未使用 Claude 插件安装方式。

按技能先读取[文档索引](https://docs.typesafe.ai/llms.txt)、[API](https://docs.typesafe.ai/api)、[Choice](https://docs.typesafe.ai/primitives/choice)、[状态输入](https://docs.typesafe.ai/concepts/state)、[置信度](https://docs.typesafe.ai/confidence)和[函数选择示例](https://docs.typesafe.ai/cookbooks/function_calling)。使用服务端 Bearer 鉴权；`GET /v1/models` 实测返回 `jev-latest`、`jev-preview`，判断使用 `POST /v1/systemone`。没有把其他模型输出当作 Jev。

## 项目中的实际分工

- 语言模型：理解需求，提取有原文依据的评论问题。
- 固定规则：执行授权、底线、降级次序、风险计算、预算、余额、取消及幂等校验。
- Jev：在应用提供的有限选项里判断先核验哪家酒店、当前酒店先补查什么证据。没有接管购买或取消。

打开 [RollingGo 验证页](http://localhost:4173/live/rollinggo)，先取得酒店观察，再点击“让Jev安排核验优先级”。一次请求包含两个独立 Choice 问题：

1. `candidate_to_inspect`：从已观察候选及“暂不选择”中选择核验优先对象。
2. `next_evidence_action`：针对明确指定的当前酒店，选择房型、评论、通勤或缺失来源。它不使用第一题答案；两题可以指向不同酒店。

输入使用命名 JSON 字段、原始酒店事实、时间、缺口和用户核验关注点；不含密钥、入住人身份或未来价格。英文问题保留原始中文名称和关注点，尚未建立酒店领域或中文输入的准确率评估。页面显示输入、选项、概率及执行状态，不是模型内部推理；模型不生成解释文字。

## 实际调用结果

2026-10-04 12:20:26 香港时间，`jev-latest` 返回实际模型 `jev-1.13.0`，耗时 669ms，输入 5058、输出 158 tokens。使用杭州西湖附近、2026-11-06至11-08、2成人1间房的五家真实历史观察：搜索观察于11:16，圆正·西溪宾馆房型观察于11:35；没有把旧价格当成新报价。

关注点为可取消、有窗、浅眠及卫生隔音评论证据。结果优先补查浙江大学圆正·西溪宾馆（选项概率1.0、置信度1.0）；针对该酒店下一项为补查个人底线相关评论（选项概率约0.96、置信度约0.95）。当前记录未提供评论，不表示该酒店卫生或隔音已经通过。完整脱敏输入、问题与响应见 [实测JSON](jev-verification.json)，页面见 [截图](screenshots/jev-decision.png)。

这是一次连通与展示验证，不能据此声称选择准确率、概率校准或收益提升。置信度和概率不等于正确率，也不是购买授权。本次没有执行核验动作、创建订单或支付。

## 代码保护与验证

`server/typesafe.ts` 在固定官方域名调用服务，校验回答类型、完整选项集合、有限概率范围、总和与最大概率选项。输入取自服务端本会话观察，客户端不能提交替代酒店事实或授权。每会话串行；结果绑定观察哈希，新增观察或修改关注点后不继续采用旧判断。历史存入 SQLite，网页可刷新查看。

单次HTTP超时20秒，仅429/529最多再试一次；错误正文与密钥不公开。未配置、服务失败或回答无效时没有新建议，原有规则与真实交易阻断保留。没有用未经实测的置信度阈值自动执行操作；房型核验按钮需手动点击。

50项单元测试全部通过，生产构建通过。新增测试覆盖缺少事实、非法选项、无效概率、证据版本变化、建议不修改源状态、错误脱敏及有限重试；网页已完成一次真实调用并显示结果。密钥只存被Git忽略的本机 `.env`，前端和公开报告不包含凭证。

服务端配置：

```dotenv
TYPESAFE_API_KEY=你的独立服务端密钥
TYPESAFE_MODEL=jev-latest
```

模型核验能力已可用，无需额外消费者登录。真实预订仍缺平台成交、取消与退款接口及完整购买授权，相关申请见 [平台接入清单](provider-onboarding.md)。
