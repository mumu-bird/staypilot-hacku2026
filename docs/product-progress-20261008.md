# 真实使用迭代记录：2026-10-08

目标仍为可真实使用的酒店选择及预订产品，本轮未达到完整产品验收。

本地服务：http://localhost:4173/live/workflow?lang=en 。新增同一报价ID的定向核验、会话隔离历史查询、SQLite复核记录，以及监控页面手动复核操作。复核不替换原房型，条款变化不计算节省，失败不推断售罄，旧价不变成当前可成交依据。

真实请求使用北京雍和宫、2026-10-09至10-10、2成人1房、预算上限600元。为取舍验证设置理想花费500元，硬上限未增加，全部查询只读。

2026-10-08 15:05:19（上海时间）完成飞猪/RollingGo合并查询：12家候选，27条房型记录。地图或路线服务部分未完成，缺失证据没有当成0分钟。取舍模块返回needs_evidence、scope none、model null；本次未声称实际取得Jev推荐。

骏怡精选酒店（北京西站北广场世纪坛店）同一报价两次真实复核分别于15:06:08和15:06:08完成，独立平台观察时间不同，结果均unchanged、估价差额0。第二次使用上一次观察作基准。最终税费与库存仍未验证。原始返回保存于cases/live-product-verification-20261008.json和cases/live-quote-rechecks-20261008.json。

验证：76项测试通过，生产构建通过。测试新增价格与条款判断、报价消失、接口失败、跨会话拒绝；Jev取舍测试覆盖预算边界、硬底线和信息不足。当前环境没有可用的交互浏览器工具，本轮页面已构建但尚未做人工界面验收。

下一步：修复真实地图/路线缺口、完成自动补查循环、同证据偏好重评与选择确认；补齐跨平台同房型证据和含税报价。真实订单、支付、取消、退款仍未接通，需正式平台交易能力与用户购买授权。所有更改本地保存，没有修改GitHub。

## 路线及实际Jev复核（15:10）

地图请求增加跨会话请求节奏控制，避免并行酒店核验集中发起请求。原失败原因没有完整错误码记录，因此不声称所有失败都由限流导致；新增诊断保留安全的服务错误信息。官方错误码及限流说明：https://developer.amap.com/api/web-service/tools/info 。

调整后真实查询取得8家酒店路线，新侨饭店地铁直达34分钟；当前取消过滤房型查询没有取得该酒店可用房型，未编造可订报价。房型核验改为优先已取得准确路线的候选，并增加排序回归测试。

15:10:54完成下一轮真实检索，自动调用Jev模型jev-1.13.0。结果scope confirmation_required、choice need_evidence、confidence 0.62；未选定酒店，下一步建议commute。原预算上限600元和通勤权限未扩大。模型依据类别budget仅为后续核验建议的类别，不表示已有可成交推荐。原始结果：cases/live-tradeoffs-verification-20261008.json 。

77项测试通过，生产构建通过。仍需补齐自动执行补查、偏好重评、跨平台同报价证据与真实交易能力。当前真实运行不足以证明产品完成。

## 自动补查与偏好重评（15:15）

新增补查执行循环：从Jev返回的服务端方案ID定位真实候选，房型和通勤使用既有只读工具执行，最多3次。相同酒店相同动作不会重复消耗查询；无评论/最终费用工具时转为人工核验。每次补查后重新计算规则、证据哈希与Jev建议；来源本身的观察时间保留，包括地图缓存的时间。

15:15:50完成真实验收，模型jev-1.13.0提出commute，系统执行地图工具后再次评估；仍提出同一任务时停止重复并交接。结果仍needs_evidence，没有自动扩大预算或通勤上限。完整日志：cases/live-inspection-verification-20261008.json。

随后对同一组实际返回的证据修改个人偏好，再次实际调用jev-1.13.0。明确kind reevaluation，parentRunId引用上一轮；原证据时间07:15:47.780Z保持不变，不伪称重新查询商户。结果仍needs_evidence；没有预设改变偏好必然改变结论。日志：cases/live-preference-reevaluation-20261008.json。

重评接口隔离会话、核对证据版本，超过15分钟的实时证据拒绝直接重评，需重新查询。历史回放仍明确历史。购买权限没有改变。新增补查上限、重复、失败、人工交接、偏好重评版本及时间测试；82项测试及构建通过。页面尚缺交互浏览器验收。

## 方案选择与版本保护

新增“选择此方案继续核验”操作，保存到会话SQLite，绑定运行ID、证据哈希和偏好版本。仅接受最近15分钟、已知条件在范围内的方案，硬底线、通勤未知、价格未知与待重新确认条件不能绕过。最新报价复核异常或变化时拒绝旧方案选择。重复点击幂等，选择仅用于进一步核验，没有购买权限。旧选择仍保留历史记录但标为过期，重评或新检索后不自动复用。

实际对刚才真实返回的requires_confirmation方案调用选择接口，HTTP 400拒绝，理由为需要调整并重新确认偏好或补齐证据；没有订单。证据：cases/live-selection-block-verification-20261008.json。

83项测试、生产构建通过。另通过官方RollingGo MCP实际取得只读工具输入结构，存于cases/rollinggo-readonly-tool-schemas-20261008.json。已确认其搜索支持POI距离、明确标签和每晚价格筛选，下一步应将这些参数用于提升目的地附近候选质量，而不是靠宽泛查询返回后再排除远距离酒店。距离是直线距离，仍不能替代实际路线。

## 地点筛选可靠性（15:26）

新增用户可编辑的初筛半径（500至50000米），通过已核实的RollingGo filterOptions.distanceInMeter传递；明确标签参数为空，不由模型自动增加星级、品牌或预算限制。初筛半径不是通勤承诺，原地铁上限仍由本地规则判断。

实际按雍和宫2公里半径调用后，平台仍返回范围外候选。因此没有宣称距离过滤生效，也没有把这些结果包装成目的地附近酒店。独立调用高德地点服务并匹配酒店名称/门牌：新侨饭店约5065米、骏怡精选西站店9839米、秋果前门大栅栏店6528米。三个结果均超出请求半径。证据保存于cases/rollinggo-nearby-search-20261008.json及cases/nearby-distance-validation-20261008.json。

工作流新增本地直线距离证据与平台距离筛选异常记录，页面标注“超出初筛半径，仅按通勤权限考虑”。未知坐标不生成距离；直线距离不推断通勤时间。范围外候选仅作为已有降级权限下的备选，不能因此扩大通勤上限。仍需改善附近候选召回与跨平台证据，当前结果不证明真实酒店市场无解。

85项测试及构建通过。新增非法半径拒绝、远端参数传递和本地距离计算测试。服务已更新运行，没有修改GitHub。

## 飞猪附近候选召回修复（15:35）

官方CLI帮助确认支持distance_asc和key-words。实际仅poi-name或距离排序仍返回远处候选，补上key-words=雍和宫后，实际返回五道营、北新桥及雍和宫门店。酒店类型参数单独测试没有改变返回，不能声称类型已被可靠过滤；青年旅舍等候选仍须核验具体房型。

工作流保留原高评分搜索，再顺序执行带目的地关键词的距离排序补查，保留最多6家补查候选与其他来源候选，总量仍最多12家。去重后采用最新平台观察时间与展示价；距离排序不被当作真实距离证据，仍逐家匹配地图位置。

15:35:25的真实运行返回并独立核验：
- 有戏·静默酒店（北京雍和宫店）：直线365米、步行9分钟、平台展示价233元。
- 北京秦府四合院（雍和宫南锣鼓巷店）：直线314米、步行11分钟、平台展示价553元。
- 时光漫步酒店（北京雍和宫店）：直线617米、步行12分钟、平台展示价289元。

以上展示价不是确认含税、符合入住人数的具体房型报价。没有据此确认取消或有窗，也没有下单。尚无具体房型与评论证据，tradeoffs仍needs_evidence。

原始证据：cases/flyai-keyword-diagnostic-20261008.json、cases/live-keyword-nearby-workflow-20261008.json。增加候选保留与最新价格观察测试；86项测试及构建通过。产品接下来应优先补齐这几家实际步行候选的房型和评论，而不是持续优化远处不合适的报价。未修改GitHub。

## 附近酒店房型与商户交接（15:47）

新增RollingGo按名称查详情：仅接受完整酒店名称匹配（允许括号、间隔点等标点差异），再按该酒店名称搜索并核对平台ID及地址。不同分店拒绝关联。地址仅去除明确标注的附近景点说明，保留街道、门牌与单元差异；名称、地址或已有ID冲突保持未知。

实际查询并验证有戏·静默（1357097，北新三巷11号）和时光漫步（41962，安定门内大街方家胡同46号创意园），形成不同平台的独立候选。复用已核验的同酒店路线时保留地图原观察时间。飞猪仍无同房型详情，所以跨平台仅确认酒店身份，未计算价差或最低价。

15:42:23工作流实际得到时光漫步30条房型、其中14条解析出免费取消窗口；代表房型370元。有戏·静默3条房型，没有解析出符合要求的免费取消窗口。不可免费取消不自动等同明确不可退款，缺少完整政策时保留未知。

修复了未知评论/窗型被误标为ideal_available的问题。仅未知条件之外都已核验的方案才可称理想条件匹配。用同一组真实证据重新调用Jev，实际jev-1.13.0、scope authorized、返回need_evidence，不强制唯一首选。证据：cases/live-nearby-room-jev-verification-20261008.json。

15:47:41将时光漫步大床房370元方案通过真实本地选择接口保存为inspection_only。此次选择是用于演示继续核验的人工/程序操作，不是Jev已确认符合全部条件。外窗、日期绑定评论样本和最终税费仍缺；购买未发生。证据：cases/live-nearby-selection-verification-20261008.json。

预订步骤新增商户交接卡，展示所选酒店、具体房型、日期、人数和待核验项，可由用户打开真实商户链接完成最后核验并自行决定购买。本站仍不调用真实购买接口，不把交接当成成交。页面交互尚需浏览器验收。

89项测试和生产构建通过。原始查询：cases/nearby-room-lookup-20261008.json、cases/nearby-identity-verification-20261008.json、cases/live-nearby-rooms-workflow-20261008.json。服务已更新，无GitHub修改。

## 日常使用与浏览器验收

新增本浏览器行程草稿保存：城市、目的地、日期、人数、初筛半径及偏好可恢复；不保存查询确认状态、交易授权或凭证。恢复后需再次确认只读查询。损坏数据与额外权限字段拒绝恢复；非法编辑不会覆盖上一份有效草稿。保存的过期日期保持可见并提醒更新，不偷偷改成新行程。默认日期按上海时间生成明晚及后一晚，支持跨年/闰年边界。

共享偏好校验用于后端与草稿恢复。页面所有步骤显示操作错误，服务连接中断时提示旧结果不代表当前可订。真实流程按需加载，主包约443KB、流程包119KB，避免主页直接加载完整校验模块。

93项单元测试通过；生产构建通过。现有Chrome浏览器验收扩展并执行，10项检查通过：包括真实流程页面恢复城市、刷新后查询确认复位、中英切换保留输入、手机无横向溢出。页面截图：screenshots/live-draft-restoration-mobile.png。

浏览器检查中的下单/退款仍属于明确标注的虚构酒店与测试资金；真实流程页面检查没有提交外部查询或真实订单，不能替代真实交易验收。证据记录：browser-verification.json。服务保持运行，无GitHub修改。

## 已选报价持续监控（16:01）

监控启动时核对当前行程/偏好与已选方案的证据及偏好绑定。存在对应已选报价时立即定向复核同一平台酒店ID、日期、人数和报价ID，随后每30分钟再次复核；没有对应选择时保留全检索模式。只读监控可重新检查较旧的已选报价，但不会因此把旧推荐或购买条件更新成已确认。

价格变化显示实际展示估价差额；条款变化、原报价未找到则停止该报价监控，并提示重新核验。请求失败保持失败，不推定售罄。目标酒店、房型及入住日期锁定并展示；编辑表单不修改已启动监控。后台仍不购买或换订，重启后不自动恢复监控。

