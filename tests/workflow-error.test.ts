import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workflowErrorMessage} from '../shared/workflow-error.ts';
test('workflow errors give actionable bilingual guidance without exposing raw response contents',()=>{
 assert.match(workflowErrorMessage('尚未配置酒店查询服务').en,/not a live search/);
 assert.match(workflowErrorMessage('证据版本已变化').en,/Refresh/);
 assert.match(workflowErrorMessage('本会话没有该核验记录').zh,/当前浏览器/);
 assert.match(workflowErrorMessage('请等待当前核验完成').en,/Wait/);
 assert.match(workflowErrorMessage('监控截止须带时区').en,/24 hours/);
 assert.match(workflowErrorMessage('[{"code":"custom","path":["minimumRating"]}]').en,/inputs/);
 assert.match(workflowErrorMessage('当前禁止真实购买').zh,/没有真实购买权限/);
 const unknown=workflowErrorMessage('upstream stack trace with private response');
 assert(!unknown.en.includes('private'));assert.match(unknown.en,/retry manually/);
});

test('monitor recovery guidance explains interruption and cancellation in both languages without claiming automatic recovery',()=>{
 const interrupted=workflowErrorMessage('服务中断，监控未自动恢复；请核验当前行程后重新开启。');
 assert.match(interrupted.en,/confirm query consent again/);assert.match(interrupted.en,/manually/);
 assert.match(workflowErrorMessage('免费取消窗口已结束或无法确认，停止该报价监控；请重新核验。').en,/verify its cancellation terms/);
 assert.match(workflowErrorMessage('本轮核验期间免费取消窗口已结束，停止该报价监控；请重新核验。').en,/monitoring stopped/);
 assert.match(workflowErrorMessage('入住日期或查询条件已失效，监控已停止；请更新行程。').en,/Update the stay dates/);
});
