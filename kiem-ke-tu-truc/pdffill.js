// Điền kết quả kiểm kê vào chính file PDF biên bản gốc
const PDFStore={
  db:null,
  open(){if(this.db)return Promise.resolve(this.db);return new Promise((ok,no)=>{try{const r=indexedDB.open('kk-pdf',1);r.onupgradeneeded=()=>r.result.createObjectStore('pdf');r.onsuccess=()=>{this.db=r.result;ok(this.db)};r.onerror=()=>no(r.error)}catch(e){no(e)}})},
  async put(id,bytes){try{const db=await this.open();await new Promise((ok,no)=>{const t=db.transaction('pdf','readwrite');t.objectStore('pdf').put(bytes,id);t.oncomplete=ok;t.onerror=()=>no(t.error)});return true}catch(e){return false}},
  async get(id){try{const db=await this.open();return await new Promise((ok,no)=>{const r=db.transaction('pdf').objectStore('pdf').get(id);r.onsuccess=()=>ok(r.result||null);r.onerror=()=>no(r.error)})}catch(e){return null}},
  async del(id){try{const db=await this.open();db.transaction('pdf','readwrite').objectStore('pdf').delete(id)}catch(e){}}
};
function _ls(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
async function loadPdfLib(){
  if(!window.PDFLib)await _ls('pdflib/pdf-lib.min.js').catch(()=>_ls('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'));
  if(!window.fontkit)await _ls('pdflib/fontkit.umd.min.js').catch(()=>_ls('https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js'));
}
async function loadFontBytes(){
  const emb=document.getElementById('font-serif');
  if(emb)return Uint8Array.from(atob(emb.textContent.trim()),c=>c.charCodeAt(0));
  const r=await fetch('pdflib/LiberationSerif-Regular.ttf');if(!r.ok)throw new Error('Không tải được phông chữ');return new Uint8Array(await r.arrayBuffer());
}
// Ghi chú cho từng dòng gốc: lô phát sinh ghi vào dòng cùng thuốc đang thiếu số lượng
function buildNotes(items){
  const orig=items.filter(i=>!i.added),notes=new Map(orig.map(i=>[i,[]]));
  for(const i of orig){if(i.vf=='bad')notes.get(i).push('Lô/HD trên lọ khác sổ sách'+(i.vfTxt?': '+i.vfTxt:''));if(+i.hv>0&&i.note)notes.get(i).push(i.note);else if(i.note)notes.get(i).push(i.note)}
  const byMa=new Map();for(const i of orig){if(!byMa.has(i.ma))byMa.set(i.ma,[]);byMa.get(i.ma).push(i)}
  for(const a of items.filter(i=>i.added&&(i.tt||0)>0)){
    const rows=byMa.get(a.ma)||[];if(!rows.length)continue;
    const lab=`lô ${a.lo}${a.hd?' (HD '+a.hd+')':''}`;let q=a.tt;
    for(const r of rows){if(q<=0)break;const short=r.tt!=null?r.ss-r.tt-(r._used||0):0;if(short<=0)continue;
      const n=Math.min(q,short);r._used=(r._used||0)+n;q-=n;notes.get(r).push(`Thiếu ${n} → thay bằng ${lab}: ${n}`)}
    if(q>0)notes.get(rows[0]).push(`Có thêm ${lab} ngoài sổ sách: ${q}`);
  }
  for(const i of orig)delete i._used;
  for(const [ma,rows] of byMa){const all=items.filter(i=>i.ma==ma);if(all.some(i=>i.tt==null))continue;
    const coso=Math.max(0,...all.map(i=>+i.coso||0)),tt=all.reduce((a,i)=>a+(i.tt||0),0);
    if(coso>0&&tt<coso)notes.get(rows[0]).push(`Thiếu cơ số ${coso-tt} (tổng thực tế ${tt}/${coso})`)}
  return notes;
}
async function fillCabinetPDF(bytes,S,DP_ITEMS){
  const L=await parseCabinetPDF(bytes.slice(0),true);
  const orig=S.items.filter(i=>!i.added);
  const nz=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(L.rows.length!==orig.length||L.rows.some((r,k)=>nz(r[1])!==nz(orig[k].ma)||nz(r[4])!==nz(orig[k].lo)))
    throw new Error('File PDF không khớp danh mục của tủ này (khác số dòng hoặc khác mã/lô). Hãy chọn đúng file PDF đã nạp cho tủ.');
  await loadPdfLib();
  const {PDFDocument,rgb}=PDFLib;
  const doc=await PDFDocument.load(bytes.slice(0));doc.registerFontkit(fontkit);
  const font=await doc.embedFont(await loadFontBytes(),{subset:true});
  const pages=doc.getPages(),black=rgb(0,0,0),white=rgb(1,1,1),blue=rgb(0,0,0);
  const W=(t,sz)=>font.widthOfTextAtSize(t,sz);
  const wipe=(pg,it)=>pg.drawRectangle({x:it.x-0.6,y:it.b-2.2,width:it.w+1.2,height:it.h*0.95+2.4,color:white});
  const text=(pg,t,x,b,sz,col)=>pg.drawText(String(t),{x,y:b,size:sz,font,color:col||blue});
  const notes=buildNotes(S.items);
  // mép phải cột Thực tế / Hỏng vỡ theo từng trang (lấy trung vị từ các ô có sẵn)
  const med=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null};
  const right9=med(L.rowPos.map(p=>p.tt&&p.tt.x+p.tt.w)),right10=med(L.rowPos.map(p=>p.hv&&p.hv.x+p.hv.w));
  L.rowPos.forEach((pos,k)=>{
    const it=orig[k],pg=pages[pos.page],cols=L.pages[pos.page].cols,sz=pos.tt?pos.tt.h*0.95:9.5;
    const r9=pos.tt?pos.tt.x+pos.tt.w:(right9||cols[9]+6),r10=pos.hv?pos.hv.x+pos.hv.w:(right10||cols[10]+5);
    if(pos.tt)wipe(pg,pos.tt);if(pos.hv)wipe(pg,pos.hv);
    if(it.tt!=null){const v=String(it.tt);text(pg,v,r9-W(v,sz),pos.b,sz);const h=String(+it.hv||0);text(pg,h,r10-W(h,sz),pos.b,sz)}
    const ns=notes.get(it)||[];if(!ns.length)return;
    const left=(cols[10]+cols[11])/2+1.5,right=2*cols[11]-left-1,width=right-left;
    const ys=pos.ys.length?pos.ys:[pos.y];const top=Math.min(...ys)-10,bot=Math.max(...ys)+3.8;
    const avail=Math.max(bot-top,10);let fs=7,lines;
    const wrap=(str,f)=>{const out=[];for(const para of str.split('\n')){let cur='';for(const w of para.split(' ')){const t=cur?cur+' '+w:w;if(W(t,f)<=width)cur=t;else{if(cur)out.push(cur);cur=w;while(W(cur,f)>width&&cur.length>1){let c=cur.length;while(c>1&&W(cur.slice(0,c),f)>width)c--;out.push(cur.slice(0,c));cur=cur.slice(c)}}}if(cur)out.push(cur)}return out};
    for(;fs>=5;fs-=0.5){lines=wrap(ns.join('; '),fs);if(lines.length*(fs+0.8)<=avail)break}
    const maxL=Math.max(1,Math.floor(avail/(fs+0.8)));if(lines.length>maxL){lines=lines.slice(0,maxL);lines[maxL-1]=lines[maxL-1].replace(/.{0,2}$/,'…')}
    const pageH=L.pages[pos.page].h,lh=fs+0.8,mid=(top+bot)/2,startTop=mid-lines.length*lh/2;
    lines.forEach((ln,j)=>text(pg,ln,left,pageH-(startTop+(j+1)*lh)+fs*0.2,fs));
  });
  // phần đầu biên bản
  const P0=L.pages[0],pg0=pages[0],m=S.meta;
  const find=(P,re)=>P.items.find(i=>re.test(fold(i.s)));
  const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  const ngay=find(P0,/^ngay\s*$/);const dstr=m.ngay?m.ngay.split('-').reverse().join('/'):'';
  if(ngay&&dstr)text(pg0,dstr,ngay.x+ngay.w+3,ngay.b,ngay.h*0.95,black);
  const nums=P0.items.filter(i=>/^[1-5]\.$/.test(i.s)).sort((a,b)=>a.y-b.y),cds=P0.items.filter(i=>/^chuc danh/.test(fold(i.s))).sort((a,b)=>a.y-b.y);
  (m.members||[]).forEach((p,k)=>{const n=nums[k],c=cds[k];if(n&&p.n)text(pg0,p.n,n.x+n.w+10,n.b+1,11,black);if(c&&p.c)text(pg0,p.c,c.x+c.w+6,c.b+1,11,black)});
  const tline=P0.items.find(i=>/gio, ngay/.test(fold(i.s))&&/nam/.test(fold(i.s)));
  const dt=v=>{if(!v)return null;const d=new Date(v);const z=n=>String(n).padStart(2,'0');return `${z(d.getHours())} giờ ${z(d.getMinutes())}, ngày ${z(d.getDate())} tháng ${z(d.getMonth()+1)} năm ${d.getFullYear()}`};
  if(tline&&(m.start||m.end)){wipe(pg0,tline);const sz=10;
    text(pg0,'Từ '+(dt(m.start)||'… giờ …, ngày … tháng … năm …'),tline.x,tline.b,sz,black);
    text(pg0,'đến '+(dt(m.end)||'… giờ …, ngày … tháng … năm …'),tline.x,tline.b-13,sz,black)}
  // Ý kiến Khoa Dược
  for(let pi=0;pi<L.pages.length;pi++){const P=L.pages[pi];const h=find(P,/^y kien khoa duoc/);if(!h)continue;
    const dat=P.items.find(i=>fold(i.s)=='dat'&&i.y>h.y),kd=P.items.find(i=>/^khong dat/.test(fold(i.s))&&i.y>h.y),gc=P.items.find(i=>/^ghi chu/.test(fold(i.s))&&i.y>h.y);
    if(!dat||!kd)break;const pg=pages[pi];
    DP_ITEMS.forEach((t,k)=>{const r=S.dp[k]||{};if(!r.r&&!r.note)return;const key=fold(t).slice(0,22);
      const row=P.items.find(i=>i.y>dat.y&&fold(i.s).trim().startsWith(key.trim()));if(!row)return;
      if(r.r){const col=r.r=='d'?dat:kd;text(pg,'X',col.x+col.w/2-3,row.b,11,black)}
      if(r.note&&gc){let f=9;while(f>6&&W(r.note,f)>200)f-=0.5;text(pg,r.note,gc.x-60,row.b,f,black)}});
    break}
  return await doc.save();
}