16:01真实验收跟踪时光漫步41962的原报价kRSZNRtc7k7-7oLiI1S692J。此次返回未找到原报价ID，status not_found、delta null；系统停止报价监控，没有把其他房型视作替代或制造价格变化。旧运行记录保持不变，选择不再视为可继续使用。未宣称酒店售罄；可能需要重新取得当前报价。

证据：cases/live-selected-quote-watch-20261008.json。已确认监控结束，未留后台持续调用。94项测试通过、生产构建通过；新增同一报价监控不重新搜索、条款变化停止及选择失效的测试。前轮浏览器验收仍为10项；本轮未重做页面浏览器验收。服务运行，GitHub未修改。

## 报价失效恢复与历史记录（16:10）

新增只刷新这家酒店的定向恢复接口，绑定当前会话最新记录与证据版本，仅接受既有RollingGo酒店ID。重新获取具体房型并重新核验位置与路线，生成candidate_refresh新记录；原记录不覆盖，预算/偏好不扩大，其他酒店不被包装成新观察。路线查询失败时本轮路线保持未知，不用旧路线证明满足条件。酒店名称冲突拒绝采用。

16:10:11实际刷新时光漫步，得到20条当前房型、步行12分钟，重新调用jev-1.13.0，仍needs_evidence。未将新报价与已消失原报价计算节省，也未购买。证据：cases/live-targeted-hotel-refresh-20261008.json。

页面增加当前会话最近查询记录：展示来源、日期、预算、当时估价和缺口，可分别导出原记录。浏览历史不改变当前行程或权限。单酒店新记录仅显示此次核验的酒店，其他酒店可在旧记录查看。

95项测试通过、生产构建通过；11项现有Chrome集成检查通过。本轮浏览器实际读取该会话保存的真实API记录，确认定向刷新与旧记录独立保留；没有触发新的外部查询或真实购买。截图：screenshots/live-refresh-history-mobile.png。仿真下单/退款检查仍使用虚构酒店和测试资金。服务保持运行，无GitHub修改。

## 交易权限核查与偏好范围界面

16:15实际查询RollingGo工具清单，当前凭证仅返回searchHotels、getHotelDetail、getHotelSearchTags三个只读工具，没有可见下单、取消或退款工具。证据：cases/rollinggo-capability-audit-20261008.json。交易申请材料已保存为platform-transaction-access-request-20261008.md，未向任何平台发送。

修正飞猪酒店类型参数为官方仓库列出的中文“酒店”。16:16完成实际查询，返回9条候选，保留原始数据于cases/flyai-chinese-hotel-filter-20261008.json；不据此声称所有返回项均已核验类型或可订。

偏好页面新增理想评分、评分硬底线、理想开业年份、允许降低理想评分/接受更早开业/放宽窗型的明确选项。新增设施维护、服务、空间与安全不可接受项。放宽默认关闭；必须外窗仍为硬约束，不参与交换；缺少开业、评分尺度或评论证据仍进入补查。所有设置使用既有服务端政策字段并参与证据/偏好版本绑定及草稿保存。95项单元测试、生产构建通过。

12项现有Chrome浏览器集成检查通过，新增验证：放宽默认关闭，理想评分和硬评分底线独立填写，安全底线及放宽选项刷新后恢复；查询授权仍需重新确认。此次页面测试未提交真实订单，订单相关检查仍使用仿真资金。生产服务已重启加载最新修改，无GitHub修改。

## 偏好冲突即时检查

共享政策校验新增两类冲突拒绝：理想花费超过预算上限、评分硬底线高于已设理想评分。只有硬评分底线而未设置理想评分仍可使用；旧记录不自动新增放宽权限。页面中英文显示具体原因并禁用确认和重评；不改写用户值。运行、重评及草稿共用校验。

实际向运行中的真实查询入口提交理想4分、硬底线4.8分，HTTP400拒绝，没有调用平台或创建订单。新增回归测试；96项单元测试与生产构建通过。

12项Chrome集成检查通过，包含冲突提示出现和继续按钮禁用，修正后可以保存并恢复。服务保持运行，GitHub未修改。

## 必须设施与完整体验权重

偏好页面新增最多10条必须设施，可独立添加和删除，每条最多80字；空白条目不能确认，服务端统一去除首尾空格并拒绝空值。不自动翻译或模糊匹配酒店设施，未取得对应证据时保持缺口。现有真实来源尚未完整补齐设施证据，新增界面不代表已有验证能力。

新增气味、设施维护、服务、空间与安全的重要度设置，0至5；权重与不可接受项保持独立。评论缺失不计算虚假的低风险。设置随草稿保存并参与偏好版本。新增设施缺证不能称理想匹配、超长清单/空白拒绝测试；98项单元测试和生产构建通过。

12项Chrome集成检查通过，新增实际页面验证：添加空设施显示提示、填写后可保存，刷新后设施和安全权重恢复。此次未发起真实购买。所有改动本地，GitHub未修改。

## 真实设施证据接入（16:33）

发现按酒店名称补查身份和房型时，已返回的酒店设施清单此前未传入工作流。修复：名称/平台ID匹配的搜索清单附带设施与原观察时间，地址再通过既有核验后才传给对应候选；新增amenityEvidence保存来源、酒店ID和观察时间。已有搜索候选同样保留设施证据时间。房型刷新不会把旧设施时间标为新查询时间。页面展示平台列出的设施及来源时间。

16:33实际调用RollingGo getHotelDetail及searchHotels，核对时光漫步41962、安定门内大街方家胡同46号创意园。平台列表包含电梯、停车场、无障碍通道等设施，返回20条房型。原始摘要：cases/live-facility-verification-20261008.json。这只是平台列示，不证明停车费用、开放时间或完整无障碍适配；未创建订单，未宣称所有必须设施已满足。

98项单元测试及生产构建通过；名称查询回归覆盖设施传播和观察时间保留。此轮未重跑浏览器集成，上一轮12项结果不作为此新增设施展示的渲染验收。所有修改本地，无GitHub修改。

## 设施证据有效性保护

必须设施除了精确匹配平台条目，还要求amenityEvidence与候选酒店ID/来源一致、时间有效且在本轮asOf之前15分钟内；旧数据没有来源时间不能用于证明满足要求。过期或不一致产生明确补查缺口，不改写观察时间。设施证据独立加入取舍证据引用，包含原始时间与页面来源；停车场不等同免费停车，无模糊推断。

99项单元测试及生产构建通过，新增回归覆盖错酒店ID、过期设施清单及免费停车误匹配。此轮未发起新外部查询或真实交易；上一轮实时设施查询作为历史记录保留，未伪称当前库存。服务更新，无GitHub修改。

## 监控日期与免费取消截止保护

每轮监控提交前重新验证入住日期和查询条件；失效时停止并显示更新行程提示。要求免费取消的已选报价，取消时间缺失、无效或已经结束时停止报价监控，不继续查询或把它当作合格方案。下一次检查时间为30分钟、用户截止与已知取消截止三者最早值，避免越过窗口再检查。旧记录不覆盖，监控仍不创建订单。

100项单元测试及生产构建通过；定向监控测试明确验证过期取消窗口下商户工具调用次数为0、监控关闭且无下一次任务，以及10分钟内取消截止时按该截止安排检查。此轮为本地规则/时钟边界验收，不声称平台真实订单验收。服务更新，无GitHub修改。

## 真实流程失败提示优化

页面请求失败不再直接显示原始校验JSON或未知上游文本。新增中英文提示映射：证据/偏好版本失效要求刷新，当前会话缺记录要求重新查询，任务占用要求等待或停监控，期限/日期/输入问题提示检查范围，需要新确认的方案提示查看条件变化。未知错误提示连接检查与手动重试；未自动重试，不改变后台交易状态或诊断内容。非JSON响应按请求失败处理。

101项单元测试与生产构建通过。页面浏览器验收另增加模拟HTTP400响应，核验实际英文提示；该测试明确拦截请求，不作为真实平台失败验收。

13项Chrome浏览器集成检查通过。新增失败提示实际渲染通过；此轮无真实订单。页面生产构建由运行服务提供，GitHub未修改。

## Persistent monitor status

Session SQLite now stores monitor mode, target, check count, update time and stop reason. It does not restore an executable monitoring input. On service shutdown or recovery of an active saved monitor, the monitor is marked interrupted, disabled and cleared of its next task. Original target and check count remain visible for manual restart. Stop reasons distinguish manual stop, deadline, quote changes, cancellation expiry and invalid trip; the page displays bilingual labels.

102 unit tests and the production build passed. Recovery tests verify seven previous checks and the original target survive reopening, while enabled=false, nextCheckAt=null, no tool is called, and purchase authority is not restored. A second reopening preserves a manual stop. No new real order was created. The new label has not received separate browser rendering verification. Service updated; GitHub unchanged.

## Fresh integrated case, 16:49–16:50 Shanghai time

Actual FlyAI/RollingGo/Amap queries and Jev comparison completed for the Yonghe Temple example with an explicit elevator requirement, ideal CNY500 and ceiling CNY600. Time Walk Hotel supplied identity-bound elevator evidence, a 12-minute walking route and nine retained room records. Four retained options showed estimated prices CNY352/364/387/395. Model jev-1.13.0 requested more evidence, confidence0.89, authorized scope. One room follow-up ran; repeated inspection was avoided. Missing window, dated reviews, final charges and inventory remain explicit. This is evidence insufficiency, not a demonstrated budget shortfall. No order or payment occurred.

Full report: real-case-acceptance-20261008.md. Raw new request: cases/live-integrated-facility-workflow-20261008.json. Subsequent code includes verified facility labels/time explicitly in option facts; that later addition was not part of this recorded live model call.

102 unit tests and the production build passed after the explicit facility-fact addition. Service restarted with current code. No background monitor was started by the real-case query; GitHub unchanged.

## Window description contradictions and public-page evidence gap

Attempted the actual RollingGo detail URL for hotel41962 with the confirmed dates and occupancy. The web-reading tool could not access it; no reviews or exterior-window evidence were obtained. This is a tool-access limitation, not proof the page or reviews do not exist.

Fixed window classification: negated exterior/floor-to-ceiling descriptions, random or subject-to-availability wording, mixed interior/exterior claims, and conflicts between room names and hasWindow now remain unknown. Chinese and English explicit window descriptions are supported. Unknown fields cannot satisfy a required exterior window. Source observations and historical records are unchanged.

103 unit tests and the production build passed, including negative descriptions, mixed terms and conflicting flags. No real order was created. Changes remain local; GitHub unchanged.

## Nearby hotel review evidence

Located and opened the official Trip.com review page for Nostalgia / Time Walk Hotel, hotel1181544. Page name and Fangjia Hutong46 address match RollingGo41962. The web tool served an indexed historical page, not a live review API. Stored a limited paraphrased capture with original publication dates, source URL, 10-point scale, displayed count and explicit limitations in cases/timewalk-review-evidence-20261008.json. A high-rated visible review mentions weak door/wall insulation while reporting a quiet stay; positive visible samples mention cleanliness and quietness. Issue-bearing reviews are classified independently of overall star rating. No complete negative-review coverage is claimed.

The live workflow now merges this capture only after exact normalized name, address and provider ID match. It preserves capture time and limitations. Partial coverage remains a tradeoff evidence gap even when an issue-bearing sample exists; opening and renovation years remain unknown. No historical price is imported. This addition is verified locally, not yet through a new full live model query.

105 unit tests and production build passed. Matching and mismatched identity bindings, and preservation of partial-review gaps, are covered. No real transaction; changes local only.

## Review-aware policy comparison, 17:03

Completed a new real platform query with bound historical reviews and actual Jev1.13.0. Ordinary noise importance left relevant options available for provisional comparison; explicit unacceptable noise blocked all four retained hotel41962 options using the same evidence. Reevaluation preserved the original source times and parent linkage. Both model conclusions still requested evidence; no unique fully verified recommendation or purchase was claimed.

