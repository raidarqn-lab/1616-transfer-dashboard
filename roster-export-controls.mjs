// Serialized into the standalone HTML; no imports, network calls, or portal state.
export function installRosterControls(){
 const form=document.querySelector('#roster-controls'),table=document.querySelector('table'),count=document.querySelector('#roster-count'),summary=document.querySelector('#view-summary');
 const rows=[...table.querySelectorAll('tr[data-player]')];
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
 const fields={group:'Transfer group',status:'Status',seat:'Seat colour',server:'Server',alliance:'Alliance'};
 const numeric={power:'THP (millions)',kills:'Kills',hq:'HQ level',profession:'Profession level'};
 const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 function label(text,control){const l=make('label',text);l.append(control);form.append(l);return control;}
 function select(name,title,options){const el=make('select');el.name=name;for(const [value,text] of options){const o=make('option',text);o.value=value;el.append(o);}return label(title,el);}
 const search=make('input');search.name='search';search.type='search';search.placeholder='Name, group, server, alliance…';label('Search',search);
 for(const [key,title] of Object.entries(fields))select(key,title,[['','All'],...[...new Set(rows.map(r=>r.dataset[key]))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'})).map(v=>[v,v])]);
 select('groupBy','Group by',[['group','Transfer group'],['server','Server'],['alliance','Alliance'],['seat','Seat colour'],['status','Status'],['','No grouping']]);
 select('sort','Sort by',[['name','Player'],['power','THP'],['kills','Kills'],['hq','HQ'],['profession','Profession level'],['server','Server'],['alliance','Alliance'],['seat','Seat'],['status','Status']]);
 select('direction','Order',[['asc','Ascending'],['desc','Descending']]);
 const ranges=make('details'),rangeTitle=make('summary','Numeric filters');ranges.append(rangeTitle);const grid=make('div');grid.className='range-grid';ranges.append(grid);form.append(ranges);
 for(const [key,title] of Object.entries(numeric))for(const bound of ['min','max']){const l=make('label',title+' '+bound),input=make('input');input.type='number';input.min='0';input.step='any';input.name=key+'_'+bound;input.placeholder='Any';l.append(input);grid.append(l);}
 const reset=make('button','Reset filters');reset.type='reset';form.append(reset);
 const print=make('button','Print / Save PDF');print.type='button';print.onclick=()=>window.print();form.append(print);
 const value=name=>form.elements.namedItem(name).value;
 function render(){
  const terms=norm(value('search')).trim().split(/\s+/).filter(Boolean),sort=value('sort'),dir=value('direction')==='asc'?1:-1,groupBy=value('groupBy');
  const filtered=rows.filter(r=>{
   const d=r.dataset;if(!terms.every(term=>norm([d.name,d.group,d.server,d.alliance,d.status,d.seat].join(' ')).includes(term)))return false;
   for(const key of Object.keys(fields))if(value(key)&&d[key]!==value(key))return false;
   for(const key of Object.keys(numeric)){const lo=value(key+'_min'),hi=value(key+'_max');if(lo!==''||hi!==''){if(d[key]===''||!Number.isFinite(Number(d[key])))return false;const n=Number(d[key]);if(lo!==''&&n<Number(lo)||hi!==''&&n>Number(hi))return false;}}
   return true;
  });
  filtered.sort((a,b)=>{const av=a.dataset[sort],bv=b.dataset[sort];if(sort in numeric){if(av===''||bv==='')return av===''?(bv===''?0:1):-1;return (Number(av)-Number(bv))*dir||a.dataset.name.localeCompare(b.dataset.name);}return av.localeCompare(bv,undefined,{numeric:true,sensitivity:'base'})*dir||a.dataset.name.localeCompare(b.dataset.name);});
  table.querySelectorAll('tbody').forEach(e=>e.remove());const groups=new Map();
  for(const r of filtered){const name=groupBy?r.dataset[groupBy]:'';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r);}
  for(const [name,members] of [...groups].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}))){const body=make('tbody');if(groupBy){const tr=make('tr');tr.className='group';const th=make('th',name+' · '+members.length);th.colSpan=9;tr.append(th);body.append(tr);}body.append(...members);table.append(body);}
  if(!filtered.length){const body=make('tbody'),tr=make('tr'),td=make('td','No applicants match these filters.');td.colSpan=9;tr.append(td);body.append(tr);table.append(body);}
  count.textContent=filtered.length+' of '+rows.length+' players'+(groupBy?' · '+groups.size+' groups':'');
  const filters=[];for(const key of ['search',...Object.keys(fields)])if(value(key))filters.push((fields[key]||'Search')+': '+value(key));for(const [key,title] of Object.entries(numeric))for(const bound of ['min','max'])if(value(key+'_'+bound)!=='')filters.push(title+' '+bound+': '+value(key+'_'+bound));
  summary.textContent=(filters.length?filters.join(' | '):'All applicants')+' · Grouped by '+(fields[groupBy]||'none')+' · Sorted by '+form.elements.namedItem('sort').selectedOptions[0].textContent+' ('+value('direction')+')';
 }
 form.oninput=render;form.onchange=render;form.onsubmit=e=>e.preventDefault();form.onreset=()=>setTimeout(render,0);render();
 return {getState:()=>({values:Object.fromEntries(new FormData(form)),expanded:ranges.open}),setState:state=>{for(const [name,value] of Object.entries(state?.values||{})){const control=form.elements.namedItem(name);if(!control)continue;if(control.tagName==='SELECT'&&value&&!Array.from(control.options).some(o=>o.value===value)){const option=make('option',value);option.value=value;control.append(option);}control.value=value;}ranges.open=!!state?.expanded;render();}};
}
