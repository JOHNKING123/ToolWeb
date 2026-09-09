(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const base = '/tools/personal';
 const status = (text, error=false) => { $('status').textContent=text; $('status').className=error?'error':''; };
 async function request(url, options={}) {
  const response=await fetch(url,{cache:'no-store',...options});
  if(response.redirected && new URL(response.url).pathname==='/ebook/login'){
   location.href='/ebook/login?next='+encodeURIComponent(location.pathname);throw Error('请重新登录');
  }
  const data=await response.json();
  if(!response.ok || data.success===false) throw Error(data.error||'操作失败');
  return data;
 }
 const json=(url,data,method='POST')=>request(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 async function copy(text){
  try {
   if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
   else {
    const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();
    const ok=document.execCommand('copy');area.remove();if(!ok)throw Error('复制失败');
   }
   status('已复制');
  }catch{status('无法自动复制，请选中文字手动复制',true);}
 }
 function button(text,action){
  const el=document.createElement('button');el.textContent=text;
  el.onclick=async()=>{el.disabled=true;try{await action();}catch(e){status(e.message,true);}finally{el.disabled=false;}};
  return el;
 }
 let refresh=async()=>{};
 if(document.body.dataset.tool==='clipboard'){
  let entries=[],editing='';
  function render(){
   $('items').replaceChildren();
   const query=$('search').value.toLowerCase();
   const visible=entries.filter(x=>x.text.toLowerCase().includes(query));
   $('count').textContent=entries.length+' / 200 条';
   if(!visible.length){$('items').textContent=query?'没有匹配的内容':'还没有内容。在这里保存，另一台设备登录后即可复制。';return;}
   for(const item of visible){
    const box=document.createElement('article');box.className='entry';
    const date=document.createElement('small');date.textContent=new Date(item.updated).toLocaleString();
    const text=document.createElement('pre');text.textContent=item.text;
    const actions=document.createElement('div');actions.className='row';
    actions.append(button('复制',()=>copy(item.text)),button('编辑',()=>{
     editing=item.id;$('text').value=item.text;$('save').textContent='保存修改';$('cancel').hidden=false;$('text').focus();
    }),button('删除',async()=>{
     if(!confirm('删除这条内容？'))return;
     await request(base+'/clipboard/api/'+item.id,{method:'DELETE'});
     if(editing===item.id)reset();await refresh();status('已删除');
    }));
    box.append(date,text,actions);$('items').append(box);
   }
  }
  function reset(){editing='';$('text').value='';$('save').textContent='保存到剪贴板';$('cancel').hidden=true;}
  refresh=async()=>{entries=(await request(base+'/clipboard/api')).items;render();};
  $('search').oninput=render;$('cancel').onclick=reset;
  $('save').onclick=async()=>{
   $('save').disabled=true;
   try{await json(base+'/clipboard/api',{id:editing,text:$('text').value});reset();await refresh();status('已保存，其他设备会自动更新');}
   catch(e){status(e.message,true);}finally{$('save').disabled=false;}
  };
 }else{
  const folder='手机电脑互传';
  const fileAPI=base+'/files/api';
  function qr(){
   try{
    const target=new URL($('address').value);
    if(!['http:','https:'].includes(target.protocol))throw Error();
    $('qr').src=base+'/transfer/qr?url='+encodeURIComponent(target.href);$('qr').hidden=false;
   }catch{status('请输入完整的 http:// 或 https:// 地址',true);}
  }
  $('generate').onclick=qr;$('copyLink').onclick=()=>copy($('address').value);
  refresh=async()=>{
   const data=await request(base+'/transfer/list');
   $('items').replaceChildren();
   const items=data.items.filter(x=>!x.isDir);
   if(!items.length)$('items').textContent='暂无文件。任一设备上传后，另一端会自动显示。';
   for(const item of items){
    const row=document.createElement('div');row.className='entry row';
    const name=document.createElement('span');name.className='file-name';
    name.textContent=item.name+' · '+(item.size/1024/1024).toFixed(2)+' MB';
    const link=document.createElement('a');link.className='download';link.textContent='下载';
    link.href=base+'/files/content?download=1&path='+encodeURIComponent(item.path);
    row.append(name,link,button('删除',async()=>{
     if(!confirm('永久删除文件“'+item.name+'”？两端都会移除。'))return;
     await json(fileAPI+'/delete',{path:item.path});await refresh();status('文件已删除');
    }));$('items').append(row);
   }
  };
  let uploading=false;
  async function upload(files){
   if(uploading||!files.length)return;
   const selected=Array.from(files);
   if(selected.some(f=>f.size>50*1024*1024)){status('单文件不能超过 50 MB',true);return;}
   if(selected.reduce((s,f)=>s+f.size,0)>99*1024*1024){status('请分批上传，每批不超过 99 MB',true);return;}
   const form=new FormData();form.append('path',folder);selected.forEach(f=>form.append('files',f));
   uploading=true;$('upload').disabled=true;status('正在上传，请保持页面打开…');
   try{const result=await request(fileAPI+'/upload',{method:'POST',body:form});status('已上传 '+result.uploaded.length+' 个文件');}
   catch(e){status(e.message+'；请查看列表确认已上传的文件。',true);}
   finally{uploading=false;$('upload').disabled=false;$('files').value='';await refresh().catch(e=>status(e.message,true));}
  }
  $('upload').onclick=()=>$('files').click();$('files').onchange=()=>upload($('files').files);
  $('drop').onclick=()=>$('files').click();
  for(const event of ['dragover','dragenter'])$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.add('active');});
  for(const event of ['drop','dragleave'])$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.remove('active');});
  $('drop').addEventListener('drop',e=>upload(e.dataTransfer.files));
  request(base+'/transfer/addresses').then(data=>{
   if(data.addresses.length){$('address').value=data.addresses[0];qr();}
   else status('未找到局域网地址，请填写手机可访问的网站地址。');
   for(const address of data.addresses){const option=document.createElement('option');option.value=address;$('addresses').append(option);}
  }).catch(e=>status(e.message,true));
 }
 $('refresh').onclick=()=>refresh().catch(e=>status(e.message,true));
 refresh().catch(e=>status(e.message,true));
 let polling=false;
 setInterval(async()=>{if(document.hidden||polling)return;polling=true;try{await refresh();}catch(e){status(e.message,true);}finally{polling=false;}},10000);
})();