Raw cases: live-review-aware-workflow-20261008.json and live-review-hard-floor-20261008.json. Page now identifies issue mentions as potentially coming from highly rated reviews and shows sample limitations.106 unit tests and production build passed. No GitHub changes or real transactions.

## Review presentation clarity

The live candidate review section now displays original score/scale and platform total count, labels curated summaries separately from source wording, and shows partial-sample limitations alongside the platform link. Browser verification reads the agent-owned saved real review case without querying new platform data. The first test selector matched an identically named platform record without attached reviews; narrowed the selector to the record carrying its Trip.com source link. Verification is in progress, so no browser pass is asserted yet.

14 Chrome integration checks passed after correcting the selector to the ranked candidate evidence card, rather than the similarly named tradeoff option. The actual saved real API case renders its 9.4/10 scale, displayed count1552, curated-summary label, partial-page limitations and hotel1181544 platform link. Mobile screenshot captured and visually inspected: screenshots/live-review-evidence-mobile.png. This is stored-evidence rendering verification, not a new real query or order. Production build passed; GitHub unchanged.

## English review guidance

The English live page now translates the curated Time Walk review summaries, historical capture statement and explicit issue-exclusion reason. Translation preserves both the insulation concern and the reported quiet stay; it does not turn a partial historical capture into live reviews. Raw stored text, publication dates, scores, bindings and model inputs remain unchanged. Unrecognized source text is not automatically translated or used as authority.

107 unit tests and the production build passed. English browser assertions are being run against the stored real-case page; no new external query or order is submitted by this check.

14 Chrome integration checks passed, including actual English rendering of the review concern, historical-API limitation and noise exclusion. Production service provides the rebuilt page. GitHub unchanged.

## Condition-change suggestions respect every hard exclusion

Found a separate suggestion path that could propose extending commute for a hotel also excluded by another hard condition. Fixed it to omit candidates with any non-commute exclusion. Suggestions still retain price/route evidence and remaining gaps; they never change authorization. Removed the fabricated placeholder hotel entry. With no supported adjustment, the page explicitly asks for more evidence or nearby searches and does not claim the market has no match.

108 unit tests and production build passed. Re-evaluated the stored real hard-floor case locally; evidence preserved in cases/alternative-hard-floor-audit-20261008.json. This was not a fresh platform query. No real order, no GitHub modifications.

## Request input boundaries

Confirmed existing no-store API response caching. JSON request limits now count UTF-8 bytes rather than JavaScript characters, preserve split multibyte input, reject oversized bodies with HTTP413 and malformed JSON with a concise HTTP400 message. Declared oversized bodies are rejected before parsing. Request reception timeout is30seconds, header timeout15seconds, maximum100headers; these apply to inbound requests, not the duration of hotel/model processing after input reception.

110 unit tests and the production build passed. Actual local HTTP checks submitted oversized Chinese input and malformed JSON to the running workflow endpoint; neither invokes platform tools. Evidence: cases/http-input-verification-20261008.json. These checks do not prove public-production security or transaction readiness. Service updated, no real orders or GitHub modifications.

## Consistent candidate and tradeoff screening

Candidate screening now applies the same normalized rating and identity/time-bound required-facility checks as the tradeoff engine. It exposes missing rating evidence, explicit hard-rating exclusions, preferred-rating and opening-year mismatches, facility gaps and review coverage limits before model comparison. Renovation still cannot establish opening year; unconfirmed soft relaxations are not hard exclusions and retain confirmation guidance.

Shared rating normalization rejects empty text, invalid scales and scores outside the stated scale.112 unit tests and production build passed. Deterministic evaluation of the stored real review case with a4.8/5 hard floor excludes hotel41962 consistently in candidate screening and all its retained tradeoff options; original9.4/10 evidence normalizes to4.7. Evidence retained in cases/rating-screen-consistency-20261008.json. This is local reevaluation, not a new live observation or model call. No transactions or GitHub changes.

## Bounded room inspection respects early hard exclusions

Moved identity-bound historical review attachment earlier in the live workflow, before choosing room-inspection targets. The bounded three-room-inspection selector now excludes candidates with known non-commute hard exclusions, preserving its slots for potentially acceptable or evidence-incomplete candidates. Newly discovered exact-name platform matches still receive bound reviews after identity verification. No source timestamps or budget permissions are changed.

113 unit tests and production build passed. Regression verifies that a known unacceptable-noise candidate consumes no room-inspection slot, while a candidate with missing reviews remains eligible for evidence collection. This is local verification, not a new platform request. Service updated; no real transactions or GitHub modifications.

## Portable startup diagnostics

Added npm run doctor to check Node24+, SQLite runtime, required historical case files, frontend build and browser availability, and report server credential presence without values. Current local checks pass; credential presence explicitly does not prove platform connectivity or permissions. README now identifies the real workflow, startup requirements and unresolved transaction scope. Extended ignore rules to cover .env variants while preserving the blank .env.example template, including Docker build context.

Added GET /api/health before session creation. Actual local HTTP check returned200, no-store and no Set-Cookie; it invokes no provider or model and does not claim booking readiness. Evidence: cases/health-verification-20261008.json.113 unit tests and production build passed. Docker/another-machine deployment remains unverified. Service updated; no real orders or GitHub modifications.

## Isolated startup and absent credentials

Started a copied application in a new local directory with fresh data, no .env and provider keys explicitly removed. Reused this machine's installed dependencies, Node and browser; this is not an independent-machine or Docker test. Health, production HTML and historical replay worked. Initially, unconfigured live mode returned source errors and zero candidates without inventing data.

Improved HTTP entry checks: when neither hotel source is configured, live search and live-monitor startup return503 with actionable configuration guidance, rather than processing an empty search. Historical replay remains explicitly historical and available. Actual isolated-server retest confirms503/503/200 respectively. Evidence: cases/isolated-startup-verification-20261008.json and cases/missing-credential-preflight-20261008.json.113 unit tests and production build passed. Docker is not available on this machine; container verification remains outstanding. No actual orders, GitHub changes or copied credentials.

## Repeatable public review capture

Actual server-side HTTPS retrieval of the known official hk.trip.com review page succeeded without login or bypassing access restrictions. Added a structured parser and bounded fetch helper: allowed host/path and provider ID, exact expected name/address, no redirects,15-second request limit,1MB page limit, valid ratings/dates and deduplicated review IDs. It reads JSON page data, never executes page JavaScript. Login/verification pages or identity mismatches fail rather than becoming empty reviews.

The live page's structured metadata differs from the prior web index:9.5/10 and totalCount1434, with15 visible records and recent publication dates. All visible ratings are retained, including high-rated issue mentions. Coverage is explicitly visible_page_only. Opening and renovation metadata are absent and remain unknown. Old review capture is not overwritten. Raw text is kept only in ignored local cache pending bounded analysis; saved case reports contain identity/rating/date metadata, not full copied reviews.

Evidence: public-review-fetch-probe-20261008.json, live-structured-review-metadata-20261008.json, live-public-review-collector-20261008.json.116 unit tests and production build passed. This collector has been actually called, but automatic semantic analysis and integration into the user workflow are not yet implemented; existing workflow still uses the labeled historical capture. No real transaction or GitHub change.

## Actual Jev review classification, 18:08

Implemented server-side typed review-mention analysis and successfully called Jev1.13.0 on the15 samples captured from the official public review page at17:58 Shanghai. Analysis completed at18:08:54 Shanghai. Seven independent Noul questions per sample classified issue mentions without using the overall rating as an exclusion. Request usage:16869 input tokens and2019 output tokens. Output binds source observation time, hotel identity, complete capture hash and individual text hashes; no copied full review text is published in the result.

Actual result: no label reached the initial0.8 issue threshold; three source rows retained uncertain labels. The10/10 review1875711837 had noise probability0.70 and maintenance0.42, so it remains unresolved rather than becoming a clean assessment. Two other rows had uncertain space or maintenance mentions. These probabilities concern source-text interpretation, not issue prevalence, severity or purchase permission. Initial thresholds need calibration; partial visible-page coverage remains a gap. Existing historical review evidence is not overwritten.

119 unit tests and production build passed. Added regression coverage for typed probabilities, uncertainty, high-rating evidence preservation, missing/extra/malformed labels, input sample bounds and service failures. Synthetic model responses test code behavior, not model semantic accuracy. The actual inference is recorded separately in cases/live-review-model-analysis-20261008.json. Automatic attachment of this new analysis into the six-step workflow remains outstanding; no such integration is claimed. No real order or GitHub modification.

## Saved review analysis integrated into live workflow

The live workflow now attaches the actual saved Jev review analysis only to the previously identity-bound Trip review record, requiring the same source URL and Trip provider ID. Malformed analysis is rejected; missing files keep source evidence and a visible error. Historical score, count and curated issue observations retain their original timestamps and are not overwritten by the newer model analysis. New supplementary fields separately retain source observation time, analysis time, model version, evidence hash, visible sample count and uncertain issue IDs/dates.

Candidate screening and room tradeoff construction both surface uncertain mentions as verification gaps. The bilingual candidate evidence panel displays saved-analysis status and separate observation/analysis times. This is integration of a saved actual inference, not a fresh review query on every search or completed end-to-end browser acceptance. Generic multi-hotel review acquisition, semantic calibration and repeated live collection remain outstanding.

120 unit tests and production build passed. Regression reads the actual saved case, rejects wrong source/provider bindings, preserves historical observations and checks uncertainty appears in candidate gaps without enabling purchase. No real orders or GitHub modifications.

## Review result integrity and retained detected mentions

Found an integration omission: supplemental analysis attached uncertain rows but would drop confident model-detected mentions if a future inference contained them. Both classes now survive binding and appear in candidate/tradeoff evidence gaps and bilingual UI. Model-detected mentions require source/room verification; they do not silently replace curated source evidence or grant transaction authority.

Binding now validates all seven probabilities, fixed initial thresholds, exact agreement between probabilities and issue/uncertain labels, unique review IDs, real calendar dates and publication before source observation. Contradictory/malformed records fail without partially changing evidence.121 unit tests and production build passed, including actual saved-case binding and synthetic future positive-mention regression. No new platform/model call or browser acceptance is claimed this turn. Runtime automated fresh review collection, calibration and real transaction permissions remain outstanding. No GitHub modification or real order.

## Browser acceptance of supplemental review analysis

15 existing Chrome integration checks passed after adding a rendering fixture assembled from the saved real hard-floor assessment and the saved actual Jev analysis. The fixture is served only within the browser test; no assessment history, source timestamps or real platform response is rewritten. Assertions confirm English saved-observation wording, Jev1.13.0,15 visible samples, separate source/analysis time labels, uncertain review1875711837 and absence-not-established guidance alongside preserved historical9.4/10 evidence.

Captured and visually inspected mobile screenshot screenshots/live-review-analysis-mobile.png. The visible viewport shows existing source evidence; analysis lies further down the expanded card, verified by browser text assertions. This does not prove a fresh end-to-end query/analysis pipeline or live transaction. Production build passed. No GitHub writes or real orders.

## Fresh public review capture and Jev pipeline, 18:19

Implemented a repeatable source-fetch → registered identity verification → Jev analysis → typed source binding pipeline. Actual request observed the official page at18:19:48 Shanghai and completed Jev1.13.0 analysis at18:19:51.15 visible samples, current metadata9.5/10 and1434 total comments;4 rows remain uncertain, none crossed initial0.8 threshold. This is not evidence of no issues. Source metadata is returned separately; historical curated rating/issues/timestamps remain intact. No full source texts are saved to the public report.

Real workflow now invokes this pipeline when a matched candidate has the verified Trip1181544 binding and TypeSafe is configured, before rule/model option evaluation. Source/model failure retains prior observations and records a visible error. The current source registry covers this one verified hotel; it does not imply general hotel review coverage.123 unit tests and production build passed, including identity conflicts, unsupported sources and failure preservation. Actual standalone pipeline result: cases/live-review-refresh-pipeline-20261008.json. A complete new live workflow browser run with this automatic step is still unverified. No real order or GitHub write.

