import {t as uiText} from './i18n';
import type {ReactNode} from 'react';
import type {Quote, Review} from '../shared/types';
import {ISSUE_LABELS, simTime} from '../shared/types';

export function Glyph({name}:{name:string}){const paths:Record<string,ReactNode>={home:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,shield:<><path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,hotel:<><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 21v-5h6v5M8 8h1m6 0h1M8 12h1m6 0h1"/></>,log:<><path d="M6 3h12a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M9 7h7M9 11h7M9 15h4"/></>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,check:<path d="m5 12 4 4L19 6"/>,search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,external:<><path d="M14 3h7v7m-7 0 7-7"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></>,wallet:<><path d="M20 7H5a2 2 0 0 1 0-4h13v4M4 7v12a2 2 0 0 0 2 2h14V7"/><path d="M15 11h6v6h-6z"/></>};return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.arrow}</svg>;}

export function Pill({children,tone='neutral'}:{children:ReactNode;tone?:string}){return <span className={'pill '+tone}>{typeof children==='string'?uiText(children):children}</span>}

export function Policy({quote}:{quote:Quote}){return quote.cancellation==='nonrefundable'?<Pill tone="amber">{uiText("不可取消")}</Pill>:<Pill tone="green">{quote.cancelUntil?simTime(quote.cancelUntil):uiText("指定期限")}{uiText("前免费取消")}</Pill>}

export function ReviewView({review}:{review:Review}){return <article className="review" data-review={JSON.stringify(review)}><div className="review-head"><span className="avatar">{review.author.slice(0,1)}</span><strong>{review.author}</strong><span>{review.date}</span><Pill>{review.score}{uiText("分")}</Pill></div><p>{review.text}</p><div className="chips">{review.issues.map(i=><Pill key={i} tone="amber">{uiText(ISSUE_LABELS[i])}</Pill>)}{review.positive.map(i=><Pill key={i} tone="green">{i}</Pill>)}</div></article>}
