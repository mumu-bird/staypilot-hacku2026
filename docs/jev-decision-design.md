# Jev 在酒店选择流程中的使用设计

2026-10-04 核验。用户所指模型为 TypeSafe 的 Jev，官方于2026-09-15发布。本文是接入设计；目前没有 TypeSafe 凭证，没有实际调用 Jev，不把现有 Step Plan 模型输出当作 Jev 结果。

官方来源：[发布说明](https://typesafe.ai/blog/introducing-system-one-models-and-jev)、[API文档](https://api.typesafe.ai/redoc)、[OpenAPI](https://api.typesafe.ai/openapi.json)。官方提供 `GET https://api.typesafe.ai/v1/models` 与 `POST https://api.typesafe.ai/v1/systemone`，使用独立 Bearer API Key。FlyAI、RollingGo 和 Step Plan 凭证均不能复用。申请账号从 [TypeSafe 控制台](https://console.typesafe.ai/login)开始；模型权限以该账号返回的模型清单为准。未代用户注册、接受条款或购买额度。

## 模块分工

- 现有语言模型：理解自然语言需求、提取有原文依据的评论问题、整理说明。
- 固定规则：校验授权、硬底线、降级次序、评论比例及权重、预算、取消窗口、资金和幂等。不交给 Jev 改写；缺失事实不视作满足。
- Jev：辅助安排候选核验顺序，例如优先补房型与税费、评论证据或通勤；在相同规则条件下提出候选核验建议。它的选项范围由应用提供，不允许输出任意交易指令。
- 网页记录：保存输入事实摘要、观察时间、授权版本、选项、概率、最终执行的规则与动作。用户看到的是可核验依据，不是模型内部隐藏推理。

不能因模型有置信度就认为选择正确。上线前需用带标签的酒店案例评估候选选择、弃权、置信度与规则一致性；阈值不在缺少实测时伪装成已校准。即使模型选择了一个酒店，后端仍按现有“档位 → 评论风险 → 价格 → 通勤”规则执行，不能改变已授权排序。真实交易资料不完整时仍阻断。

## 第一阶段问题

优先做“下一步应核验什么”的有限选项，而非让模型自由决定付款。输入只包含已观察事实、缺口和候选摘要，不包含密钥、入住人的身份资料、未来价格或未经核验的点评推断。

```json
{
  "model": "jev-latest",
  "state": {
    "hotel": "已观察的候选",
    "roomRateObserved": true,
    "taxInclusiveTotalVerified": false,
    "reviewEvidenceVerified": false,
    "commuteVerified": false,
    "transactionEnabled": false
  },
  "questions": {
    "next_evidence_action": {
      "type": "choice",
      "instructions": "选择最有助于判断候选是否满足已授权要求的下一项只读核验。不能改变预算或执行交易。",
      "criteria": {
        "verify_room_and_fees": "房型、住宿含税总价或取消条款缺失，需要商户报价核验",
        "verify_reviews": "报价足够核验后，仍缺与用户底线有关的评论原文",
        "verify_commute": "房型和评论已核验，仍缺目的地通勤证据",
        "defer_missing_source": "所需事实没有获准的数据来源，应保持信息不足"
      }
    }
  }
}
```

请求格式以官方 OpenAPI 为依据：`state + model + questions`；Choice 回答包含 `choice`、`confidence` 和各选项 `probabilities`。应用必须验证选项属于本次提供的集合、概率范围和总和，再决定是否采用；超时、鉴权失败、格式错误、选项越界或不确定时，回到既有规则核验，不能据此放宽权限。

用户下一步需要提供的是已开通模型调用的 TypeSafe API Key。拿到后先核验模型清单，再用公开测试酒店事实做少量请求和规则对照；接入尚未完成前，页面不展示虚构的 Jev 结果。