## Complete fresh workflow execution, 18:22–18:23

Submitted a new real read-only Yonghe Temple workflow request through the running local HTTP service: Oct9–10,2 adults,1 room,600 CNY maximum,500 CNY ideal. Run started18:22:06 and finished18:23:07 Shanghai, approximately61seconds,13 candidates and no workflow-level errors. The automatic registered public review fetch observed its page at18:22:53, Jev1.13.0 analysis completed18:22:57, and4 uncertain rows appear in the persisted candidate analysis. Review fetch/analysis trace entries and original observation times are retained. Evidence: cases/live-fresh-review-workflow-20261008.json. This verifies server workflow execution, not a new browser interaction or completed booking.

Added optional separately labeled page rating/count metadata to future model analysis records and UI, without rewriting old curated rating/count. Old analyses lacking the field remain supported.124 unit tests and production build passed. No real transaction or GitHub writes. General review coverage, final tax-inclusive quote/inventory and transaction permissions remain incomplete.

## Fresh analysis bound to exact source contents, 18:25

Hardened the refresh pipeline to recompute the full capture hash and compare source observation time, sample count, every ordered review ID/date/rating/scale and text hash. A valid-looking analysis for the same hotel/URL from another observation is rejected, rather than attached as current evidence. Historical data remain untouched on rejection.

Actual fresh HTTPS capture and Jev1.13.0 call passed the new checks: observed18:25:25 Shanghai, analyzed18:25:27,15 samples,4 uncertain rows. Evidence: cases/live-review-bound-refresh-20261008.json (no full review text).125 unit tests and production build passed. New regression rejects replayed full hash, wrong observation time, changed text/IDs and missing rows. This is actual pipeline verification, not another complete workflow/browser test or transaction. No GitHub writes or real orders.

## Latest observed rating participates in screening

Fixed the gap between displaying supplementary current page metadata and screening with only the older curated rating. Shared rating normalization now uses the newer valid page observation when available, preserving historical fields. Candidate and tradeoff screening share this selection; option facts and review evidence references identify the observation actually used. Old analyses without rating metadata retain legacy behavior. Fresh pipeline also compares model-reported page rating/count against actual captured metadata.

126 unit tests and production build passed. Local reevaluation of saved real evidence with a4.72/5 floor uses newer9.5/10=4.75 rather than old9.4/10=4.7; candidate and room rules consistently do not reject on that rating floor. This intentionally tests a separating threshold, not a new live request, new user authorization or booking recommendation. Original policy records remain unchanged. Evidence: cases/latest-rating-rule-audit-20261008.json. No real orders or GitHub modifications.

## Second real hotel review source verified, 18:31

Discovered the official Trip374787 review page for Beijing Xinqiao Hotel and retrieved its structured public data over HTTPS. Source name北京新僑飯店 and address崇文門西大街1號 correspond to the previously recorded RollingGo43565北京新侨饭店 at崇文门西大街1号; simplified/traditional forms were explicitly manually checked, not fuzzy automatically joined. Current parsed page metadata9.1/10,10597 total comments and15 visible samples; no full-coverage claim.

Actually called Jev1.13.0 on these15 samples. Two source rows have model-detected mentions: review2127627773 rated9/10 reports noise; review2118798839 rated3.5/10 reports noise/maintenance/service. Two other rows have uncertain maintenance mentions. These are typed source interpretations pending original wording/room-impact verification, not calibrated hotel occurrence probabilities. Result: cases/xinqiao-public-review-analysis-20261008.json. Raw source/capture stay in ignored .cache, public artifact retains IDs/dates/probabilities/hashes and verified identity metadata only.

This extends actual acquisition/analysis evidence to a second hotel but is not yet integrated into the six-step workflow. Existing Xinqiao FlyAI historical reviews are preserved; integrating an additional platform requires explicit multi-source provenance instead of replacing their original sourceURL or laundering newer rating into old evidence. No real order or GitHub modification. No code changes or new test/build claim this turn.

## Additional platform reviews kept separate

Added an optional additionalReviewAnalyses collection to candidates. Saved actual Xinqiao Trip374787 analysis attaches only to the explicitly verified RollingGo43565 name/address/ID, with typed source validation. Its9.1/10 score, timestamps, source URL and model-detected/uncertain rows remain separate from existing FlyAI historical reviews. No cross-platform average or combined issue frequency is computed. Candidate and tradeoff gaps consume both sources, and tradeoff evidence includes the additional observation hash/time/URL.

Bilingual UI has a separate additional-platform review section with saved-observation label, partial-page scope, issues and source link.127 unit tests passed; production build passed after correcting a JSX map closing delimiter. Focused regression additionally verifies nonempty room options, source references, issue IDs and unchanged primary evidence. This is saved-analysis integration; automatic refresh of the second source and browser acceptance of the new section remain outstanding. No new platform/model call, real order or GitHub write this turn.

## Second registered source automatic refresh, 18:37

Expanded registered public review refresh to Time Walk1181544 and Xinqiao374787, retaining exact expected source-side name/address and capture/model hash checks. Xinqiao helper first validates RollingGo43565 name/address/ID, then attaches fresh analysis only after successful source and model verification. Original reviews are never overwritten. Unsupported candidates trigger no source call; failures preserve the candidate unchanged.

Live workflow now makes at most one secondary Xinqiao refresh per run when an exact matched candidate exists and TypeSafe is configured, logs observation time and records failure on that candidate. Other hotels remain unsupported rather than being matched approximately.

Actual Xinqiao helper call succeeded at18:37:39 Shanghai:15 visible samples, Jev1.13.0,2 model-detected rows and2 uncertain rows. Original FlyAI reviews preserved. Evidence: cases/xinqiao-live-bound-refresh-20261008.json.128 unit tests and production build passed. A complete workflow run that includes and refreshes both registered hotels, plus browser acceptance of the additional section, remains unverified. No real order or GitHub write.

## Two-source workflow and browser acceptance, 18:39–18:40

New real read-only workflow started18:39:45 and completed18:40:46 Shanghai,13 candidates, no workflow errors. Time Walk's public page observed18:40:31 and Xinqiao's page18:40:39; both automatic fetch/analysis completion entries appear in trace. Separate primary/additional analyses persisted in the actual candidate results. Jev tradeoff status remains needs_evidence, not a purchase recommendation. Evidence: cases/live-two-review-workflow-20261008.json. No orders or payments.

Expanded existing Chrome suite with an explicitly local rendering fixture from saved real source analyses, asserting additional Trip9.1/10 rating, partial15-sample coverage, detected and uncertain row IDs, separate-platform disclaimer and both original FlyAI/source links. First suite attempt failed in an earlier simulation quote wait while the independent live request/build was running; no specific cause was proven. Rerun after those completed passed16 browser checks. Screenshot screenshots/live-additional-reviews-mobile.png visually inspected, showing the independent source section and issue labels. Production build passed. This distinguishes actual backend fresh-source execution from saved-evidence browser rendering; it is not an autonomous booking acceptance. No GitHub writes.

## Mobile candidate readability

Mobile screenshots showed long platform amenity lists occupying much of a card before review evidence. Moved the complete facilities list into a labeled collapsed details section after reviews, with item count, source timestamp and fees/operating-condition limitation. Candidate price, commute and review sections remain immediately accessible. No facilities or rule inputs were removed or changed.

Production build and16 existing browser integration checks passed. Updated screenshots/live-additional-reviews-mobile.png visually inspected: additional source evidence is visible without the long amenity paragraph above it. Browser tests continue to use explicitly saved real-source rendering fixtures; no new platform query, transaction or GitHub write this turn.

## English evidence guidance completed for recent review features

Added English renderings for map straight-line distance (explicitly not commute time), newer-page rating used in screening, model-detected review mentions, uncertain labels and review refresh failures. Review IDs, dates, numeric scales and absence-not-established wording are preserved. Only recognized application-generated messages translate; unknown vendor text, hotel names and underlying source evidence remain unchanged.

129 unit tests and production build passed, including semantic-preservation assertions for the new dynamic messages. Rebuilt frontend is served by the existing production process. This turn makes no new browser-acceptance claim, external query or transaction. No GitHub write.

## Actionable platform handoff and current-consent guard

The selected-option handoff now explains four concrete platform checks: identical dates/guests/room/bed/meals, final total within the recorded ceiling, cancellation/refund terms, and review/required-facility concerns. Full evidence gaps remain available in a collapsible section instead of overwhelming the main action. Updated the live-result label to identify individually timed review sources rather than incorrectly describing every review as historical.

Frontend authorization now requires the current consent checkbox as well as the confirmed condition signature. Selected handoff additionally requires current preferences to match the result, a matching selected run and no pending work. Changing trip/preferences or withdrawing consent does not keep showing an older selected option as the current platform handoff. This does not cancel existing orders or change backend purchase permissions.

Production build and16 existing browser integration checks passed. These regression checks do not separately exercise every new handoff guard or a real merchant checkout; focused guard coverage remains outstanding. No new platform request, real order or GitHub modification.

## Shared handoff validity and focused regression

Extracted a shared inspection-only handoff validity check used by frontend selected-option presentation and backend selectionValid. It requires current consent/conditions (frontend), matching run/evidence/policy versions, live mode, nonnegative aggregate evidence age≤15minutes, nonblocked within-range option, known price/commute, actual matching room and individually fresh room observation≤15minutes. When cancellation is required, free-until status and a valid future deadline are mandatory. Changed/failed quote rechecks retain the existing backend invalidation.

Focused tests use the saved real two-review workflow: valid inspection selection, withdrawn consent, changed conditions, pending work, old/future evidence, mismatched versions, expired cancellation and individually stale room all covered. Initial full suite exposed a minimal historical test record lacking policy/candidate fields; the shared guard now safely returns no usable option for incomplete legacy records rather than throwing.131 unit tests and production build passed. No new browser verification, live query, transaction or GitHub write this turn.

## Understandable exact-quote monitoring results

Replaced raw recheck status codes and ambiguous price arrows with bilingual outcome cards for unchanged estimate, changed estimate, changed terms, quote not found and request/comparison failure. Cards separate actual check time from source observation times, label signed changes as display-estimate differences only, and suppress difference amounts for noncomparable outcomes. Not-found explicitly does not establish sold-out status; users are directed to refresh/reselect without automatic substitution. Failure preserves the distinction between old observed price and current availability.

Updated live-search scope wording to reflect automatic registered review refresh and partial coverage. Production build and16 existing browser regression checks passed; the suite does not yet exercise all new monitoring card variants. No source/rule data changed, external query, real order or GitHub write this turn.

## Monitoring outcome browser acceptance

17 Chrome integration checks passed after adding focused monitor-card rendering checks. First renders the unchanged actual saved quote-not-found record from cases/live-selected-quote-watch-20261008.json, verifying it does not claim sold-out status or display a price difference. Captured and visually inspected screenshots/live-quote-not-found-mobile.png, showing separate check/old-observation times and manual refresh guidance.

Remaining four states use explicitly synthetic derivatives solely within intercepted test responses, not saved source history: unchanged shows0.00 estimate difference, same-terms changed shows-50.00 with no-realized-saving wording, terms-changed and failed suppress the difference line and show check time. No actual price fall or fresh monitoring request is claimed. TypeScript check passed. No source data, orders or GitHub modifications.

## Two actual same-plan quote rechecks, 19:10

Performed two new sequential read-only HTTP requests in the originating saved real session, keeping identical trip/hotel/ratePlanId and using the previously selected actual room as baseline. Both returned HTTP200 and status unchanged, deltaCents0. First current observation19:10:03.001 Shanghai, second19:10:03.519. Full room/terms comparison passed rather than assuming matching hotel names imply comparable prices. Evidence: cases/live-two-exact-quote-rechecks-20261008.json.

