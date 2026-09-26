const TESSERACT_URL='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';

const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const digits=value=>clean(value).replace(/[^0-9]/g,'');

function wordsFromTsv(tsv){
 const lines=String(tsv||'').trim().split(/\r?\n/);if(lines.length<2)return [];
 const headers=lines[0].split('\t');
 return lines.slice(1).map(line=>{const values=line.split('\t'),row=Object.fromEntries(headers.map((key,index)=>[key,values[index]??'']));return {...row,left:Number(row.left),top:Number(row.top),width:Number(row.width),height:Number(row.height),conf:Number(row.conf)};}).filter(word=>word.level==='5'&&clean(word.text)&&Number.isFinite(word.left)&&Number.isFinite(word.top));
}

function groupLines(words){
 const groups=new Map();
 for(const word of words){const key=[word.block_num,word.par_num,word.line_num].join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(word);}
 return [...groups.values()].map(items=>{items.sort((a,b)=>a.left-b.left);return {text:clean(items.map(item=>item.text).join(' ')),left:Math.min(...items.map(item=>item.left)),top:Math.min(...items.map(item=>item.top)),right:Math.max(...items.map(item=>item.left+item.width)),bottom:Math.max(...items.map(item=>item.top+item.height)),confidence:items.reduce((sum,item)=>sum+Math.max(0,item.conf),0)/items.length};}).sort((a,b)=>a.top-b.top||a.left-b.left);
}

export function parseLeaderboardTsv(tsv,{page=1,width,height}){
 const words=wordsFromTsv(tsv),rows=[];
 for(let slot=0;slot<7;slot++){
  const top=height*slot/7,bottom=height*(slot+1)/7;
  const inSlot=words.filter(word=>{const y=word.top+word.height/2;return y>=top&&y<bottom;});
  const rankText=groupLines(inSlot.filter(word=>word.left+word.width/2<width*.19)).map(line=>digits(line.text)).find(value=>value&&Number(value)>0&&Number(value)<10000);
  const scoreText=groupLines(inSlot.filter(word=>word.left+word.width/2>width*.72)).map(line=>digits(line.text)).filter(value=>value.length>=4).sort((a,b)=>b.length-a.length)[0];
  const middle=groupLines(inSlot.filter(word=>{const x=word.left+word.width/2;return x>width*.30&&x<width*.72;})).filter(line=>line.text.length>0);
  const allianceIndex=middle.findIndex(line=>/\[[^\]]{1,12}\]|\b(?:NvSP|UNIi)\b/i.test(line.text));
  const allianceLine=allianceIndex>=0?middle[allianceIndex]:middle.length>1?middle.at(-1):null;
  const nameLine=middle.find((line,index)=>index!==allianceIndex&&line!==allianceLine);
  if(!rankText||!scoreText||!nameLine)continue;
  rows.push({rank:Number(rankText),name:clean(nameLine.text),alliance:clean(allianceLine?.text||''),score:scoreText,page,playerKey:'',playerName:'',playerAlliance:'',playerChecked:false,allianceChecked:false,scoreChecked:false,excluded:false,ocrConfidence:Math.round(Math.min(nameLine.confidence,allianceLine?.confidence??nameLine.confidence))});
 }
 return rows;
}

function cropLeaderboard(image){
 const canvas=document.createElement('canvas'),top=Math.round(image.naturalHeight*.245),bottom=Math.round(image.naturalHeight*.805);
 canvas.width=image.naturalWidth;canvas.height=bottom-top;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,top,image.naturalWidth,canvas.height,0,0,canvas.width,canvas.height);
 const pixels=context.getImageData(0,0,canvas.width,canvas.height);
 for(let i=0;i<pixels.data.length;i+=4){const gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];const value=gray<145?0:gray>205?255:Math.round((gray-145)*255/60);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;}
 context.putImageData(pixels,0,0);return canvas;
}

function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(Error('The private screenshot could not be opened for OCR.'));image.src=url;});}

export async function createLeaderboardOcr(onProgress=()=>{}){
 const module=await import(TESSERACT_URL);
 const {createWorker,PSM}=module.default??module;
 if(typeof createWorker!=='function'||!PSM)throw Error('The OCR library could not initialize. Reload this page and try again.');
 const worker=await createWorker(['eng','vie'],1,{logger:event=>{if(event?.status)onProgress(event.status,Math.round((event.progress||0)*100));}});
 await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,preserve_interword_spaces:'1',user_defined_dpi:'300'});
 return {
  async read(url,page){const image=await loadImage(url),canvas=cropLeaderboard(image),result=await worker.recognize(canvas,{}, {tsv:true});return parseLeaderboardTsv(result.data.tsv,{page,width:canvas.width,height:canvas.height});},
  terminate:()=>worker.terminate()
 };
}
