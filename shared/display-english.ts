/** Translates variable UI observations without modifying their underlying facts. */
export function displayEnglish(text:string):string|undefined {
 const reviewText:Record<string,string>={
 '地图或路线服务未完成，请检查地图服务权限或配额后重试；缺失路线不按0分钟处理。':'Map or route verification failed. Check map-service permissions or quota before retrying. Missing routes are not treated as zero-minute travel.',
 '模型请求超时，请稍后重新核验；已取得的证据和权限不变。':'The model request timed out. Verify again later; obtained evidence and permissions remain unchanged.',
 '模型服务连接失败，请检查网络后重新核验。':'The model connection failed. Check the network before verifying again.',
 '模型服务鉴权失败，请检查服务端凭证和权限。':'Model authentication failed. Check server credentials and permissions.',
 '模型服务繁忙或限流，有限重试结束后请稍后手动核验。':'The model service is busy or rate-limited after bounded retry. Verify again manually later.',
 '模型返回格式无效，未采用新判断。':'The model returned an invalid format. No new judgment was adopted.',
 '模型服务请求失败，未采用新判断。':'The model request failed. No new judgment was adopted.',
 '回放使用已有观察；实时模式重新查询报价和地图，并刷新已登记且身份匹配的评论来源。其他评论保留原时间或明确缺失。最多核验12家位置并补查部分房型，未覆盖全市场。':'Replay uses saved observations. Live mode refreshes hotel estimates, routes and registered identity-matched review sources. Other reviews retain their original times or remain missing. Up to 12 locations and a bounded set of room details are checked; coverage is not the entire market.',
 '第二平台评论刷新未完成；保留原观察时间，不视为问题已排除。':'Additional-platform review refresh failed; previous observation times are retained. Absence of issues is not established.',
 '本轮公开评论刷新或模型分析未完成；保留带原时间的既有评论，不视为风险已排除。':'Current public review refresh or analysis failed. Earlier evidence retains its original time; risk is not ruled out.',
 '附加评论来源未能读取；不补造第二平台分析。':'The additional review source could not be read; no replacement analysis was fabricated.',
 '已保存的评论模型分析不可用；保留原始评论证据，不补造结果。':'Saved review analysis is unavailable; original evidence is retained without fabricating results.',
 '评分尺度或评分底线证据不足':'Rating scale or hard-minimum evidence is missing.',
 '评分低于用户明确设置的硬底线':'Rating is below your explicit hard minimum.',
 '理想评分尚未核验':'Preferred rating has not been verified.',
 '低于理想评分，允许范围内待比较':'Below your preferred rating; compare within your accepted limits.',
 '低于理想评分，需要重新确认放宽':'Below your preferred rating; relaxation needs confirmation.',
 '开业年份未知，翻新年份不能代替开业年份':'Opening year is unknown; renovation does not establish opening year.',
 '早于理想开业年份，允许范围内待比较':'Opened before your preferred year; compare within your accepted limits.',
 '早于理想开业年份，需要重新确认放宽':'Opened before your preferred year; relaxation needs confirmation.',
 '住客提到门墙隔音较弱，但该次睡眠安静，且赞扬服务；为问题提及，不表示总体差评或所有房间存在问题。':'A guest reported weak door/wall insulation, but a quiet stay and good service. This issue mention does not establish a generally negative review or a problem in every room.',
 '住客认可房间清洁、安静和服务。':'A guest appreciated room cleanliness, quietness and service.',
 '住客认可整洁、安静和早餐，同时提到房屋并非很新。':'A guest appreciated cleanliness, quietness and breakfast, while noting the building was not particularly new.',
 '网页读取工具访问的平台历史索引页面，非实时评论API；选取可见且相关的样本，未读取全部负评。地址繁简字人工对应核验。':'An indexed historical platform page read with a web tool, not a live review API. Visible relevant samples were selected; not all negative reviews were read. Simplified/traditional address characters were manually matched.'
 };
 if(reviewText[text])return reviewText[text];
 const issueName=(name:string)=>({隔音:'Noise',卫生:'Hygiene',气味:'Odor',维护:'Maintenance',服务:'Service',空间:'Space',安全:'Security'} as Record<string,string>)[name]??name;
 const patterns:[RegExp,(...values:string[])=>string][]=[
 [/^模型识别用户不可接受的问题：(.+)（评论(\d+)）；核验前不推荐该酒店$/,(issue,id)=>`Model detected an unacceptable ${issueName(issue)} concern in review #${id}; excluded pending source verification.`],
 [/^地图直线距离(\d+)米（非通勤时间）$/,(meters)=>`Map straight-line distance: ${meters} m; not travel time`],
 [/^评分判断采用较新的页面观察：([\d.]+)\/([\d.]+)（(.+)）$/,(score,scale,time)=>`Screening uses the newer page rating: ${score}/${scale}; observed ${time}`],
 [/^模型识别评论问题提及：(.+)（评论(\d+)，([\d-]+)）；需核验原文与房型影响$/,(issue,id,date)=>`Model-detected ${issueName(issue)} mention; review #${id}, ${date}. Verify original wording and room impact.`],
 [/^评论语义待核验：(.+)（评论(\d+)，([\d-]+)）；不能视为问题已排除$/,(issue,id,date)=>`Uncertain ${issueName(issue)} mention; review #${id}, ${date}. Absence is not established.`],
 [/^必须设施尚无证据：(.+)$/,(facility)=>`Required facility lacks evidence: ${facility}`],
 [/^必须设施需重新核验来源、酒店身份与时间：(.+)$/,(facility)=>`Verify facility source, hotel identity and observation time: ${facility}`],
 [/^出现用户明确不可接受的问题：(.+)$/,(issues)=>`Explicitly unacceptable issues: ${issues.split('、').map(issue=>({隔音:'Noise',卫生:'Hygiene',气味:'Odor',维护:'Maintenance',服务:'Service',空间:'Space',安全:'Security'} as Record<string,string>)[issue]??issue).join(', ')}`],
 [/^步行([\d.]+)分钟$/,(n)=>`${n} minutes on foot`],
 [/^授权降级参数内地铁直达([\d.]+)分钟$/,(n)=>`Direct metro: ${n} minutes, within your authorized fallback`],
 [/^原平台评分([\d.]+)，评论(\d+)条$/,(score,count)=>`Original platform rating: ${score}; ${count} reviews`],
 [/^房型展示价¥([\d.]+)，最终费用待复核$/,(price)=>`Displayed room price: ¥${price}; final charges require verification`],
 [/^保持预算，增加公交直达([\d.]+)分钟的授权范围$/,(n)=>`Keep the budget; request consent for a ${n}-minute direct bus route`],
 [/^保持预算，地铁直达上限改为至少([\d.]+)分钟$/,(n)=>`Keep the budget; request a direct metro limit of at least ${n} minutes`],
 [/^预算建议（待重新确认）：(.+)展示估价¥([\d.]+)，比授权上限高¥([\d.]+)；最终含税费用仍待核验，原预算不变$/,(room,price,extra)=>`Budget proposal requiring confirmation: ${room}, display estimate ¥${price}, ¥${extra} above the authorized ceiling. Final tax-inclusive charges remain unverified; the original budget is unchanged.`],
 [/^只读模式；预算([\d.]+)元；不修改购买授权、订单或钱包。$/,(n)=>`Read-only mode; budget ¥${n}. Purchase authority, orders and wallet are unchanged.`],
 [/^最多核验(\d+)家；同名位置不能唯一匹配则保留未知。$/,(n)=>`Verify up to ${n} hotels. Ambiguous same-name locations remain unknown.`]
 ];
 for(const [pattern,render] of patterns){const match=pattern.exec(text);if(match)return render(...match.slice(1));}
 return undefined;
}