These are actual new provider requests, not replay or synthetic unchanged fixtures. They establish same-plan display-estimate stability for these two closely spaced observations only, not a long monitoring duration, tax-inclusive purchase price, confirmed inventory or savings. Old workflow evidence timestamps remain unchanged; rechecks do not silently refresh route/review facts or extend purchase authority. No real orders, payments, new tests/build claim or GitHub write this turn.

## Private filesystem paths rejected before page serving

Added a page-request guard before production static handling, development middleware and session creation. Private root paths for data/cache/Git/server/scripts/tests/docs and hidden root files return404, including encoded paths and development @fs requests to protected resources. Matching is case-insensitive to account for this host filesystem. Public routes, frontend/shared modules and dependency asset paths remain available.

133 unit tests and production build passed. Actual local production HTTP probes returned404 for configuration, raw review cache, database and server source paths (including encoded/dev-file forms), without creating sessions; health and live page returned200. Evidence: cases/private-path-http-verification-20261008.json. No file contents printed or transferred. This is a specific local path-protection check, not comprehensive public-production security or independent deployment acceptance. No real orders or GitHub modification.

## Development middleware and production regression acceptance

Started an actual local development server on4174, then probed hidden configuration, review cache, database, case-variant server path and development @fs cache path. All returned404 with no session creation; page, frontend module, Vite client and health returned200. Responses were discarded without printing contents. No source/model call was made. Saved evidence: cases/private-path-development-verification-20261008.json. Temporary server stopped using its own running process handle; production4173 remains running.

17 existing production browser integration checks passed with the new protection active, including session-bound simulation screenshots and live workflow saved-source presentation. This verifies middleware boundaries and no regressions for tested routes, not full public-production security, cross-machine deployment or booking readiness. No real orders or GitHub changes.

## Unacceptable review issues enforced across additional sources

Found that newly attached model-detected issue mentions were shown only as gaps, while explicit unacceptable exclusions considered curated primary reviews alone. Candidate and room tradeoff rules now exclude a model-detected issue when it intersects the user's explicit unacceptable list, labeling the exclusion pending source verification rather than declaring the model's interpretation proven. Price, rating or commute benefits cannot compensate for that exclusion. Uncertain labels remain missing-evidence concerns, not confirmed facts or absence.

134 unit tests and production build passed. Focused regression uses actual saved Xinqiao analysis with primary reviews deliberately removed to isolate the additional-source path: unacceptable noise excludes candidate/options and cites source review2127627773; removing detected mentions while retaining uncertainty does not fabricate that exclusion and preserves verification gaps. No user policy record or authority was widened, no new model/source call or real order. GitHub unchanged.

## Previous-assessment quote results remain accessible

The monitoring page now exposes rechecks linked to the latest assessment's parent in a separately labeled expandable section. Prior observation times and results are retained, with an explicit warning that they do not establish the current quote or savings against another room. Records already shown for an active monitor target are not duplicated. Unrelated journey records are not mixed into this section.

Production build and18 Chrome integration checks passed. New browser check uses the actual saved not-found result with an explicitly synthetic refresh-parent relationship inside intercepted rendering state, verifying the history section and old-price warning. This proves presentation, not another merchant query or a persisted new refresh. No real orders or GitHub changes.

## Actual room-field audit and retained rate-plan names, 19:31

Inspected field names from a new actual RollingGo getHotelDetail response for41962 (22 plans). Root/plan/roomInfo field names and boolean inventory-request flags are saved without raw payload or URLs/private values: cases/live-room-field-audit-20261008.json. No explicit final-tax breakdown or quote expiry fields were present in this response; do not infer those capabilities. isOnRequest values included both true and false; false does not establish final bookable stock.

Found ratePlanName in the provider response but not retained in the adapter. Added optional rate-plan name to normalized rooms, same-terms signature and monitoring display. Changed/missing-vs-known names prevent claiming comparable savings. Old records remain unchanged; when the field is newly observed, reason states that old evidence cannot confirm identical terms rather than proving a historical policy change.

135 unit tests and production build passed, including plan-name differences and incomplete legacy metadata comparison. Browser assertions updated for the broader incomparable-terms label but not rerun this turn. No order/payment or GitHub write.

## Cancellation text ambiguity remains unknown

The cancellation parser previously selected the first matching deadline even if multiple distinct deadlines appeared. It now rejects conflicting recognized deadlines and a preceding blanket noncancel/nonrefund restriction instead of inferring a valid free window. Invalid calendar/time values remain rejected. Standard free-until wording followed by after-deadline nonrefund restrictions remains accepted; original raw policy is preserved.

136 unit tests and production build passed. Added focused conflicting-deadline, preceding contradictory restriction,24:00 normalization and legitimate after-deadline restriction checks. These are deterministic parser fixtures, not new live platform terms or proof of every natural-language cancellation policy. No external request, real order or GitHub modification.

## Exact offer terms visible in comparison and handoff

Tradeoff options now carry an optional observed offer summary: source rate-plan name, bed, meal count/wording, cancellation status/deadline, on-request flag, maximum guests and window category. It is copied from the exact bound room, not inferred by the model. Shared bilingual presentation appears in option comparison and selected platform handoff. False on-request explicitly still requires checkout verification; unknown inventory/window/occupancy remain unknown. Legacy assessments lacking the summary show missing-summary guidance rather than reconstructed facts.

137 unit tests and production build passed, including exact room-field preservation in options. No new browser acceptance or source request is claimed this turn. Raw vendor wording is labeled and retained; model permissions and final-price gaps unchanged. No real order or GitHub modification.

## Real offer-summary rendering and explicit free-cancellation requirement

Actual single-hotel refresh at19:45:55–19:46:07 Shanghai produced source offer names, beds, meal counts, occupancy and on-request flags. Stored result: cases/live-offer-terms-refresh-20261008.json.19 browser checks passed, including reading that actual persisted result from its originating session and rendering offer terms. The source's lowest plans stated不可免费取消 with cancelable=false; this does not establish nonrefundable fees.

Found those known not-free offers were treated only as unknown cancellation gaps. Fixed required-free policy screening: explicitly not-free rooms are blocked, while refund fee/status remains unknown. If all observed rooms fail this requirement, candidate screening also excludes them; unknown window/fees cannot erase a known cancellation violation. Offer summaries retain the raw boolean and present the distinction. Unknown free-window terms cannot be locked when free cancellation is required; no extra restriction applies when the user does not require it.

138 unit tests and production build passed after the rule fix. Local audit re-evaluates the saved real rooms without new requests or changing original records: cases/explicit-free-cancel-floor-audit-20261008.json. Previously retained cheap not-free offers are blocked; retained acceptable-range options still carry final-price/inventory gaps. The19-check browser pass occurred before the final explicit-not-free rule adjustment; no post-adjustment browser pass is claimed yet. No real order or GitHub write.

## Live cancellation-time reassessment boundary

Live preference reevaluation now checks cancellation eligibility against the current assessment time, retaining original evidence and room observation times. Recorded replay continues to use its historical time. If a free-cancellation deadline passes during model evaluation, or evidence exceeds its15-minute validity window during evaluation, the assessment is rejected for a fresh reassessment/query rather than saving an obsolete recommendation. Assessment hash includes the evaluation time.

139 unit tests and production build passed. New regression stores recently observed real-mode fixture evidence whose free cancellation deadline lies between observation and reassessment: all offers are blocked, source timestamps and candidate facts remain unchanged. This is a deterministic boundary test, not a new merchant query. The final explicit-not-free adjustment also completed19 browser checks successfully; that browser run preceded this temporal reassessment change. Production restarted with current code. No real order or GitHub modification.

## Invalid live evidence timestamps rejected

Live preference reassessment rejects non-parsable, future-dated and older-than15-minute evidence before calling the model. Added regression for all three states and unchanged idle state after rejection. Corrected the boundary regression to set the typed sourceObservedAt field (not an unused observedAt field).140 tests and production build passed. Earlier browser attempt overlapped production asset rebuilding and timed out locating the initial console button; cause not independently proven. A fresh browser run started after build completion; acceptance remains pending. No external merchant request, order or GitHub write.

Post-build browser rerun completed successfully:19 integration checks passed with current temporal reassessment protection active. Production remains available on4173. These browser checks cover existing presentation and simulated transaction flows; the new invalid/current-time reassessment boundaries are covered by focused unit regressions, not real purchases.

## Server selection applies the same current handoff guard

Found selectInspection persisted selections using a weaker freshness check than state/frontend handoff. It now invokes the shared inspectionHandoffOption guard before persisting or returning an existing idempotent selection: bound room must exist, source quote and evidence times must be valid/current, budget must hold and required free cancellation must still be open. Legacy incomplete records cannot be selected as current offers. This remains inspection-only, not transaction permission.

Updated selection regression supplies an actual bound-room structure and tests expired cancellation, individually stale quote and future evidence even after an existing selection. Existing scope/version/persistence/idempotency checks remain.140 unit tests and production build passed; server restarted on4173. No additional browser acceptance claimed for this server-only change; no merchant request, real order or GitHub write.

## Provisional quote expiry is visible while waiting

Tradeoff panel now updates its clock independently once per second, marks expired/invalid live evidence with bilingual search-again guidance and disables all selection buttons. Individually expired free-cancellation windows show refresh-room guidance; invalid deadline text cannot pass the button guard. Recorded replay is not falsely marked expired from its historical evidence time. Current backend guards remain authoritative.

Production build passed and19 existing browser checks passed after the UI change. Extended the real saved-offer rendering check to assert expiry notice and all disabled selection buttons for aged live evidence; a second browser run with these assertions is running. No new merchant query, order or GitHub write.

Extended browser run completed:19 checks passed, including aged real saved-evidence expiry notice and disabled option buttons. This is browser rendering acceptance of persisted actual source evidence, not a fresh platform query or proof of a booking.

## Uncertain selected quote cannot silently restart monitoring

When the selected quote's latest recheck is failed, price_changed, terms_changed or not_found, starting monitoring for those same trip/preferences now rejects with specific bilingual refresh/reassess guidance. Previously failed/price_changed could restart an old target and changed/missing could silently fall back to broad search. Changed trip/preferences may still intentionally start a new search. Already active read-only monitoring can continue its scheduled observation; this change concerns explicit restart of a now-invalid selected assessment.

141 tests and production build passed. Focused regression verifies all four statuses reject restart, leave monitoring disabled and execute zero source calls. Production restarted. No new browser run claimed for this change; no real merchant query/order or GitHub write.

## Actual post-window market query,20:25–20:26 Shanghai

Ran a new live workflow through the local production API with the unchanged Yonghe Temple2026-10-09/10,2 adults/1 room,600 CNY ceiling,500 ideal and required cancellation policy. Source execution12:25:21.754Z–12:26:13.507Z returned13 candidates with no top-level source errors. Saved complete normalized evidence: cases/live-after-cancellation-window-20261008.json.

TimeWalk returned23 room offers, all explicitly not free-cancelable and excluded under the unchanged policy. The bounded comparison retains four blocked offers (257/293/312/320 CNY display estimates). Xinqiao returned zero rooms in this response; do not infer globally sold out. Other candidates lack matching rooms/routes/review evidence or exceed allowed commute. Nine candidate statuses remain needs_evidence and four excluded. Tradeoff scope none/status needs_evidence; tradeoff model null because there was no eligible compromise pool, not a fabricated Jev recommendation. This does not prove destination-wide impossibility, nor justify increasing budget or waiving cancellation. No booking/payment, no GitHub write.

The real query identifies the next product limitation: hotel identity/map matching and limited room discovery leave incomplete alternatives. Expanding identity-bound discovery and targeted evidence coverage is necessary before claiming comprehensive hotel selection.

## Bounded address-context map discovery and actual unresolved cases

