# 第三方来源与演示披露

应用代码由参赛项目编写。开源依赖使用 React、Vite、TypeScript、Playwright 和 Node.js；版本固定于 package-lock.json。SQLite 使用 Node.js 内置模块。可编辑演示文稿使用 Artifact Tool 制作。

客房氛围照片采用 Unsplash License，不对应虚构酒店的真实房间：

- hotel-room.jpg：[Kin Shing Lai](https://unsplash.com/photos/a-bed-in-a-hotel-room-GOzvLXx4E-E)
- hotel-modern.jpg：[ikhbale](https://unsplash.com/photos/a-hotel-room-with-a-large-bed-and-a-flat-screen-tv-xMbzmWROWxE)
- hotel-warm.jpg：[Jenevy Vergara](https://unsplash.com/photos/a-hotel-room-with-a-tv-and-a-bed-8hGJaAJyzIg)
- [Unsplash License](https://unsplash.com/license)

可选模型接口依据 [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat) 与 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)。模型服务未配置时使用公开标识的规则驱动流程，不声称模型已在线运行。

三平台酒店、地址、路程、评论、价格、取消条款及资金由仿真商户生成；实际运行的订单与规则记录发生在测试系统。时间戳分别记录仿真时间和实际执行时间。独立飞猪页显示官方搜索结果及带观察日期的网页证据，未连接地图、真实酒店订单系统或真实支付网络。

## 真实接入与设计依据补充

官方 FlyAI CLI（@fly-ai/flyai-cli）用于真实只读搜索，https://github.com/alibaba-flyai/flyai-skill 。MCP SDK（@modelcontextprotocol/sdk）用于本机工具服务与Booking工具发现。RollingGo官方仓库用于文档研究和匿名连通性探测，未安装其教程脚本或复制实现。用户提供的酒店监控PDF用于理解baseline/状态记忆和阈值提醒；未复制通知流程或宣称其价格为本项目实测。官方比赛资料只作本地依据，不打包进公开源码。
