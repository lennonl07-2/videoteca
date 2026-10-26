import {normalize} from './matching.js';
export function language(value){
 const s=normalize(value||'');
 if(/^(es[-_](419|mx|ar|cl|co|pe)|latino|espanol latino|spanish latin)/.test(s))return 'es-419';
 if(/^(es[-_]es|castellano)/.test(s))return 'es-ES';
 if(/^(es|spa|spanish|espanol)(\b|_)/.test(s))return 'es';
 if(/^(en|eng|english)(\b|_)/.test(s))return 'en';
 if(/^(pt|por|portugu)/.test(s))return 'pt';if(/^(fr|fra|fre|french)/.test(s))return 'fr';return 'und';
}
export function declaredLanguage(value,title=''){
 const known=language(value);if(known!=='und')return known;
 const s=normalize(title);
 if(/\b(?:latino|latina|latam)\b/.test(s))return 'es-419';
 if(/\bcastellano\b/.test(s))return 'es-ES';if(/\bespanol\b/.test(s))return 'es';
 if(/\benglish\b|\baudio ingles\b/.test(s))return 'en';return 'und';
}
export const languageRank=value=>/^es(?:-|$)/.test(value)?0:value==='und'?1:2;
export const matchesLanguage=(selected,value)=>selected==='all'||selected===value||(selected==='es'&&/^es(?:-|$)/.test(value));
