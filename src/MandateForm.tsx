import {t as uiText} from './i18n';
import {useEffect, useState, type FormEvent} from 'react';
import type {Mandate, State, Issue, Downgrade} from '../shared/types';
import {ISSUE_LABELS, money, simTime} from '../shared/types';
import {preserveHardFloors} from '../shared/workflow';
import {Glyph, Pill} from './ui-components';

type Props = {
  state: State;
  busy: boolean;
  act: (path: string, body: unknown, success?: string) => Promise<any>;
  safeAct: (path: string, body: unknown, success?: string) => void;
  focus?: 'all' | 'trip' | 'preferences';
  onSaved?: (confirmed: boolean) => void;
};
const issues = Object.keys(ISSUE_LABELS) as Issue[];
const relaxations: Record<Downgrade, {title: string; description: string}> = {
  distance: {title: '离目的地稍远一点', description: '步行范围外，接受地铁直达'},
  opening: {title: '接受开业较早的酒店', description: '放宽所选开业或翻新年份'},
  rating: {title: '接受评分稍低的酒店', description: '先看差评原因，仍须达到最低评分'},
  window: {title: '接受无窗房间', description: '仅在窗型要求允许时生效'},
};
const dateInput = (value: number) => Number.isFinite(value) ? new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(value)).replace(' ', 'T') : '';
const dateValue = (value: string) => new Date(value + ':00+08:00').getTime();
const draftTime = (value: number) => Number.isFinite(value) ? simTime(value) : '请填写时间';

