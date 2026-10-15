import {wordsFromTsv,readRegistrationRows,mergeRegistrationRows} from './storm-registration-core.js?v=registration-20261014';
const load=(el,event,begin)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('Media took too long to open. Try an MP4 or screenshots.')),20000);const success=()=>done(),failure=()=>done(Error('This browser could not decode the file. Export it as MP4 or use screenshots.'));function done(error){clearTimeout(timer);el.removeEventListener(event,success);el.removeEventListener('error',failure);error?reject(error):resolve();}el.addEventListener(event,success,{once:true});el.addEventListener('error',failure,{once:true});begin();});
export async function readRegistrationMedia(files,players,{language='eng+vie+kor',signal,onProgress=()=>{},onRows=()=>{}}={}){
 if(!files.length||files.length>12)throw Error('Choose one recording or up to 12 screenshots.');
 if(files.some(f=>f.size>1024**3))throw Error('Each file must be smaller than 1 GB.');
 const videos=files.filter(f=>f.type.startsWith('video/')||/\.(mov|mp4|m4v|webm)$/i.test(f.name));
 if(videos.length&&(videos.length!==1||files.length!==1))throw Error('Read one recording at a time, or choose screenshots only.');
 let worker,rows=[],frames=0;const previews=new Map(),urls=[],mediaElements=[];
 const check=()=>{if(signal?.aborted)throw new DOMException('Reading stopped.','AbortError');};
 try{
  onProgress('Loading text reader…');const mod=await import('https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js');check();
  worker=await (mod.default??mod).createWorker(language.split('+'));await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});
  for(const file of files){
   check();const url=URL.createObjectURL(file);urls.push(url);const isVideo=videos.includes(file),media=document.createElement(isVideo?'video':'img');
   mediaElements.push(media);if(isVideo){media.muted=true;media.playsInline=true;media.preload='auto';}
   await load(media,isVideo?'loadeddata':'load',()=>{media.src=url;});
   if(isVideo&&(!Number.isFinite(media.duration)||media.duration>600))throw Error('Use a recording up to 10 minutes long.');
   const duration=isVideo?media.duration:0,steps=isVideo?Math.ceil(duration/2):1;
   for(let step=0;step<steps;step++){
    check();const seconds=isVideo?Math.max(0,Math.min(duration-.05,step*2+.5)):null;
    if(isVideo&&Math.abs(media.currentTime-seconds)>.001)await load(media,'seeked',()=>{media.currentTime=seconds;});check();
    const w=media.videoWidth||media.naturalWidth,h=media.videoHeight||media.naturalHeight;
    const scale=Math.min(1,1600/h,2200/w),canvas=document.createElement('canvas');canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);canvas.getContext('2d').drawImage(media,0,0,canvas.width,canvas.height);
    onProgress(isVideo?`Reading ${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')} of ${Math.ceil(duration)} seconds · ${rows.length} possible players`:`Reading ${file.name}`);
    const result=await worker.recognize(canvas,{}, {tsv:true});check();frames++;
    const source={filename:file.name,seconds,readAt:new Date().toISOString()},found=readRegistrationRows(wordsFromTsv(result.data.tsv),players,source);
    if(found.length){
     const id=file.name+':'+seconds;source.previewId=id;
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));if(blob)previews.set(id,URL.createObjectURL(blob));
     rows=mergeRegistrationRows(rows,found);onRows(rows);
    }
   }
   if(isVideo){media.pause();media.removeAttribute('src');media.load();}
  }
  return {rows,previews,frames};
 }catch(error){for(const url of previews.values())URL.revokeObjectURL(url);throw error;}
 finally{for(const media of mediaElements){if(media.tagName==='VIDEO'){media.pause();media.removeAttribute('src');media.load();}else media.removeAttribute('src');}urls.forEach(url=>URL.revokeObjectURL(url));await worker?.terminate();}
}
