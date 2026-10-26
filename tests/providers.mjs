import {body} from '../lib/network.mjs';
import {parseBrave,discover} from '../lib/discovery.mjs';
try{
 const html=await body('https://search.brave.com/search?q=backyardigans+site%3Adrive.google.com&source=web',false);
 console.log('Brave HTML',html.length,'results',parseBrave(html,'drive').length,'title',html.match(/<title>(.*?)<\/title>/)?.[1]);
}catch(e){console.log('Brave connection error:',e.message);}
for(const source of ['drive','mega']){
 const d=await discover('backyardigans',1,source);console.log(source,d.items.length,d.items.slice(0,3).map(x=>({title:x.title,url:x.pageUrl})));
}