Initial workflow map lookup now performs one supplemental hotel-name-plus-street-address search when the first lookup cannot establish exact identity and the address contains a house number. It combines observations for ambiguity checking and keeps the existing exact name/street-number/unique-coordinate requirements. Conflicting precise POIs remain unknown; no fuzzy identity acceptance was added. Refresh/inspection paths are not yet migrated to this discovery helper.

142 tests and production build passed, including supplemental retrieval, missing-address no-repeat and conflicting coordinates. Actual Amap calls for Beijing Caoyuan, GreenTree Beixinqiao and Home Inn Yonghegong at20:29 Shanghai used two searches each and all remained unmatched. Evidence saved in cases/live-address-context-discovery-20261008.json. Thus retrieval behavior is implemented, but these calls do not demonstrate improved real hotel coverage. Need inspect concrete platform-vs-map identity differences next; do not loosen matching blindly. Production restarted. No order/payment/GitHub write.

## Actual map identity differences investigated,20:31

Recorded raw normalized map POI/geocode observations for the three unresolved candidates in cases/live-map-identity-differences-20261008.json. Found Caoyuan house29 vs甲29, GreenTree branch-name reordering/头条 vs头条胡同, and Home Inn金标 naming vs酒店 with shared草园胡同10号. Several geocode coordinates differ from actual hotel POIs, including a Home Inn name geocode at Yonghe Temple; do not use geocodes as hotel fallback. No verified alias mapping was asserted or introduced. Added actionable findings report hotel-identity-findings-20261008.md. This investigation changes next action toward source-bound identity review instead of loosening general similarity checks. No purchase/GitHub modification.

## Official hotel identity evidence available in candidate cards

Consulted brand official sources. SSAW official hotel J010001 page supports the exact HuaQiao YeBo branch name and北京市东城区北新桥三条5号, matching the observed FlyAI77243002 name/address. New optional identitySources attaches this official link only when platform ID, normalized full name and address all match. Candidate UI presents source name/address and verification time2026-10-08T12:36:49Z, explicitly identity_only: not live rates/inventory/cancellation. Historical saved records are unchanged; future live queries attach evidence only to matching candidates. No aliases for Caoyuan/GreenTree/Home Inn were accepted: brand searches did not prove their specific identity linkage.

142 unit tests and final production build passed. No browser acceptance of the new official-source card claimed yet. Production restarted. Source https://www.ssawhotels.com/order/hotel/J010001?cityCode=BJBJ&hotelCode1=J010001. Verification time is the local verification record time, not a claim that the brand page was published then or fetched by the hotel workflow. No transaction or GitHub write.

## Unresolved map identity evidence is reviewable in the product

Bounded map discovery now retains separate initial/supplemental source observation times and returned places. When the workflow cannot establish identity, candidate mapIdentityEvidence remains explicitly unverified. Candidate UI shows the platform record, map POI names/full addresses/individual observation time and exact Amap place links, explaining that these are unconfirmed and have not established commute or quote association. Geocode results stay in the audit observation but are not shown as selectable hotel identity matches. No user confirmation is treated as permission or verified alias.

142 unit tests and production build passed.20 browser integration checks passed, including combining actual saved query/map observations for a rendering-only check: Caoyuan甲29号 displayed against platform29号, unverified wording and Amap link visible, geocode rejection explicit. This is not a new live workflow query or verified hotel mapping. Future live workflows persist unresolved observations; old records remain unchanged. Production restarted on4173. No purchase or GitHub write.

## Consistent map discovery in targeted refresh and model inspection

Single-hotel refresh and Jev route supplemental checks now use the same bounded address-context discovery as initial search, retaining unverified map observations for product review. Refresh clears old map evidence; route inspection clears the old route/position before attempting new verification so a failed attempt cannot silently keep an older route as newly confirmed. Supplemental search failure preserves initial map observations instead of discarding them; contextual query beyond the upstream120-character limit is skipped, not truncated into a misleading identity query.

143 tests and production build passed. New focused regression verifies supplemental failure keeps original observation time/places and oversized context never triggers a second call. Existing targeted refresh regression still preserves the historical record while new route remains unknown on lookup failure. Production restarted on4173. No new browser or live-source acceptance claimed for these paths, no order/GitHub write.

## Name discovery no longer discards independent verified platform hotels

Actual name-specific RollingGo lookup for SSAW returned71 rooms and platform hotel2209795 with address北新桥三条5号6幢, while FlyAI77243002 and official brand page use北京市东城区北新桥三条5号. Saved source observation cases/live-ssaw-identity-audit-20261008.json. This does not prove a cross-platform building-address equivalence.

Workflow now retains a separately identity-verified name-lookup result as an independent platform candidate even if its address differs from the originating platform. It does not copy that platform's route/position or link its prices; independent map discovery/routes are attempted. Exact shared-address cases retain their prior behavior; platform ID/name/address conflicts still block updating existing candidates.144 tests and build passed, with a focused regression proving rooms retained, distinct platform address preserved, independent route call and no purchase authority. Production restarted; new complete live query is running for end-to-end source validation. No GitHub write or transaction.

## Independent hotel discovery verified in a complete live run

The prior confirmed live process completed successfully12:51:59.108Z–12:53:40.224Z (20:51–20:53 Shanghai), result cases/live-independent-hotel-discovery-20261008.json.14 candidates instead of prior13; SSAW RollingGo2209795 retains71 room offers and its independently requested walking route15 minutes, separate from FlyAI77243002. Equal displayed walking minutes do not prove route reuse or platform identity equivalence; workflow regression verifies independent calls. Address-building differences still prevent claiming matched cross-platform savings.

All retained room options for SSAW/TimeWalk violate required free cancellation, so no tradeoff recommendation. The run explicitly records failed public-review refresh/model analysis and failed next-action Jev judgment; tradeoff model remains null. Do not count these failures as successful current analysis. Existing source evidence keeps original times. Added bilingual notice when all displayed options are blocked: only inspected/shown offers fail; other unverified hotels may remain suitable, no city-wide impossibility or automatic relaxation.

Production build passed. Browser acceptance of actual persisted new run plus scoped no-match wording is running. No real transaction, no GitHub write.

Browser acceptance completed:21 checks passed, including loading the actual new workflow record from its originating persisted session and scoped all-blocked guidance. This confirms presentation of completed live results, not a new source call or successful model inference/transaction. Current page available on4173.

## Model-service failures carry safe actionable categories

TypeSafe transport now throws typed missing-key, request-timeout/network, HTTP-status and invalid-JSON errors, without propagating server response bodies or thrown transport messages. Live next-action and primary review-model failure paths attach specific guidance for recognized transport errors; unknown failures keep generic wording. English result errors now pass through the existing bilingual display mapping. No historical failure was reclassified: the previous real run did not preserve enough diagnostics to establish its cause.

145 unit tests and production build passed. Focused timeout/network/403 regressions verify correct categories and absence of secret marker in reported errors. Existing one bounded429/529 retry unchanged; no automatic booking or authority change. Production restarted. No new live model request or browser acceptance claimed for the new messages; no order/GitHub write.

## Real model connectivity and bounded review batches verified

Actual TypeSafe GET/v1/models21:05:11–21:05:12 Shanghai succeeded and recognized jev-latest/jev-preview. Actual inference on one saved real TimeWalk review21:07:23–21:07:31 returned jev-1.13.0 with all seven issue labels. Evidence cases/live-model-connectivity-20261008.json and cases/live-model-single-review-check-20261008.json. Neither proves the cause of previous failures or transactional permissions.

Review analysis now sends at most five reviews/35 independent issue questions per sequential batch, with at most six batches for the existing30-sample cap. Global source-row keys stay bound to local batch review indices, usage aggregates only validated responses, and mixed model versions/incomplete/extra/invalid labels reject the whole analysis. No partial analysis is attached as complete; full-source evidence hash and original review observation time remain unchanged.

146 unit tests and build passed, including source bindings across batch boundaries, aggregated usage and rejected mixed-model/partial results. Actual full saved TimeWalk15-review analysis21:09:49–21:10:00 completed successfully with jev-1.13.0 and105 validated issue probabilities; cases/live-model-batched-review-check-20261008.json. This is current model inference on saved actual reviews, not a current review-page fetch, hotel recommendation, measured uncached latency, proof of general reliability or resolution of every previously failed case. Current model execution took about11 seconds for this request. Production restarted with batching. No order/payment/GitHub modification.

## Source-bound next-inspection model state verified

Next-inspection planning now uses inspectionCandidateState: source identity/times, bound representative room, commute summaries/times/warnings, effective rating with source time, opening/renovation separately, curated issue/date samples, primary/additional semantic sources, personal targeted-sample metric and complete gaps/reasons/errors. Raw review prose is not duplicated into task planning; full evidence stays in audit/review classification. Missing reviews/routes/risk remain null; bookable=false. Additional semantic sources and explicit personal metric were previously omitted from this next-action state.

147 tests and production build passed; projection regression preserves source times/gaps/metrics and prevents forwarding a raw injected review summary to task planning without altering the stored source. Existing integrated model regression verifies actual commute source/time, room and review state and no purchase authority.

Real Jev1.13.0 task planning on SAVED actual14-hotel run evidence succeeded21:15:42–21:15:43 Shanghai (~1.6 seconds); cases/live-projected-inspection-model-check-20261008.json. Candidate choice confidence0.27 is low, not a unique recommendation. Independent fixed-candidate next taskquote confidence0.6 is evidence advice only. No current hotel query/selection/transaction was created. Measured candidate JSON grew5365→6835 bytes because additional source/metric facts were added despite removing prose. Do not claim total context reduction or attribute latency to this projection; prior real failure causes remain unproven. Production restarted; GitHub unchanged.

## Independent inspection judgments have explicit task targets

Jev next-inspection output now stores optional selectedForAction from the request's fixed task target. Previously UI displayed candidate choice alongside independent next_action without showing which hotel that task addressed, making different answers easy to misread as linked. New bilingual InspectionAdvice presents hotel names, human-readable tasks, fixed task hotel and separate confidence. Candidate confidence below.5 retains up to three model alternatives and warns against a unique preferred hotel; low task confidence also warns. Old records missing the fixed target explicitly remain unconfirmed; no historical association is reconstructed.

147 tests and build passed; integrated model regression verifies fixed task target equals actual request state.22 browser checks passed, including actual saved model/evidence with an explicitly synthetic mismatched target for presentation verification, and a missing-target legacy variant. This does not claim the real model chose different targets or create a new recommendation/transaction. Production restarted. No GitHub modification.

## Complete real workflow with batched reviews and projected inspection state

Live integration query completed13:25:07.117Z–13:26:11.222Z (21:25–21:26 Shanghai),14 candidates and no top-level errors: cases/live-integrated-batched-workflow-20261008.json. Actual current TimeWalk review page13:25:59.043Z/analysis13:26:06.273Z and Xinqiao page13:26:07.811Z/analysis13:26:10.818Z each supplied15 visible samples with jev1.13.0. Jev task planning succeeded with fixed fliggy12633667 target, candidate confidence.39 and quote task confidence.89. Eight shown room options still blocked by required free cancellation; no city-wide impossibility, recommendation or transaction inferred. Added Chinese standalone real-integrated-acceptance-20261008.md.

Separately fixed model response-body interruption classification: body timeout/network must not be reported as invalid JSON.148 tests and build passed; test distinguishes aborted body from actual malformed JSON and protects secret markers. The completed real integration ran before this body-diagnostic-only restart; it validates batching/projection/current source binding, not a real interrupted-body scenario. Production restarted successfully on4173. No new browser acceptance for this particular new run, no order/GitHub write.

## Latest integrated real run has browser acceptance

23 browser checks passed, including loading the21:25–21:26 real run directly from its originating persisted session without intercepting its result. Verified uncertain candidate guidance, fixed task hotel, quote-task label, official identity source and every blocked room selection button disabled. Source records independently confirm two15-sample analyses with observation times within the real run. Viewed mobile screenshot live-integrated-workflow-mobile.png: first viewport presents live workflow and previous-condition warning; it does not show the lower advice/review cards in that viewport. No claim that this image alone verifies those cards. Updated real-integrated-acceptance-20261008.md with scoped browser evidence. Production build passed after test addition. No new merchant/model request, real order or GitHub write.

