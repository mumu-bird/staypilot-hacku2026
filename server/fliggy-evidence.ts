import type {ReviewIssue} from '../shared/real-agent.ts';
// These are dated browser observations, not a live review API or generated testimonials.
export const fliggyEvidence={
 hotelId:'72547102',hotelName:'汉庭杭州黄龙文三路酒店',observedOn:'2026-10-04',
 sourceUrl:'https://hotel.fliggy.com/hotel_detail2.htm?shid=72547102&checkIn=2026-11-06&checkOut=2026-11-08#hotel-review',
 openingYear:2022,renovationYear:2022,webScore:'5.0',apiScore:'4.00',reviewCount:218,negativeTabCount:10,
 warning:'差评标签中有一条内容为正面；星级显示与差评标签矛盾。样本较旧、来自定向差评筛选，比例不是全部住客的问题发生率。同昵称不能证明同一人，但两条同日投诉可能重复。',
 selectedReviews:[
  {date:'2023-08-29',summary:'投诉装修气味、电梯维修时外部楼梯体验、停车、房间空间及楼上冲水声；甲醛是住客推测，未检测核验。',issues:['smell','maintenance','service','space','noise'],excerpt:'房间小'},
  {date:'2025-07-02',summary:'认为房间空间过小。',issues:['space'],excerpt:null},
  {date:'2025-08-03',summary:'选错入住日期后对未到店入住处理和沟通提出异议；不据此认定酒店违法或当前政策。',issues:['service'],excerpt:null},
  {date:'2023-11-16',summary:'投诉深夜敲门带来不安，事件原因未知。',issues:['security'],excerpt:null},
  {date:'2023-08-29',summary:'投诉空间、噪音及性价比；与第一条同昵称同日，存在重复样本可能。',issues:['space','noise'],excerpt:null},
  {date:'2023-05-08',summary:'投诉床品污渍和破损、道路噪音与浴室空间；附图需回源核验。',issues:['hygiene','maintenance','space','noise'],excerpt:'窗户不隔音'},
  {date:'2023-11-26',summary:'投诉清洁、隔音及服务；附图需回源核验。',issues:['hygiene','noise','service'],excerpt:null},
  {date:'2023-04-12',summary:'认可位置，认为设施陈旧。',issues:['maintenance'],excerpt:null},
  {date:'2024-11-20',summary:'对中午退房要求、态度及网络订房待遇提出异议。',issues:['service'],excerpt:null},
  {date:'2023-11-08',summary:'简短正面评价出现在差评筛选中，标签与内容不一致。',issues:[],excerpt:null},
 ] as {date:string;summary:string;issues:ReviewIssue[];excerpt:string|null}[],
 positiveEvidence:[{date:'2026-10-01',summary:'认可卫生、设施、服务及交通。'},{date:'2026-06-29',summary:'认可地铁可达性及工作人员及时帮助。'},{date:'2026-09-27',summary:'觉得空间小，但认可前台态度。'}],
 observedRoom:{checkIn:'2026-11-06',checkOut:'2026-11-08',room:'高级大床房',bed:'1.8米大床',area:'14–18平方米',seller:'华住酒店官方旗舰店',displayPrice:'¥281',cancellation:'2026-11-05 18:00（上海时间）前免费取消，之后不可取消，未入住收取全额费用。',unknown:['餐食','最终含税总价','取消后的实际到账时间'],transactionEligible:false},
};
export function reviewAssessment(profile:'sensitive'|'flexible'){
 const weights:Record<ReviewIssue,number>=profile==='sensitive'?{noise:3,hygiene:3,smell:3,maintenance:1,service:1,space:1,security:3}:{noise:1,hygiene:3,smell:2,maintenance:1,service:1,space:.2,security:3};
 const unacceptable:ReviewIssue[]=profile==='sensitive'?['noise','hygiene','smell']:['hygiene'];
 const n=fliggyEvidence.selectedReviews.length;
 const rows=(Object.keys(weights) as ReviewIssue[]).map(issue=>{const count=fliggyEvidence.selectedReviews.filter(r=>r.issues.includes(issue)).length;return {issue,count,sampleSize:n,weight:weights[issue],contribution:count/n*weights[issue]};});
 return {profile,rows,risk:rows.reduce((sum,r)=>sum+r.contribution,0),excludedBy:rows.filter(r=>r.count>0&&unacceptable.includes(r.issue)).map(r=>r.issue),scope:'仅供展示的用户容忍度示例：将历史报告作为不可接受问题；不是实际预订授权，也不是整体住客风险概率。',transactionEligible:false};
}
