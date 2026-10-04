const TESSERACT_URL='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';

const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
export const cleanOcrName=value=>clean(value).replace(/(\p{Script=Han})\s+(?=\p{Script=Han})/gu,'$1');
const digits=value=>clean(value).normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0)).replace(/[^0-9]/g,'');

function wordsFromTsv(tsv){
 const lines=String(tsv||'').trim().split(/\r?\n/);if(lines.length<2)return [];
 const hasHeader=lines[0].startsWith('level\t');
 const headers=hasHeader?lines[0].split('\t'):['level','page_num','block_num','par_num','line_num','word_num','left','top','width','height','conf','text'];
 return lines.slice(hasHeader?1:0).map(line=>{const values=line.split('\t'),row=Object.fromEntries(headers.map((key,index)=>[key,values[index]??'']));return {...row,left:Number(row.left),top:Number(row.top),width:Number(row.width),height:Number(row.height),conf:Number(row.conf)};}).filter(word=>word.level==='5'&&clean(word.text)&&Number.isFinite(word.left)&&Number.isFinite(word.top));
}

function groupLines(words){
 const groups=new Map();
 for(const word of words){const key=[word.block_num,word.par_num,word.line_num].join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(word);}
 return [...groups.values()].map(items=>{// TSV word order preserves right-to-left and mixed-script reading order.
 items.sort((a,b)=>Number(a.word_num)-Number(b.word_num));return {text:clean(items.map(item=>item.text).join(' ')),left:Math.min(...items.map(item=>item.left)),top:Math.min(...items.map(item=>item.top)),right:Math.max(...items.map(item=>item.left+item.width)),bottom:Math.max(...items.map(item=>item.top+item.height)),confidence:items.reduce((sum,item)=>sum+Math.max(0,item.conf),0)/items.length};}).sort((a,b)=>a.top-b.top||a.left-b.left);
}

export function parseLeaderboardTsv(tsv,{page=1,width,height,includeSlots=false,bands=null}){
 const words=wordsFromTsv(tsv),rows=[];
 const regions=bands||Array.from({length:7},(_,slot)=>({top:height*slot/7,bottom:height*(slot+1)/7}));
 for(let slot=0;slot<regions.length;slot++){
  const {top,bottom}=regions[slot];
  const inSlot=words.filter(word=>{const y=word.top+word.height/2;return y>=top&&y<bottom;});
  const rankText=groupLines(inSlot.filter(word=>word.left+word.width/2<width*.19)).map(line=>digits(line.text)).find(value=>value&&Number(value)>0&&Number(value)<10000);
  const scoreText=groupLines(inSlot.filter(word=>word.left+word.width/2>width*.72)).map(line=>digits(line.text)).filter(value=>/^\d{1,12}$/.test(value)).sort((a,b)=>b.length-a.length)[0];
  const middle=groupLines(inSlot.filter(word=>{const x=word.left+word.width/2;return x>width*.325&&x<width*.72;})).filter(line=>line.text.length>0);
  const allianceIndex=middle.findIndex(line=>/\[[^\]]{1,12}\]|\b(?:NvSP|UNIi)\b/i.test(line.text));
  const allianceLine=allianceIndex>=0?middle[allianceIndex]:middle.length>1?middle.at(-1):null;
  const nameLine=middle.find((line,index)=>index!==allianceIndex&&line!==allianceLine);
  if(!bands&&!rankText&&scoreText===undefined&&!nameLine)continue;
  rows.push({...includeSlots?{slot,ocrSlot:slot,slotBounds:{top,bottom},nameBounds:nameLine?{left:nameLine.left,top:nameLine.top,right:nameLine.right,bottom:nameLine.bottom}:null}: {},rank:Number(rankText)||0,name:cleanOcrName(nameLine?.text),alliance:clean(allianceLine?.text||''),score:scoreText??'',ocrIncomplete:!nameLine||scoreText===undefined,page,playerKey:'',playerName:'',playerAlliance:'',playerChecked:false,allianceChecked:false,scoreChecked:false,excluded:false,ocrConfidence:Math.round(Math.min(nameLine?.confidence??0,allianceLine?.confidence??nameLine?.confidence??0))});
 }
 return rows;
}

