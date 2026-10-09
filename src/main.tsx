import {AccessGate} from './AccessGate';
import React from 'react';
import {LanguageRoot,t} from './i18n';
import {createRoot} from 'react-dom/client';
import App from './App';
const LiveWorkflow=React.lazy(()=>import('./LiveWorkflow'));
import './styles.css';
import './ui.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><LanguageRoot render={()=><AccessGate>{location.pathname==='/live/workflow'?<React.Suspense fallback={<main role="status">{t('正在载入酒店助手…')}</main>}><LiveWorkflow/></React.Suspense>:<App />}</AccessGate>}/></React.StrictMode>);