export default function MandateForm({state, busy, act, safeAct, focus = 'all', onSaved}: Props) {
  const [draft, setDraft] = useState<Mandate>(structuredClone(state.mandate));
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [natural, setNatural] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState('');
  const trip = focus !== 'preferences';
  const preferences = focus !== 'trip';

  useEffect(() => {
    setDraft(structuredClone(state.mandate));
    setSaved(false);
    setConsent(false);
  }, [state.mandate.id, state.mandate.version]);
  const set = <K extends keyof Mandate>(key: K, value: Mandate[K]) => {
    setDraft(d => ({...d, [key]: value}));
    setSaved(false);
    setConsent(false);
  };
  const facility = (name: string, mode: string) => {
    setDraft(d => ({...d,
      requiredAmenities: [...d.requiredAmenities.filter(a => a !== name), ...(mode === 'required' ? [name] : [])],
      preferredAmenities: [...d.preferredAmenities.filter(a => a !== name), ...(mode === 'preferred' ? [name] : [])],
    }));
    setSaved(false);
    setConsent(false);
  };
  const reorder = (index: number, direction: number) => {
    const order = [...draft.downgradeOrder];
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    set('downgradeOrder', order);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const {id, version, confirmed, revoked, ...patch} = draft;
    const confirm = preferences && consent;
    try {
      const result = await act('/api/mandate', {patch, confirm}, confirm ? '偏好与授权已确认，可以开始查找并预订酒店' : '行程与偏好草稿已保存');
      if (result.mandate) setDraft(result.mandate);
      setSaved(true);
      setConsent(false);
      onSaved?.(confirm);
    } catch {}
  };
  const interpret = async () => {
    setInterpreting(true);
    try {
      const result = await act('/api/mandate/interpret', {text: natural});
      setDraft(d => ({...d, ...preserveHardFloors(result.patch, d), issueWeights: {...d.issueWeights, ...result.patch?.issueWeights}}));
      setSaved(false);
      setConsent(false);
      setInterpretation(result.explanation || '已填入下方，请核对后确认。');
    } catch {} finally {setInterpreting(false);}
  };

  return <form className={'mandate-form redesigned-form focus-' + focus} onSubmit={submit} onInvalidCapture={event => {
    if (event.target instanceof HTMLElement) {
      let parent = event.target.parentElement;
      while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
    }
  }}>
    {preferences && state.mandate.confirmed && !state.mandate.revoked && <div className="authorization-note compact-note"><Glyph name="shield"/><div><strong>{uiText("当前授权有效")}</strong><p>{uiText("修改后需要重新确认；撤销授权会保留已有住宿。")}</p></div><button type="button" className="text-button" disabled={busy} onClick={() => safeAct('/api/revoke', {}, '授权已撤销；已有住宿保留')}>{uiText("撤销授权")}</button></div>}

    {preferences && <details className="panel preference-assistant"><summary><span><Glyph name="search"/>{uiText("用一句话填写偏好")}</span><small>{uiText("可选 · 帮你整理成下方设置")}</small></summary><div className="disclosure-content"><label>{uiText("描述你的住宿需求")}<textarea rows={3} value={natural} onChange={e => setNatural(e.target.value)} placeholder={uiText("例如：预算500元，步行15分钟内，隔音不能差；预算不足时先放宽开业年份。")}/></label><div className="natural-actions"><span role="status">{interpretation || uiText("提取结果是草稿，请核对后再确认授权。")}</span><button type="button" className="btn" disabled={busy || interpreting || !natural.trim()} onClick={() => void interpret()}>{interpreting ? uiText("正在整理…"): uiText("帮我填写")}<Glyph name="arrow"/></button></div></div></details>}

    <div className={focus === 'trip' ? 'trip-setup-layout' : 'setup-stack'}>
      <div className="setup-fields">
        {trip && <section className="panel trip-fields">
          <div className="section-heading"><div><h2>{uiText("这次想住在哪里？")}</h2><p className="hint">{uiText("以主要目的地为中心，帮你找到合适的住宿。")}</p></div><Glyph name="hotel"/></div>
          <div className="form-grid">
            <label className="span-2">{uiText("主要目的地")}<input value={draft.destination} placeholder={uiText("景点、办公地点或具体地址")} required onChange={e => set('destination', e.target.value)}/></label>
            <label>{uiText("入住日期")}<input type="date" required value={draft.checkIn} onChange={e => set('checkIn', e.target.value)}/></label>
            <label>{uiText("退房日期")}<input type="date" required value={draft.checkOut} min={draft.checkIn} onChange={e => set('checkOut', e.target.value)}/></label>
            <label>{uiText("入住人数")}<input type="number" min="1" max="4" required value={draft.guests} onChange={e => set('guests', Number(e.target.value))}/></label>
            <label>{uiText("房间数量")}<input type="number" min="1" max="2" required value={draft.rooms} onChange={e => set('rooms', Number(e.target.value))}/></label>
            <label className="span-2">{uiText("想住的房型")}<select value={draft.roomType} onChange={e => set('roomType', e.target.value)}>{[...new Set([draft.roomType, ...state.hotels.map(h => h.roomType)])].map(room => <option key={room} value={room}>{uiText(room)}</option>)}</select></label>
            <label className="span-2 budget-field">{uiText("住宿总预算（元）")}<div className="currency-input"><span>¥</span><input type="number" min="1" max="100000" required value={draft.budgetCents / 100} onChange={e => set('budgetCents', Math.round(Number(e.target.value) * 100))}/></div><small>{uiText("全部房间、全部晚数的含税预算，包含累计不可退费用。")}</small></label>
          </div>
          <details className="inline-settings"><summary>{uiText("换订时的资金上限")}<span>{money(draft.peakCents)}</span></summary><div className="disclosure-content"><label>{uiText("临时占款上限（元）")}<input type="number" min="1" max="200000" required value={draft.peakCents / 100} onChange={e => set('peakCents', Math.round(Number(e.target.value) * 100))}/><small>{uiText("换订时新旧订单和未到账退款会同时占款。此上限与住宿预算、钱包余额分别审核。")}</small></label></div></details>
        </section>}

        {preferences && <>
          <section className="panel preference-fields">
            <div className="section-heading"><div><h2>{uiText("什么样的酒店更适合你？")}</h2><p className="hint">{uiText("先设置理想条件，预算不足时再按你的顺序放宽。")}</p></div><Pill>{uiText("你的入住偏好")}</Pill></div>
            <div className="form-grid">
              <label>{uiText("期望步行上限（分钟）")}<input type="number" min="1" max="120" required value={draft.walkMax} onChange={e => set('walkMax', Number(e.target.value))}/></label>
              <label>{uiText("接受地铁上限（分钟）")}<input type="number" min="1" max="180" required value={draft.metroMax} onChange={e => set('metroMax', Number(e.target.value))}/></label>
              <label>{uiText("期望评分（5分制）")}<input type="number" min="1" max="5" step="0.1" required value={draft.minScore} onChange={e => set('minScore', Number(e.target.value))}/></label>
              <label>{uiText("最低可接受评分")}<input type="number" min="1" max="5" step="0.1" required value={draft.floorScore} onChange={e => set('floorScore', Number(e.target.value))}/></label>
              <label>{uiText("酒店新旧按什么看？")}<select value={draft.newnessBasis} onChange={e => set('newnessBasis', e.target.value as Mandate['newnessBasis'])}><option value="opening">{uiText("开业年份")}</option><option value="renovation">{uiText("翻新年份")}</option><option value="either">{uiText("开业或翻新年份")}</option></select></label>
              <label>{uiText("期望年份不早于")}<input type="number" min="1900" max="2026" required value={draft.openingMin} onChange={e => set('openingMin', Number(e.target.value))}/></label>
              <label className="span-2">{uiText("房间窗型")}<select value={draft.windowPreference} onChange={e => set('windowPreference', e.target.value as Mandate['windowPreference'])}><option value="required">{uiText("必须有窗，不能放宽")}</option><option value="preferred">{uiText("有窗优先，允许按顺序放宽")}</option><option value="any">{uiText("有窗、无窗都可以")}</option></select></label>
            </div>
          </section>
          <section className="panel relaxation-panel">
            <div className="section-heading"><div><h2>{uiText("预算不够，先放宽哪一项？")}</h2><p className="hint">{uiText("从上往下尝试。调整顺序，让智能体按你的取舍寻找酒店。")}</p></div><Glyph name="arrow"/></div>
            <div className="downgrade-list">{draft.downgradeOrder.map((item, index) => <div key={item}><span className="rank">{index + 1}</span><div className="relaxation-copy"><strong>{uiText(relaxations[item].title)}</strong><small>{uiText(relaxations[item].description)}</small></div><button type="button" aria-label={uiText("上移") + uiText(relaxations[item].title)} disabled={index === 0} onClick={() => reorder(index, -1)}>↑</button><button type="button" aria-label={uiText("下移") + uiText(relaxations[item].title)} disabled={index === draft.downgradeOrder.length - 1} onClick={() => reorder(index, 1)}>↓</button></div>)}</div>
            {draft.windowPreference === 'preferred' && !draft.downgradeOrder.includes('window') && <button type="button" className="text-button" onClick={() => set('downgradeOrder', [...draft.downgradeOrder, 'window'])}>{uiText("＋ 允许最后尝试无窗房")}</button>}
            {draft.downgradeOrder.includes('window') && <button type="button" className="text-button" onClick={() => set('downgradeOrder', draft.downgradeOrder.filter(item => item !== 'window'))}>{uiText("移除无窗房的放宽许可")}</button>}
            <p className="hint">{uiText("必须有窗、必须设施和不能接受的评论问题始终是底线。")}</p>
          </section>
          <section className="panel review-preferences">
            <div className="section-heading"><div><h2>{uiText("这些入住问题，你有多在意？")}</h2><p className="hint">{uiText("勾选“不能接受”会直接排除。其他问题可设重要程度：0 不在意，5 非常在意。")}</p></div><Glyph name="shield"/></div>
            <div className="issue-preference-grid">{issues.map(issue => <div className={'issue-preference ' + (draft.forbiddenIssues.includes(issue) ? 'is-required' : '')} key={issue}><div><strong>{uiText(ISSUE_LABELS[issue])}</strong><label className="checkbox-label"><input type="checkbox" checked={draft.forbiddenIssues.includes(issue)} onChange={e => set('forbiddenIssues', e.target.checked ? [...draft.forbiddenIssues, issue] : draft.forbiddenIssues.filter(item => item !== issue))}/>{uiText("不能接受")}</label></div><label className="weight-label">{uiText("重要程度")}<input type="range" aria-label={uiText(ISSUE_LABELS[issue]) + uiText("重要程度")} min="0" max="5" step="1" value={draft.issueWeights[issue]} onChange={e => set('issueWeights', {...draft.issueWeights, [issue]: Number(e.target.value)})}/><output>{draft.issueWeights[issue]}</output></label></div>)}</div>
          </section>
          <details className="panel advanced-preferences"><summary><span>{uiText("设施要求")}</span><small>{draft.requiredAmenities.length ? draft.requiredAmenities.length + uiText(" 项必须满足"): uiText("洗衣、停车、健身等")}</small></summary><div className="disclosure-content facility-preferences">{[...new Set(["自助洗衣", "免费停车", "健身房", "行李寄存", ...draft.requiredAmenities, ...draft.preferredAmenities])].map(name => <label key={name}>{uiText(name)}<select value={draft.requiredAmenities.includes(name) ? 'required' : draft.preferredAmenities.includes(name) ? 'preferred' : 'any'} onChange={e => facility(name, e.target.value)}><option value="any">{uiText("不要求")}</option><option value="preferred">{uiText("有的话更好")}</option><option value="required">{uiText("必须满足，不能放宽")}</option></select></label>)}<p className="hint">{uiText("设施信息需要核验，信息未知时不能按满足处理。")}</p></div></details>
          <details className="panel advanced-preferences"><summary><span>{uiText("预订与价格监控设置")}</span><small>{uiText("截止时间、取消权限、换订门槛")}</small></summary><div className="disclosure-content"><div className="form-grid">
            <label>{uiText("首次预订截止（上海时间）")}<input type="datetime-local" value={dateInput(draft.firstDeadline)} required onChange={e => set('firstDeadline', dateValue(e.target.value))}/></label>
            <label>{uiText("价格监控截止（上海时间）")}<input type="datetime-local" value={dateInput(draft.optimizeUntil)} required onChange={e => set('optimizeUntil', dateValue(e.target.value))}/></label>
            <label className="span-2">{uiText("授权有效期（上海时间）")}<input type="datetime-local" value={dateInput(draft.expiresAt)} required onChange={e => set('expiresAt', dateValue(e.target.value))}/></label>
            <label>{uiText("换订至少净省（元）")}<input type="number" min="0" max="10000" value={draft.minSavingsCents / 100} required onChange={e => set('minSavingsCents', Math.round(Number(e.target.value) * 100))}/></label>
            <label>{uiText("同时至少省旧单金额的（%）")}<input type="number" min="0" max="100" value={draft.minSavingsPercent} required onChange={e => set('minSavingsPercent', Number(e.target.value))}/></label>
          </div><label className="checkbox-label nonrefund-option"><input type="checkbox" checked={draft.allowNonrefundable} onChange={e => set('allowNonrefundable', e.target.checked)}/><span><strong>{uiText("允许自动购买不可取消房")}</strong><small>{uiText("预订后不能退款换订，默认关闭。")}</small></span></label><p className="hint">{uiText("换订需同时满足两个节省门槛，质量不能变差；先订新、再退旧，退款到账前不重复换订。")}</p></div></details>
        </>}
      </div>
      {focus === 'trip' && <aside className="trip-guide"><div className="trip-guide-photo"><img src="/assets/hotel-warm.jpg" alt={uiText("住宿场景")}/><span>{uiText("让每一次入住，都更合心意。")}</span></div><div className="trip-guide-body"><span className="section-kicker">{uiText("为你安排，按你取舍")}</span><h3>{uiText("好住，也在预算之内。")}</h3><div className="guide-feature"><Glyph name="shield"/><div><strong>{uiText("你的底线，优先满足")}</strong><p>{uiText("卫生、隔音、有窗等要求，由你决定。")}</p></div></div><div className="guide-feature"><Glyph name="search"/><div><strong>{uiText("跨平台比较，少一点纠结")}</strong><p>{uiText("结合评论与总价，给你首选和备选。")}</p></div></div><div className="guide-feature"><Glyph name="clock"/><div><strong>{uiText("订好之后，继续留意价格")}</strong><p>{uiText("在可取消的期限内，寻找更省的方案。")}</p></div></div><div className="guide-budget"><span>{uiText("本次住宿总预算")}</span><strong>{money(draft.budgetCents)}</strong></div><small className="hint">{uiText("当前为仿真体验，使用测试酒店与测试资金。")}</small></div></aside>}
    </div>

    {preferences && <section className="authorization-recap"><div><Glyph name="shield"/><strong>{uiText("确认前，再看一眼")}</strong></div><div className="recap-items"><span>{uiText("住宿总预算")}<b>{money(draft.budgetCents)}</b></span><span>{uiText("取消要求")}<b>{draft.allowNonrefundable ? uiText("允许不可取消房"): uiText("只订可取消房")}</b></span><span>{uiText("首次预订截止")}<b>{draftTime(draft.firstDeadline)}</b></span><span>{uiText("资金占用上限")}<b>{money(draft.peakCents)}</b></span><span>{uiText("换订至少净省")}<b>{money(draft.minSavingsCents)}{uiText("且")}{draft.minSavingsPercent}%</b></span><span>{uiText("价格监控截止")}<b>{draftTime(draft.optimizeUntil)}</b></span><span>{uiText("不能接受")}<b>{draft.forbiddenIssues.length ? draft.forbiddenIssues.map(issue => uiText(ISSUE_LABELS[issue])).join('、') : uiText("未设置评论底线")}</b></span></div></section>}
    <div className="authorization-submit">
      {preferences ? <label className="checkbox-label consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span><strong>{uiText("我确认以上设置，授权智能体使用测试资金自动预订与换订。")}</strong><small>{uiText("超出预算或底线时会停止购买；修改授权需要重新确认。")}</small></span></label> : <span className="form-save-note"><Glyph name="shield"/>{uiText("先保存行程，下一步确认偏好与授权")}</span>}
      <div><span role="status">{saved ? uiText("已保存"): ''}</span><button className="btn primary" disabled={busy}>{busy ? uiText("正在保存…"): focus === 'trip' ? uiText("保存行程，下一步"): consent ? uiText("确认授权并保存"): uiText("保存偏好草稿")}<Glyph name="arrow"/></button></div>
    </div>
  </form>;
}
