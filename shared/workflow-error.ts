/** User-facing guidance only; never changes server state or retries a transaction. */
export function workflowErrorMessage(message:unknown):{zh:string;en:string} {
 const text=typeof message==='string'?message:'';
 if(/服务中断，监控未自动恢复/.test(text))return {zh:'服务中断后监控已停止。请核验当前行程、重新确认查询授权，再手动开启监控。',en:'Monitoring stopped after a service interruption. Check the current trip, confirm query consent again and restart monitoring manually.'};
 if(/免费取消窗口/.test(text))return {zh:'免费取消窗口已结束或无法确认，报价监控已停止。请刷新酒店并重新核验取消条款。',en:'The free cancellation window ended or could not be verified. Quote monitoring stopped; refresh the hotel and verify its cancellation terms.'};
 if(/入住日期或查询条件已失效/.test(text))return {zh:'行程条件已失效，监控已停止。请更新入住日期与偏好，重新确认后开启监控。',en:'Trip conditions are no longer valid and monitoring stopped. Update the stay dates and preferences, confirm again and restart monitoring.'};
 if(/尚未确认只读查询授权|只读查询授权已撤销|只读授权范围/.test(text))return {zh:'只读查询授权尚未确认、已撤销或条件已改变。请回到偏好与授权页面重新确认后继续。',en:'Read-only query consent is missing, was withdrawn or its conditions changed. Return to preferences and authorization to confirm again.'};
 if(/选中报价已变化或复核失败/.test(text))return {zh:'选中报价已变化或本轮复核失败。请先刷新这家酒店、重新评估并选择方案，再启动监控。',en:'The selected quote changed or its recheck failed. Refresh this hotel, reassess and select an option before restarting monitoring.'};
 if(/未配置酒店查询服务/.test(text))return {zh:'实时酒店服务尚未配置。请配置服务端FlyAI或RollingGo凭证；历史回放仍可使用，但不是实时查询。',en:'Live hotel services are not configured. Configure server-side FlyAI or RollingGo credentials. Historical replay remains available, but is not a live search.'};
 if(/过期|15分钟|版本|最新记录|证据已变化|方案已失效|时间无效/.test(text))return {zh:'结果或偏好版本已失效。请刷新酒店或重新查询，再继续核验。',en:'The evidence or preference version is no longer valid. Refresh the hotel or search again before continuing.'};
 if(/本会话没有|会话已关闭/.test(text))return {zh:'当前会话找不到这份记录。请在当前浏览器重新查询。',en:'This record is unavailable in the current session. Search again in this browser.'};
 if(/正在运行|未结束|等待|已有监控/.test(text))return {zh:'当前核验或监控尚未结束。请等待完成；如要更改行程，请先停止监控。',en:'A check or monitor is still active. Wait for it to finish, or stop monitoring before changing the trip.'};
 if(/监控截止/.test(text))return {zh:'监控截止需晚于现在、在24小时内，并包含时区。请调整截止时间。',en:'Choose a monitoring deadline after now and within 24 hours, including a time zone.'};
 if(/入住|退房|日期|晚数/.test(text))return {zh:'请检查入住与退房日期：入住不能早于今天，退房需晚于入住，最多支持28晚。',en:'Check your dates: arrival cannot be before today, departure must be later, and stays are limited to 28 nights.'};
 if(/\"code\"|超出支持范围|超出范围/.test(text))return {zh:'部分输入不符合支持范围。请检查日期、人数、预算与偏好设置后重新确认。',en:'Some inputs are outside the supported limits. Check dates, guests, budget and preferences, then confirm again.'};
 if(/需要调整|重新确认偏好|不在授权|硬底线/.test(text))return {zh:'该方案需要补齐证据或重新确认偏好。请查看取舍卡片中的缺口和条件变化。',en:'This option needs more evidence or confirmed preferences. Review its gaps and changes in the tradeoff card.'};
 if(/真实购买|真实交易|不授权|禁止购买/.test(text))return {zh:'当前连接没有真实购买权限。请打开商户页面核验并自行完成预订。',en:'This connection has no real purchase permission. Open the merchant page to verify and book yourself.'};
 return {zh:'本次请求未完成。请检查服务连接后手动重试；已有记录不代表当前价格或库存。',en:'The request did not complete. Check the connection and retry manually; saved records do not establish current prices or inventory.'};
}