export function recoverRanks(rows,observations){
 // A leaderboard position must be read, never inferred from neighbouring players.
 return rows.map(row=>({...row,rank:row.rank||observations[row.slot]||0}));
}
export function detectLeaderboardBands({width,height,data}){
 const runs=[];let start=null;
 for(let y=Math.floor(height*.15);y<Math.floor(height*.9);y++){
  let hits=0;
  for(const x of [.055,.95,.68]){const i=(y*width+Math.floor(width*x))*4,r=data[i],g=data[i+1],b=data[i+2];if((r>130&&r<240&&b-r>=8&&b-r<65&&g>=r-5&&b>=g)||(r>235&&g>190&&b<140)||(r>235&&g>165&&g<235&&b>145&&b<205))hits++;}
  if(hits>=2){if(start===null)start=y;}else if(start!==null){runs.push({top:start,bottom:y});start=null;}
 }
 if(start!==null)runs.push({top:start,bottom:Math.floor(height*.9)});
 const merged=[];
 for(const run of runs){const last=merged.at(-1);if(last&&run.top-last.bottom<height*.003)last.bottom=run.bottom;else merged.push({...run});}
 const bands=merged.filter(r=>r.bottom-r.top>height*.035&&r.bottom-r.top<height*.12);
 return bands.length>=1&&bands.length<=10?bands:[];
}
function imageLayout(image){
 const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const bands=detectLeaderboardBands(ctx.getImageData(0,0,c.width,c.height));
 if(bands.length){const top=bands[0].top,bottom=bands.at(-1).bottom;return {top,bottom,bands:bands.map(b=>({top:b.top-top,bottom:b.bottom-top})),uncertain:false};}
 const top=Math.round(image.naturalHeight*.245),bottom=Math.round(image.naturalHeight*.805);return {top,bottom,bands:Array.from({length:7},(_,i)=>({top:(bottom-top)*i/7,bottom:(bottom-top)*(i+1)/7})),uncertain:true};
}
function rankCanvas(image,layout){
 const canvas=document.createElement('canvas'),top=layout.top,bottom=layout.bottom;canvas.width=Math.round(image.naturalWidth*.19)*2;canvas.height=(bottom-top)*2;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,top,canvas.width/2,bottom-top,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);
 for(let i=0;i<data.data.length;i+=4){const value=Math.min(data.data[i],data.data[i+1],data.data[i+2])>225?0:255;data.data[i]=data.data[i+1]=data.data[i+2]=value;}ctx.putImageData(data,0,0);return canvas;
}
function cropLeaderboard(image,enhance=false,layout){
 const canvas=document.createElement('canvas'),top=layout.top,bottom=layout.bottom;
 canvas.width=image.naturalWidth;canvas.height=bottom-top;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,top,image.naturalWidth,canvas.height,0,0,canvas.width,canvas.height);
 if(!enhance)return canvas;
 const pixels=context.getImageData(0,0,canvas.width,canvas.height);
 for(let i=0;i<pixels.data.length;i+=4){const gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];const value=(i/4)%canvas.width<canvas.width*.19?(gray>240?0:255):gray<145?0:gray>205?255:Math.round((gray-145)*255/60);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;}
 context.putImageData(pixels,0,0);return canvas;
}

function nameCanvas(image,slot,bounds,layout){
 const top=layout.top,band=layout.bands[slot],rowHeight=band.bottom-band.top;
 const x=bounds?Math.max(image.naturalWidth*.32,bounds.left-6):image.naturalWidth*.327;
 const y=bounds?Math.max(0,bounds.top-6):band.top+rowHeight*.16;
 const width=bounds?Math.min(image.naturalWidth*.74-x,bounds.right+6-x):image.naturalWidth*.413;
 const height=bounds?bounds.bottom+6-y:rowHeight*.42;
 const canvas=document.createElement('canvas');
 canvas.width=Math.round(width*3);canvas.height=Math.round(height*3);
 // Isolate the name line at original colour: thresholding can erase fine CJK strokes.
 const ctx=canvas.getContext('2d');ctx.drawImage(image,x,top+y,width,height,0,0,canvas.width,canvas.height);return canvas;
}

function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(Error('The private screenshot could not be opened for OCR.'));image.src=url;});}