## Next inspection advice has practical handoff controls

Bound current-version advice now offers the fixed task hotel's platform link and explicit record dates, occupancy and budget ceiling. It distinguishes merchant final checkout verification from displayed room/route refresh. RollingGo candidates have a manual refresh callback for room/route-related tasks, gated by query consent/current conditions/busy/monitor state; registered review links appear for review tasks. No tool is claimed to obtain final taxes/confirmed inventory or verify exterior windows automatically. Missing fixed targets/version mismatches do not expose execution controls; no model action executes on rendering.

Production build and23 browser checks passed. Latest actual persisted run verifies the platform link equals the fixed task hotel's real returned detailUrl, dates/ceiling shown and final-checkout limitation explicit. This browser test does not open the external merchant link, buy, or exercise a new real refresh; prior server refresh checks cover that endpoint. No GitHub write or transaction.

## Monitor startup respects current inspection-selection validity

Previously monitor startup used weaker binding/status checks than selection/handoff, allowing expired/incomplete selected records to start quote watching or silently broad-search. Same-trip/preference selected monitoring now requires snapshot.selectionValid before startup; otherwise it rejects with refresh/reassess guidance before source calls. Different trip/preferences may deliberately begin a new search. Already active read-only quote watches retain their scheduled behavior; this does not impose the initial15-minute freshness gate on every subsequent observation or create transaction permission.

149 tests and production build passed. Quote-watch test now supplies proper inspection-purpose metadata and fresh bound room evidence; it still starts exact-plan monitoring and stops on changed terms. Focused rejection test covers stale/future quote, future assessment time, uncertain cancellation, expired cancellation and over-budget selection with zero source calls and disabled monitoring. Expired legacy selection test now checks rejection before startup rather than startup-then-stop. Production restarted on4173. No new live-source/browser acceptance claimed for this server change, no order/GitHub write.

## Room observations verify current hotel ID and name before association

RollingGo normalization already checks provider hotel ID/dates against the request. Workflow now additionally checks normalized detail ID and full normalized name against the candidate record in initial room queries, targeted refresh, Jev room supplemental calls and exact quote rechecks. Same ID with a conflicting hotel name is not silently associated with prior review/route evidence; wrong ID is rejected as well. Recheck conflict keeps after=null/delta=null and explicit identity failure, preserving old historical records.

150 tests and production build passed. Existing successful quote recheck/refresh fixtures now supply proper returned hotel ID/name. New regression keeps rate ID and price identical while changing name or hotel ID: both outcomes failed, no price difference adopted and original hotel name unchanged. This is deterministic failure-path acceptance; no new live hotel identity-conflict request or browser acceptance claimed. Production restarted on4173. No transaction/GitHub write.
## Explicit time zones required for live inspection and cancellation evidence

Added a shared explicit-instant validator for evidence, quote and cancellation timestamps. Missing time zones, date-only values and normalized invalid calendar dates remain unverified rather than being interpreted in the server/browser local zone. Live selection, monitor startup, tradeoff cancellation checks and displayed offer terms use this validation. Valid UTC and offset timestamps retain equivalent instants; historical source records are unchanged.

153 unit tests and production build passed. New regression verifies unzoned aggregate evidence, individual quote and cancellation deadlines all reject inspection handoff. Existing browser acceptance completed successfully after production restart on4173; its saved real evidence checks do not constitute a fresh merchant query, real purchase or a dedicated browser test of every malformed timestamp variant. No GitHub write or transaction.
## Withdrawal of query consent stops subsequent monitoring rounds

Unchecking live workflow query consent now clears the local confirmed conditions and posts to the session-bound same-origin workflow/revoke endpoint. The server stops monitoring with consent_revoked, clears the next schedule and advances the generation so an ongoing round cannot schedule another round after it completes. Already-started assessment rounds may finish; the page states that limitation. Failure to confirm stopping displays a visible retry instruction rather than claiming success. Reopening the page still requires renewed local query consent; this change is not a persistent account authorization system or cancellation of merchant orders.

153 unit tests and production build passed. Existing in-flight monitoring regression now exercises consent_revoked and confirms no next schedule after completion.24 browser checks passed, including an actual local revoke HTTP response with monitoring disabled, no nextCheckAt and consent_revoked, and new-query button disabled. This browser check does not start a real upstream monitor or make external merchant requests. First browser attempt was interrupted by a concurrent rebuild; final acceptance ran successfully against the fixed build. Production remains on4173. No GitHub modification or real transaction.
## Repeated failed monitor observations stop with visible recovery guidance

Live monitoring now records consecutive complete failures, counts every finished attempt including thrown failures, and stops after three failed rounds with repeated_failure and no next schedule. An exact quote status failed counts as failure; broad search counts only an empty result accompanied by query errors. A partial result resets the complete-failure counter while retaining its evidence warnings. An empty successful search is not treated as an outage. Changed/missing quotes, withdrawn consent and cancellation expiry retain their existing distinct stop paths. Restart preserves the failure count/reason without restarting monitoring.

155 unit tests and production build passed. New regressions cover three failed search rounds, no fourth scheduled action, persisted stop reason and partial-result counter reset.25 browser checks passed, including synthetic failure-state rendering with count3/3, recovery message and consent-gated restart. This does not establish a three-round real upstream outage or long-duration reliability. Production restarted on4173; no external hotel requests, purchase or GitHub write this turn.
## Assessment outcome separates blocked quotes from unobserved hotels

Added an outcome-and-next-step card at the start of comparison/results. Classification distinguishes empty observations with query errors, successful empty observations, missing evidence, displayed blocked offers, confirmation-required alternatives and provisional within-limit options. It displays observed-hotel count and absent room/route/review coverage; existing evidence still requires freshness, identity and scope checks. The card never equates absent evidence with a failed requirement or grants purchasing permission. Navigation leads to search, preferences or room-refresh/recheck controls, without initiating source calls automatically.

157 unit tests and production build passed. Actual saved14-hotel case proves all displayed offers blocked while room coverage remains incomplete. Tests distinguish successful empty search from query failure and partial/provisional outcomes without changing transactionEnabled.25 browser checks passed; the existing actual persisted-run check now additionally verifies coverage guidance and navigation to room rechecks. This is presentation/navigation acceptance on saved actual evidence, not a new live query or final-price verification. Production restarted on4173, no transaction or GitHub write.
## Missing-room hotels have direct evidence-collection controls

The outcome card now expands the hotels without room observations, showing platform/address and the original merchant detail link. Live RollingGo records expose the existing targeted room/route refresh directly; controls require current query consent, matching trip/preferences, idle execution and stopped monitoring. Other platforms and recorded evidence explicitly hand off to platform verification instead of implying a targeted tool exists. Refresh scope and query-history preservation are stated; an empty room response is never labelled sold out.

Production build and25 browser checks passed. Existing actual14-hotel persisted-run acceptance additionally checks every missing-room hotel is listed, source links equal returned detail URLs, RollingGo button count equals missing RollingGo records and all buttons remain disabled without current consent. No external source call or actual refresh was triggered by these new UI checks. Existing157 unit-test result remains the most recent unit-suite evidence; no unit logic was changed this turn. Production restarted on4173; no order or GitHub modification.
## Real missing-room investigation distinguishes filters from stock

Actual RollingGo Xinqiao43565 detail request22:23:06–22:23:09 Shanghai without cancellation filter returned85 plans,6 display estimates≤600 and cheapest481; all85 have cancelable=false and explicit not-free-cancel policy. A subsequent actual CANCELABLE-filtered request22:26:45 returned0 plans. Workflow room inspections use that filter; unlike-filter observations are not comparable inventory/price changes or evidence of sold-out status. Current required free cancellation remains unchanged. Saved normalized source evidence and standalone followup report.

Actual complete production workflow in a new session22:24:15–22:25:21 (~66seconds) retained14 hotels and94 rooms, no top-level errors, two current15-sample review captures analyzed with Jev1.13.0. Candidate choice confidence.44 remains uncertain; fixed quote task.92. All8 displayed options violate free cancellation; no selected hotel, final taxable quote, confirmed inventory or transaction. This run verifies current integrated read-only execution; not long-duration reliability or full-market availability. No code/test changes this turn; latest prior build/browser results not relabelled as a new suite. No GitHub write or real order.
## Room-query coverage preserves status, filters and observation time

New workflow candidates carry optional roomQuery status returned/empty/failed, filter, count and source time. Successful initial, targeted refresh, name-discovered and model supplemental room observations attach metadata after identity checks; initial failed attempts attach local completion time and requested filter, without asserting room count. Legacy records are unchanged and explicitly cannot distinguish an unqueried hotel from missing historical metadata. Candidate cards and missing-room controls display cancellation/meal filters and warn that cancelable filtering is not proof of free cancellation or sold-out status.

158 unit tests and production build passed. New regression uses actual85-plan unfiltered and0-plan CANCELABLE responses to verify separate statuses/counts/source times and filter-copy isolation.26 browser checks passed: legacy missing metadata remains explicit; a local rendering combination binds the actual saved filtered-empty response to the matching hotel and verifies filter/limitation text. This combination is not a persisted new observation, new merchant query or successful final-stock verification. Production restarted on4173. No real transaction or GitHub write.
## Jev inspection state includes room-query coverage

Next-inspection candidate projection now includes optional query status/count/filter/source time and a fixed interpretation: filtered emptiness is not sold-out stock or free-cancellation verification, and identical recent successful queries require a specific evidence need. Missing legacy query metadata stays null. Tradeoff follow-up state also includes the selected hotel's query record; its room-action criteria explicitly consider prior query status/filter/time. Code purchase gates and fixed authorization are unchanged.

158 unit tests and production build passed. Projection regression verifies null unknown state, preserved empty query/count/filter/source time and filter-copy isolation. Actual Jev1.13.0 request22:38:36–22:38:38 on SAVED real Xinqiao evidence chose merchant inspection, confidence.51 (rooms probability.30, merchant.67, none.03), case live-room-query-aware-model-check-20261008.json. This is a fixed-hotel model check with explicit room/merchant/none options, not the full workflow question set, a new merchant query, proof of general repeat-query reduction or permission to book. Source observations remain22:25–22:26; no history rewritten or action executed. Initial verification command had an incorrect local import and made no model call; corrected command succeeded. Production restarted on4173. No new browser acceptance claimed for this backend-only change, no transaction/GitHub write.
## Map failures do not persist arbitrary transport messages

Initial workflow map/route failure handling previously appended the thrown exception message to candidate errors, which are exported, persisted and used as model evidence. It now uses a fixed actionable map-permission/quota/retry message with an English mapping; missing routes stay null and are never treated as zero travel. This narrows one actual raw-message propagation path, not a claim that every adapter/error path has a complete security audit.

159 unit tests passed and final production build passed. New regression throws a transport error containing a private request marker during hotel lookup, confirming it is absent from both returned and persisted history while the visible map failure and unknown route remain. This is injected failure acceptance, not an actual credential leak or current map-service outage. Production restarted on4173; no new browser/source acceptance, transaction or GitHub write claimed.
## Original candidate context opens automatically after a hotel refresh

SavedRuns now accepts the current parentRunId and automatically reads/opens the exact prior assessment so a single-hotel refresh does not obscure the other original candidates. It preserves original timestamps/preferences and explicitly forbids implying savings or current availability from old estimates. Manual recent-history browsing remains available; missing parent records have a specific notice rather than implying the session has no history. Exact run lookup queries only the current session SQLite database and does not mutate current trip, preference, selection or consent. UI refresh results still evaluate the refreshed hotel only; historical candidates are not merged into fresh ranking.

