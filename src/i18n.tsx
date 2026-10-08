import {useSyncExternalStore} from 'react';
import {english} from './english';
import {englishCore} from './englishCore';
import {displayEnglish} from '../shared/display-english';
type Language='zh'|'en';
let language:Language=new URLSearchParams(location.search).get('lang')==='en'?'en':new URLSearchParams(location.search).get('lang')==='zh'?'zh':localStorage.getItem('staypilot-language')==='en'?'en':'zh';
const listeners=new Set<()=>void>();
export function t(text:string):string{return language==='en'?((text==='正在载入酒店助手…'?'Loading your hotel assistant…':undefined)??englishCore[text]??english[text]??displayEnglish(text)??text):text;}
function select(next:Language){language=next;localStorage.setItem('staypilot-language',next);document.documentElement.lang=next==='en'?'en':'zh-CN';const url=new URL(location.href);url.searchParams.set('lang',next);history.replaceState(null,'',url);for(const listener of listeners)listener();}
export function LanguageRoot({render}:{render:()=>React.ReactNode}){useSyncExternalStore(cb=>{listeners.add(cb);return()=>{listeners.delete(cb);};},()=>language);document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=language==='en'?'StayPilot · Your stay assistant':'StayPilot · 你的住宿助手';return <><div className="language-switch" aria-label="Language"><button aria-pressed={language==='zh'} onClick={()=>select('zh')}>中文</button><button aria-pressed={language==='en'} onClick={()=>select('en')}>English</button></div>{render()}</>;}

export function pick(zh:string,en:string){return language==='en'?en:zh;}