export async function createLeaderboardOcr(onProgress=()=>{}){
 const module=await import(TESSERACT_URL);
 const {createWorker,PSM}=module.default??module;
 if(typeof createWorker!=='function'||!PSM)throw Error('The OCR library could not initialize. Reload this page and try again.');
 let nameWorker,arabicWorker,detailWorker;
 const worker=await createWorker(['eng','vie','ara','chi_sim','chi_tra','jpn','kor'],1,{logger:event=>{if(event?.status)onProgress(event.status,Math.round((event.progress||0)*100));}});
 await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,preserve_interword_spaces:'1',user_defined_dpi:'300'});
 return {
  async read(url,page){
   const image=await loadImage(url),layout=imageLayout(image),canvas=cropLeaderboard(image,false,layout),result=await worker.recognize(canvas,{}, {tsv:true});let rows=parseLeaderboardTsv(result.data.tsv,{page,width:canvas.width,height:canvas.height,includeSlots:true,bands:layout.bands});
   // Use original pixels first. A contrast pass is only additional evidence.
   const contrast=cropLeaderboard(image,true,layout),contrastResult=await worker.recognize(contrast,{}, {tsv:true});
   const other=parseLeaderboardTsv(contrastResult.data.tsv,{page,width:contrast.width,height:contrast.height,includeSlots:true,bands:layout.bands});
   rows=combinePageReadings(rows,other);
   if(rows.some(row=>!row.rank)){
    onProgress('Reading leaderboard positions',0);const ranks=rankCanvas(image,layout),observations={};
    try{await worker.setParameters({tessedit_char_whitelist:'0123456789',tessedit_pageseg_mode:PSM.SPARSE_TEXT});const pass=await worker.recognize(ranks,{}, {tsv:true});
     for(const word of wordsFromTsv(pass.data.tsv)){const n=Number(digits(word.text)),slot=layout.bands.findIndex(b=>(word.top+word.height/2)/2>=b.top&&(word.top+word.height/2)/2<b.bottom);if(word.conf>=65&&n>0&&n<=10000&&slot>=0&&slot<layout.bands.length)observations[slot]=observations[slot]===undefined?n:0;}
     rows=recoverRanks(rows,observations);
    }finally{await worker.setParameters({tessedit_char_whitelist:'',tessedit_pageseg_mode:PSM.SPARSE_TEXT});}
   }
   // Read every name in isolation, including names the page pass misread as Latin.
   detailWorker??=await createWorker(['eng','vie','ara','chi_tra','chi_sim','jpn','kor'],1);
   await detailWorker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,preserve_interword_spaces:'0',user_defined_dpi:'300'});
   for(const row of rows){
    onProgress('Reading individual names',Math.round(row.slot/rows.length*100));
    const pass=await detailWorker.recognize(nameCanvas(image,row.slot,row.nameBounds,layout)),name=cleanOcrName(pass.data.text);
    recordNameReading(row,name,pass.data.confidence);
   }
   const arabicRows=rows.filter(row=>[row.name,...(row.ocrAlternatives||[])].some(n=>/\p{Script=Arabic}/u.test(n)));
   if(arabicRows.length){
    arabicWorker??=await createWorker(['ara'],1);
    await arabicWorker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,preserve_interword_spaces:'0',user_defined_dpi:'300'});
    for(const row of arabicRows){
     const pass=await arabicWorker.recognize(nameCanvas(image,row.slot,row.nameBounds,layout)),name=cleanOcrName(pass.data.text);
     recordNameReading(row,name,pass.data.confidence);
    }
   }
   const chineseRows=rows.filter(row=>[row.name,...(row.ocrAlternatives||[])].some(n=>/\p{Script=Han}/u.test(n)));
   if(chineseRows.length){
    nameWorker??=await createWorker(['chi_tra','chi_sim','eng','vie'],1);
    await nameWorker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,preserve_interword_spaces:'0',user_defined_dpi:'300'});
    for(const row of chineseRows){
     onProgress('Reading Chinese name closely',Math.round(row.slot/rows.length*100));
     const pass=await nameWorker.recognize(nameCanvas(image,row.slot,row.nameBounds,layout)),name=cleanOcrName(pass.data.text);
     recordNameReading(row,name,pass.data.confidence);
    }
   }
   return rows.map(({slot,nameBounds,slotBounds,...row})=>({...row,ocrSlot:slot,layoutUncertain:layout.uncertain}));
  },
  terminate:()=>Promise.all([worker.terminate(),nameWorker?.terminate(),arabicWorker?.terminate(),detailWorker?.terminate()])
 };
}

export function recordNameReading(row,name,confidence){
 if(!name||confidence<40)return;
 row.ocrAlternatives=[...new Set([...(row.ocrAlternatives||[]),name])].filter(n=>n!==row.name);
 if(row.ocrAlternatives.length)row.ocrNeedsReview=true;
}
export function combinePageReadings(original,contrast){
 const rows=original.map(r=>({...r,ocrAlternatives:[...(r.ocrAlternatives||[])]}));
 for(const other of contrast){
  const row=rows.find(r=>r.slot===other.slot);
  if(!row){rows.push({...other,ocrNeedsReview:true});continue;}
  recordNameReading(row,other.name,other.ocrConfidence);
  if(!row.name&&other.name)row.ocrAlternatives=[...new Set([...(row.ocrAlternatives||[]),other.name])];
  if(row.score!==other.score){row.ocrNeedsReview=true;row.ocrScoreConflict=true;row.ocrScoreAlternatives=[...new Set([...(row.ocrScoreAlternatives||[]),other.score].filter(v=>v!==''))];}
  if(row.rank!==other.rank){row.ocrNeedsReview=true;row.ocrRankConflict=true;row.ocrRankAlternatives=[...new Set([...(row.ocrRankAlternatives||[]),other.rank])];}

 }
 return rows.sort((a,b)=>a.slot-b.slot);
}
