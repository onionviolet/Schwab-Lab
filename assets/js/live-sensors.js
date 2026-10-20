'use strict';
(()=>{
const $=id=>document.getElementById(id);
const channels=['pressure','temperature','acceleration','rotation','altitude'];
let records=[],timer=null,device=null,reader=null,serialLoop=null,abort=false,sessionStart=0,playback=false,playIndex=0;
const maxRecords=20000;
const report=s=>$('deviceStatus').textContent=s;
const fmt=(x,n=1)=>Number.isFinite(x)?x.toFixed(n):'—';
const status=()=>{$('countStatus').textContent=records.length+' readings'+(records.length===maxRecords?' (capacity reached)':'')};
function toggle(running){$('start').disabled=running;$('stop').disabled=!running;$('mode').disabled=running;$('period').disabled=running;$('baud').disabled=running}
function validate(row){
 if(!row||typeof row!=='object'||!Number.isFinite(row.time))return null;
 const x={time:row.time};for(const k of channels){const v=Number(row[k]);x[k]=row[k]===null||row[k]===undefined||row[k]===''?null:(Number.isFinite(v)?v:null)}
 return x;
}
function add(row){
 const x=validate(row);if(!x||records.length>=maxRecords)return false;
 if(records.length&&x.time<=records.at(-1).time)return false;
 records.push(x);show(x);if(records.length%3===0||records.length<3)draw();status();return true;
}
function show(x){
 for(const k of channels)$(k+'Val').textContent=fmt(x[k],k==='temperature'?1:2);
 $('timeVal').textContent=fmt(x.time,2)+' s';
}
function virtual(){
 const t=(performance.now()-sessionStart)/1000;
 const x={time:t,pressure:1013.25+1.8*Math.sin(t*.31)+.12*Math.sin(t*4),temperature:21+.8*Math.sin(t*.11),acceleration:.2*Math.sin(t*2.3),rotation:1.7*Math.sin(t*.9),altitude:2+.6*Math.sin(t*.26)};
 if(!add(x)){stop();report('Recording stopped: record limit reached. Export your readings.')}
}
function draw(){
 const c=$('liveChart'),width=Math.max(100,c.clientWidth),height=Math.max(180,c.clientHeight),dpr=Math.min(2,devicePixelRatio||1),ctx=c.getContext('2d');
 c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
 ctx.fillStyle='#9db7ca';ctx.font='12px system-ui';
 if(!records.length){ctx.fillText('Start virtual monitoring or import a CSV session.',20,40);return}
 const key=$('channel').value,items=records.slice(Math.max(0,records.length-1200)),valid=items.filter(r=>Number.isFinite(r[key]));
 if(!valid.length){ctx.fillText('No valid measurements for '+key,20,40);return}
 let low=Math.min(...valid.map(r=>r[key])),high=Math.max(...valid.map(r=>r[key]));if(low===high){low-=1;high+=1}const margin=(high-low)*.12;low-=margin;high+=margin;
 const l=60,r=15,t=20,b=40,w=width-l-r,h=height-t-b,minT=items[0].time,maxT=items.at(-1).time;
 const px=v=>l+(v-minT)/Math.max(.01,maxT-minT)*w,py=v=>t+(high-v)/(high-low)*h;
 for(let i=0;i<5;i++){const v=low+(high-low)*i/4,y=py(v);ctx.strokeStyle='#27465a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(l,y);ctx.lineTo(width-r,y);ctx.stroke();ctx.fillStyle='#a8bdcc';ctx.fillText(fmt(v,2),4,y+4)}
 ctx.beginPath();let started=false;for(const x of items){if(!Number.isFinite(x[key])){started=false;continue}if(!started){ctx.moveTo(px(x.time),py(x[key]));started=true}else ctx.lineTo(px(x.time),py(x[key]))}ctx.strokeStyle='#64e4d1';ctx.lineWidth=2;ctx.stroke();
 ctx.fillStyle='#a8bdcc';ctx.fillText(fmt(minT,1)+' s',l,height-12);ctx.fillText(fmt(maxT,1)+' s',Math.max(l,width-80),height-12);
}
function stop(){abort=true;if(timer){clearInterval(timer);timer=null}if(reader){try{reader.cancel()}catch(e){}}if(device){try{device.close()}catch(e){}}reader=null;device=null;toggle(false);playback=false}
function parseLine(line){
 const bits=line.trim().split(',');if(bits.length!==6)return null;
 const numbers=bits.map(x=>x.trim()===''?NaN:Number(x));if(!numbers.every(Number.isFinite))return null;
 return validate(Object.fromEntries(['time',...channels].map((k,i)=>[k,numbers[i]])));
}
async function serial(){
 if(!('serial' in navigator)){report('Web Serial is not available in this browser. Try a supported desktop Chromium browser over HTTPS.');toggle(false);return}
 try{
 device=await navigator.serial.requestPort();if(abort)return;
 const baud=Number($('baud').value);await device.open({baudRate:baud});if(abort)return;
 report('Connected: receiving read-only CSV measurements');const decoder=new TextDecoder();reader=device.readable.getReader();let buffer='',bad=0;
 while(!abort){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>100000){buffer='';bad++;report('Input buffer exceeded limit; discarded incomplete data.')}let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(!line||/^time\s*,/i.test(line))continue;const row=parseLine(line);if(row){if(!add(row))bad++}else bad++;if(bad&&bad%10===0)report('Connected • '+bad+' invalid/unsorted rows discarded');if(records.length>=maxRecords){report('Capacity reached; save your session.');abort=true;break}}}
 if(!abort)report('Serial device disconnected.');
 }catch(e){report('Serial connection ended: '+e.message)}
 finally{stop()}
}
$('start').addEventListener('click',()=>{stop();abort=false;toggle(true);if($('mode').value==='virtual'){sessionStart=performance.now();report('Virtual Uno stream running (synthetic data)');timer=setInterval(virtual,Math.min(2000,Math.max(100,Number($('period').value)||200)));virtual()}else serial()});
$('stop').addEventListener('click',()=>{stop();report('Stopped; readings retained.')});
$('clear').addEventListener('click',()=>{stop();records=[];playIndex=0;status();draw();for(const k of channels)$(k+'Val').textContent='—';$('timeVal').textContent='—';report('Session cleared.')});
$('channel').addEventListener('change',draw);window.addEventListener('resize',draw);
function csv(){return ['time,pressure,temperature,acceleration,rotation,altitude',...records.map(x=>['time',...channels].map(k=>Number.isFinite(x[k])?x[k]:'').join(','))].join('\n')}
function download(name,content){const blob=new Blob([content],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
$('download').addEventListener('click',()=>{if(!records.length){report('No data to export.');return}download('schwab-live-session.csv',csv());report('CSV exported.')});
$('save').addEventListener('click',()=>{try{localStorage.setItem('schwabLiveSessionV1',JSON.stringify({schema:'schwab-live-v1',rows:records}));report('Session saved in this browser; export CSV for backup.')}catch(e){report('Unable to save: '+e.message)}});
function restore(rows){if(!Array.isArray(rows)||rows.length>maxRecords)throw Error('Invalid session size.');const temp=[];for(const row of rows){const x=validate(row);if(!x||temp.length&&x.time<=temp.at(-1).time)throw Error('Invalid or unsorted data.');temp.push(x)}stop();records=temp;status();if(records.length)show(records.at(-1));draw()}
$('restore').addEventListener('click',()=>{try{const p=JSON.parse(localStorage.getItem('schwabLiveSessionV1'));if(p?.schema!=='schwab-live-v1')throw Error('No compatible save found.');restore(p.rows);report('Saved session restored.')}catch(e){report('Restore failed: '+e.message)}});
$('file').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f||f.size>5e6)throw Error('Select a CSV under 5 MB.');const lines=(await f.text()).replace(/^\ufeff/,'').split(/\r?\n/).filter(x=>x.trim());if(lines.length>maxRecords+1)throw Error('Too many rows.');const rows=[];for(const line of lines){if(/^time\s*,/i.test(line))continue;const x=parseLine(line);if(!x)throw Error('Expected six numeric columns: time, pressure, temperature, acceleration, rotation, altitude.');rows.push(x)}restore(rows);report('CSV imported ('+rows.length+' rows).')}catch(err){report('CSV import error: '+err.message)}e.target.value=''});
$('replay').addEventListener('click',()=>{
 if(!records.length){report('No recording to replay.');return}
 if(timer)clearInterval(timer);if(reader||device)stop();playback=true;playIndex=0;let prev=performance.now();const speed=Number($('replaySpeed').value)||1;
 const rows=records.slice();toggle(true);report('Replaying stored readings');
 function tick(ts){if(!playback)return;const t=rows[0].time+(ts-prev)/1000*speed;while(playIndex+1<rows.length&&rows[playIndex+1].time<=t)playIndex++;show(rows[playIndex]);if(playIndex===rows.length-1){playback=false;toggle(false);report('Replay complete.')}else requestAnimationFrame(tick)}requestAnimationFrame(tick)
});
status();draw();
window.__schwabLiveTest={parseLine,validate,get records(){return records},csv};
})();