160 unit tests and final production build passed. New regression verifies exact original payload, absence across session boundaries and invalid-ID handling.27 browser checks passed, including loading the actual saved refresh into a display-only state and retrieving/opening its real persisted parent from the same session, showing every parent candidate. First browser attempt exposed an old positional test assumption; it now waits for the exact saved run ID instead of list position. This is original-record presentation acceptance, not a new merchant query or mixed-age price comparison. Production restarted on4173. No transaction or GitHub modification.
## Quote freshness does not renew stale commute evidence

Inspection selection/handoff now also requires candidate route observation time to be explicit-zone, not future and within15minutes, independently of aggregate and quote timestamps. The existing monitor startup selection-validity gate inherits that check; ongoing read-only quote monitoring is not forced to refresh routes every round. Tradeoff buttons independently check room/route evidence references for current live records and show specific stale/unverified route and room instructions. Historical source records remain unchanged.

161 unit tests and final production build passed. Regression isolates stale, future, unzoned and missing route with otherwise valid saved quote/selection. Two successful synthetic selection/watch fixtures were corrected to include explicitly current route evidence; no historical source timestamps modified.27 browser checks passed; actual old saved run now verifies its stale-route instruction is visible and option buttons remain disabled. This is failure-path/rendering acceptance, not a new route query or proof of commute accuracy. Production restarted on4173. No transaction or GitHub write.
## Readable bilingual assessment export

Comparison/results now provide Export readable report alongside the original JSON export. The standalone printable HTML includes trip/budget/preferences, hotel observations, representative display-estimate terms, independent source times, room-query status/filter, advantages/exclusions/gaps, partial positive/negative review evidence and model task/confidence. Original hotel/source text remains original language; report explanations follow the selected UI language. It explicitly distinguishes saved observations from current stock/final charges/order confirmation and preserves all original source timestamps. Report is a readable summary; complete original records remain separately exportable.

163 unit tests and final production build passed. Regressions verify actual saved-source preservation/read-only disclaimers, no source mutation, escaped injected HTML and rejected executable URLs with restrictive CSP.27 browser checks passed, including downloading the report from the actual persisted21:25 integrated run and verifying its run ID/evidence baseline/no-order statement/budget. Artifact docs/reports/real-hotel-assessment-integrated-20261008.html. No rendered/print-layout screenshot acceptance claimed yet. Initial test import omitted the Node-required .ts extension and was corrected before final passing suite. Production restarted on4173. No external hotel query, transaction or GitHub write.
## Transaction integration prerequisites reverified against current tools and official docs

Actual RollingGo listTools23:04:31–23:04:32 Shanghai returned only getHotelDetail/getHotelSearchTags/searchHotels, server MCP Hotel Server1.0.0. Saved live-rollinggo-capability-check-20261008.json. Re-read official FlyAI repository, skill and homepage: search commands and booking links are documented, but these do not establish order/cancellation/refund API rights for this project. Updated ready-to-send access-request document with the current credential-visible scope and three priority platform confirmations: final quote/inventory, transaction sandbox and concrete docs/rights. No claim that either provider lacks all partner transaction interfaces.

This is new external capability evidence and updated application material, not an implementation or transaction acceptance. Current product goal remains incomplete: actual transaction permissions/final pricing and broader production requirements still missing. No new tests/build/browser results claimed, no signup/outbound message/order/GitHub write.
## Readable export has offline, mobile and print-style acceptance

Browser acceptance now opens the actual downloaded HTML offline, verifies all candidate articles, checks mobile horizontal overflow and print-media visibility, and confirms opening makes no external HTTP requests. Desktop/mobile first-viewport screenshots were inspected. Visual inspection identified raw timestamp strings and boolean preferences as readability issues; report now displays explicit-zone timestamps in Shanghai time while preserving original instants in HTML time datetime attributes, translates boolean/window/task labels and renders technical record metadata smaller. Unknown/unzoned timestamps are not silently localized.

163 unit tests and final production build passed;28 browser checks passed after final restart. Downloaded artifact and desktop/mobile screenshots refreshed. This is first-viewport visual inspection plus content-count/mobile/print-CSS checks, not all-page pagination, generated PDF or physical printer acceptance. Original source observations remain saved historical evidence; no hotel query, transaction or GitHub modification. Production on4173.
## Nearby map-led discovery has real source validation

Added independent findNearbyHotelLeads service using documented Amap around search, destination coordinates, fixed hotel keyword and at most10 records. Validates coordinates/radius, deduplicates POI IDs and excludes actual straight-distance outliers before sorting the bounded returned set. Leads remain discoveryOnly with explicit no-price/stock/commute/full-coverage limitations; no automatic workflow/UI integration yet.

Actual23:15:28–23:15:29 Shanghai discovery found10 leads253–474meters from uniquely matched Yonghe Temple. Actual exact-name RollingGo lookups returned three named platform records2960987/592067/1357097, all0 rooms; first lacks verified platform address. Saved normalized discovery/lookup evidence and nearby-discovery-validation report. Empty rooms do not prove sold-out inventory; no comparable quote or booking conclusion.

164 unit tests and production build passed; regression covers invalid/outside/duplicate/blank POIs, radius bounds and discovery-only semantics. No new browser acceptance claimed, no transaction/GitHub write. Official Amap search docs and official FlyAI hotel-search parameters reviewed; no guessed provider parameters or broadened purchase authorization.

## Name lookup cancellation filter repair — 23:35 Shanghai

Found and fixed `RollinggoAgent.detailByName` ignoring input filters. It now validates filters before network calls, forwards them to getHotelDetail, enforces them locally against returned cancellation evidence and preserves actual filter metadata in stored observations. Unknown cancellation terms cannot pass a CANCELABLE filter. No model or purchase permission changes.

Real read-only validation 2026-10-08 23:35:42–23:35:44 Asia/Shanghai: 炮局工厂青年旅舍(北京雍和宫地铁站店), hotel ID 293833, October 9–10, two adults, one room; CANCELABLE filter returned zero normalized plans, matching identity/address verified. This does not prove sold out or absence across the market. Evidence: `cases/live-name-filter-validation-20261008.json`. Earlier unfiltered 243-yuan observation remains an unchanged historical record.

166 unit tests and production build passed. Regression covers invalid filters making zero network calls, forwarding valid filters, excluding mismatched remote plans and persisted query scope. No real transaction or GitHub write.

Previous nearby-expansion integration validation: 23:27:58–23:28:05 Shanghai, three attempted leads, two retained candidates, one estimated 243-yuan standard room with two single beds, 14-minute walking route, not freely cancellable and inventory on request; rules blocked it. Other retained hotel had missing address/room evidence. Original record retained; 165 tests and 28 browser checks passed at that checkpoint.

## Nearby transient failure recovery

Changed nearby discovery from suppressing every attempted name throughout the last 30 matching records to a 15-minute cooldown for unsuccessful attempts. Existing retained candidates remain excluded from discovery and use targeted refresh; normalized name matching remains consistent. Old, unzoned and future attempt timestamps cannot permanently suppress failed leads. Explicit error text reports when discovery may retry. Original observations, user limits, and transaction restrictions are unchanged.

168 unit tests and production build passed, including exact cooldown boundary, malformed/future timestamps, retained-candidate exclusion and existing sequential nearby expansion integration. This verification is local; no new merchant observation or real transaction is claimed.

## Nearby discovery outcome and retry guidance

Nearby discovery now reports when returned map leads contain no new eligible hotels, distinguishes known leads from temporarily cooling-down failures, and records the earliest relevant retry time (Asia/Shanghai UI). Retry hints only consider failures among current returned map leads, use the latest attempt for each name, and exclude already retained candidates. English and Chinese summaries preserve the limited query scope. Legacy records need no migration.

169 tests passed and production build passed; local verification only, not another merchant query. Added boundary and recent-attempt tests.

## Real filtered nearby expansion acceptance — 23:43 Shanghai

Actual full expansion endpoint request 2026-10-08 23:43:01–23:43:10 Asia/Shanghai used the same original Beijing Yonghe Temple October 9–10 query and unchanged budget/cancellation policy. Three new leads attempted; two platform records retained with independently queried routes and CANCELABLE filter metadata, both with zero normalized rooms. 秦府客栈 identity/room lookup failed safely. Empty filtered rooms do not establish sold out, full-market absence, or verified bookability. Original observations remain separate. Evidence: `cases/live-filtered-nearby-expansion-20261008.json`.

This real request exposed a retry hint defect: earliest retry was computed before execution and omitted newly failed leads. Repaired computation to use current completedAt plus this round's attempts and accepted candidates. The artifact preserves the old reported hint as a historical fact; it is not rewritten. Regression verifies the current failed lead has exactly a 15-minute cooldown. 169 tests and production build passed. No order or GitHub mutation.

Browser acceptance: 29 checks passed, including actual persisted nearby-expansion session displayed in English with scoped empty filtered rooms and disabled further queries without consent. No new merchant request in browser acceptance. User-facing report: `real-nearby-expansion-acceptance-20261008.md`.

## Persistent workflow query-consent withdrawal

Workflow withdrawal now persists a separate revoked flag in session SQLite. Withdrawal stops scheduled monitoring and rejects new live workflow runs, nearby expansion, candidate refresh, quote rechecks, model reevaluation, inspection selection and monitor starts before tool execution. Manual stop cannot clear withdrawal, and restart preserves it. New explicit `/api/live/workflow/authorize` validates complete query-only conditions before clearing withdrawal; the preferences confirmation button now awaits this backend confirmation. Selected inspection validity is false while withdrawn.

170 unit tests and production build passed. Regression covers all blocked entry points with zero dependency calls, invalid reconfirmation, manual-stop behavior, persistence and valid reconfirmation without tool execution. Already-started operations may finish; no claim of in-flight abortion. Existing historical sessions have compatible defaults; this is not a complete account authorization system. Standalone provider debug pages are outside this workflow-specific consent scope and remain separate read-only tools. No real purchase authorization granted or GitHub write.

29 browser integration checks passed after backend consent confirmation was wired into the preferences flow. Actual local HTTP verification also rejects run/expand/refresh/recheck after withdrawal; empty payloads deliberately fail at the withdrawal gate before tool use. Evidence: `cases/workflow-withdrawal-http-validation-20261008.json`. No external platform calls in this HTTP test.

## Confirmed workflow scope binding

Read-only confirmation now persists the normalized liveConditionsKey of query and policy alongside withdrawal state. New live runs/monitor starts validate this scope; targeted refresh, nearby expansion, quote rechecks, inspection selection and live model reevaluation validate the corresponding record or revised policy before tool calls. Changed destination or budget is rejected until explicit reconfirmation. Scope survives restart; existing SQLite rows migrate with nullable scope and historical sessions retain compatible defaults. This does not grant transaction rights or implement a full account authentication system. Model activation preferences are not part of this trip/policy key.

170 unit tests passed, including changed budget, changed destination, zero dependency calls and persisted scope after reopening. Production build passed. Error guidance directs users back to preferences and confirmation. No real merchant query, order, or GitHub modification in this change.

Actual local HTTP scope verification confirmed query-only authorization, then rejected changed POI and budget at the workflow run endpoint. Evidence: `cases/workflow-consent-scope-http-validation-20261008.json`. These were deliberate scope violations; no provider query or transaction occurred. Updated service restarted successfully.

## Monitoring handoff on reconfirmation

Explicit confirmation of new trip/policy scope now stops an idle scheduled monitor bound to different conditions before storing new scope; stop reason `conditions_changed` is persisted and displayed bilingually. Reconfirmation of the same conditions leaves the existing watch running. Neither confirmation starts a new watch nor invokes provider tools. Ongoing evaluation must finish before confirmation can proceed.

171 tests and production build passed. Regression runs an outage-simulated monitor, confirms same conditions preserve it, then confirms changed budget stops it and old-scope query is rejected with no additional dependency calls. Local test state is not a real provider outage claim. No actual order or GitHub modification.

30 browser integration checks passed, including new bilingual stop-reason rendering acceptance using explicitly synthesized local state. Service restarted and local health endpoint responds. Real transaction flag remains false.
