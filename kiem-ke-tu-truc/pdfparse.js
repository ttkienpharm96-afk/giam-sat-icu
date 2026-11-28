// Đọc biên bản kiểm kê tủ trực (mẫu 11D/BV-01) từ PDF bằng toạ độ chữ
async function parseCabinetPDF(buf,wantLayout){
  if(!window.pdfjsLib){await new Promise((ok,no)=>{const s=document.createElement('script');s.src='pdfjs/pdf.min.js';s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
  const pw=document.getElementById('pdf-worker');
  if(pw){if(!window._pdfW)window._pdfW=URL.createObjectURL(new Blob([pw.textContent],{type:'text/javascript'}));pdfjsLib.GlobalWorkerOptions.workerSrc=window._pdfW}
  else pdfjsLib.GlobalWorkerOptions.workerSrc=new URL('pdfjs/pdf.worker.min.js',location.href).href;
  const pdf=await pdfjsLib.getDocument({data:buf,isEvalSupported:false}).promise;
  const F=s=>String(s).normalize('NFC');
  const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/gi,'d').toLowerCase();
  const rows=[],rowPos=[],pagesL=[];let tu='',group='',stop=false,cols=null;
  for(let p=1;p<=pdf.numPages&&!stop;p++){
    const page=await pdf.getPage(p);const vp=page.getViewport({scale:1});
    const tc=await page.getTextContent();
    let items=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>({s:F(i.str).trim(),x:i.transform[4],y:vp.height-i.transform[5],b:i.transform[5],h:Math.hypot(i.transform[2],i.transform[3])||i.height||10,w:i.width}));
    pagesL[p-1]={items,h:vp.height,w:vp.width,cols:null};
    // gộp các mảnh chữ liền nhau cùng dòng
    items.sort((a,b)=>a.y-b.y||a.x-b.x);
    const lines=[];for(const it of items){let L=lines.find(l=>Math.abs(l.y-it.y)<2.5);if(!L){L={y:it.y,items:[]};lines.push(L)}L.items.push(it)}
    lines.sort((a,b)=>a.y-b.y);lines.forEach(l=>l.items.sort((a,b)=>a.x-b.x));
    if(!tu){const li=lines.findIndex(l=>/kiem ke tai/.test(fold(l.items.map(i=>i.s).join(' '))));
      if(li>=0){const l=lines[li];const lim=vp.width*0.5;let txt=l.items.filter(i=>i.x<lim).map(i=>i.s).join(' ');txt=txt.replace(/^.*?t\S{1,2}i\s*:\s*/i,'').replace(/^-?\s*\S+\s+\S+\s+\S+\s+t\S{1,2}i\s*/i,'').replace(/\s*\.{3,}.*$/,'');
        const nx=lines[li+1];if(nx&&nx.y-l.y<14&&nx.items[0].x<200){const extra=nx.items.filter(i=>i.x<300).map(i=>i.s).join(' ');if(extra&&!/ket qua/.test(fold(extra)))txt+=' '+extra}
        tu=txt.replace(/\s+/g,' ').trim()}}
    // dòng đánh số cột 1..12
    const numLine=lines.find(l=>{const v=l.items.map(i=>i.s);return v.length>=10&&v.slice(0,10).every((s,k)=>s==String(k+1))});
    if(numLine){cols=numLine.items.slice(0,12).map(i=>i.x+i.w/2)}
    pagesL[p-1].cols=cols;
    if(!cols)continue;
    const colOf=x=>{let best=0,d=1e9;cols.forEach((c,k)=>{const dd=Math.abs(c-x);if(dd<d){d=dd;best=k}});return best};
    const bounds=cols.map((c,k)=>k?(c+cols[k-1])/2:-1e9);
    const col3Left=bounds[2];
    const startY=numLine?numLine.y+2:0;
    const body=[];
    for(const l of lines){if(l.y<=startY)continue;
      const t=fold(l.items.map(i=>i.s).join(' '));if(/y kien khoa duoc/.test(t)){stop=true;break}
      if(/^(so|tt|ma ky|thuat|ten thuoc|1 2 3)/.test(t)&&!numLine)continue;
      // tách mảnh theo cột (cột tên có thể chứa nhiều mảnh)
      const cells={},ci={};let k=0;const L=l.items;
      // STT và Mã: số nguyên ở bên trái, trước phần tên thuốc
      if(L[k]&&/^\d+$/.test(L[k].s)&&L[k].x<cols[1]){(cells[0]=[]).push(L[k].s);k++;
        if(L[k]&&/^\d+$/.test(L[k].s)&&L[k].x+L[k].w<cols[1]+(cols[2]-cols[1])*0.35){(cells[1]=[]).push(L[k].s);k++}}
      for(;k<L.length;k++){const i=L[k];const c=i.x+i.w/2<bounds[3]?2:colOf(i.x+i.w/2);(cells[c]=cells[c]||[]).push(i.s);(ci[c]=ci[c]||[]).push(i)}
      body.push({y:l.y,b:L[0].b,x0:L[0].x,cells,ci,t})}
    // phân loại: dòng neo (có STT ở cột 1 + số ở cột cơ số/sổ sách), dòng nhóm, dòng nối
    const isInt=s=>/^\d+$/.test(s||'');
    const anchors=body.filter(b=>isInt((b.cells[0]||[]).join(''))&&(b.cells[7]||b.cells[8]));
    const nameXs=[];for(const l of lines)for(const i of l.items){if(i.y>startY&&i.x>cols[1]&&i.x+i.w/2<bounds[3]&&!/^\d+$/.test(i.s))nameXs.push(i.x)}
    nameXs.sort((a,b)=>a-b);const nameX=nameXs.length?nameXs[Math.floor(nameXs.length*0.5)]:bounds[2];
    const tol=4;
    let pendingGroup=null,lastGroupY=-99;
    for(const b of body){
      if(anchors.includes(b)){b.rec={g:null,stt:+b.cells[0].join(''),ma:(b.cells[1]||[]).join(''),ten:[[b.y,(b.cells[2]||[]).join(' ')]],dvt:[[b.y,(b.cells[3]||[]).join(' ')]],lo:[[b.y,(b.cells[4]||[]).join('')]],nuoc:[[b.y,(b.cells[5]||[]).join(' ')]],hd:(b.cells[6]||[]).join(''),coso:(b.cells[7]||[]).join(''),ss:(b.cells[8]||[]).join('')};continue}
      const onlyLeft=Object.keys(b.cells).every(k=>+k<=2);
      const startsLeft=b.x0<nameX-tol;
      if(onlyLeft&&startsLeft&&!isInt((b.cells[0]||[]).join(''))){
        const txt=Object.keys(b.cells).sort().map(k=>b.cells[k].join(' ')).join(' ').trim();
        if(b.y-lastGroupY<13&&pendingGroup!=null&&/[a-zà-ỹ(]/.test(txt[0])){pendingGroup+=' '+txt}else pendingGroup=txt;
        lastGroupY=b.y;b.group=pendingGroup;continue}
      b.cont=true;
    }
    // gán nhóm cho neo theo thứ tự, gán dòng nối cho neo gần nhất
    let g=group;
    for(const b of body){if(b.group!=null){g=b.group;
        // nhóm có thể gộp tiếp ở dòng sau: cập nhật lại tên nhóm cho các neo phía sau
        continue}
      if(b.rec)b.rec.g=g;}
    // sửa tên nhóm bị ngắt dòng: dùng tên dài nhất của chuỗi nhóm liên tiếp
    for(let k=0;k<body.length;k++){if(body[k].group!=null){let j=k;while(body[j+1]&&body[j+1].group!=null&&body[j+1].y-body[j].y<13)j++;const full=body[j].group;for(let m=k;m<=j;m++)body[m].group=full;
        for(let m=j+1;m<body.length&&body[m].group==null;m++)if(body[m].rec)body[m].rec.g=full;k=j}}
    for(const b of body){if(!b.cont)continue;let best=null,d=1e9;for(const a of anchors){const dd=Math.abs(a.y-b.y);if(dd<d){d=dd;best=a}}
      if(!best||d>16)continue;const r=best.rec;
      if(b.cells[2])r.ten.push([b.y,b.cells[2].join(' ')]);if(b.cells[3])r.dvt.push([b.y,b.cells[3].join(' ')]);
      if(b.cells[4])r.lo.push([b.y,b.cells[4].join('')]);if(b.cells[5])r.nuoc.push([b.y,b.cells[5].join(' ')]);
      if(b.cells[1]&&!r.ma)r.ma=b.cells[1].join('');}
    const join=(arr,sep)=>arr.sort((a,b)=>a[0]-b[0]).map(a=>a[1]).filter(Boolean).join(sep).replace(/\s+/g,' ').trim();
    for(const a of anchors){const r=a.rec;
      rowPos.push({page:p-1,y:a.y,b:(a.ci[7]||a.ci[8]||[{b:a.b}])[0].b,tt:(a.ci[9]||[])[0]||null,hv:(a.ci[10]||[])[0]||null,ys:body.filter(x=>x===a||(x.cont&&Math.abs(x.y-a.y)<=16)).map(x=>x.y)});
      rows.push([r.g||'Chưa phân nhóm',r.ma,join(r.ten,' '),join(r.dvt,'').replace(/\/\s*/g,'/'),join(r.lo,''),join(r.nuoc,' '),r.hd,parseInt(r.coso)||0,parseInt(r.ss)||0])}
    group=g;
  }
  return wantLayout?{tu,rows,rowPos,pages:pagesL}:{tu,rows};
}
