(() => {
 'use strict';
 const $=id=>document.getElementById(id), owner=document.body.dataset.transferOwner==='true';
 let endpoint=owner?'':location.pathname.replace(/\/$/,''),token='',expires=0,link='',busy=false,polling=false;
 const message=(text,error=false)=>{$('status').textContent=text;$('status').className=error?'error':'';};
 function enable(active){$('upload').disabled=!active;$('refresh').disabled=!active;if(owner){$('copy').disabled=!active;$('revoke').disabled=!active;}}
 async function api(url,options={}){
  const response=await fetch(url,{cache:'no-store',...options});
  if(response.redirected)throw Error('电脑端登录已过期，请重新登录后生成二维码');
  if(response.status===410){
   endpoint='';enable(false);if(owner)$('qr').hidden=true;
   throw Error('连接已过期或已结束，请重新生成二维码并扫码');
  }
  const raw=await response.text();
  let data;
  try{data=raw.trim()?JSON.parse(raw):null;}catch{data=null;}
  const valid=data!==null&&typeof data==='object'&&!Array.isArray(data);
  if(!response.ok){
   const fallback=response.status===404?'互传接口不存在，请确认服务器已更新并重新生成二维码':'请求失败，请稍后重试';
   throw Error((valid&&typeof data.error==='string'?data.error:fallback)+'（HTTP '+response.status+'）');
  }
  if(!valid)throw Error('服务器返回空内容或非 JSON 数据，请检查代理配置（HTTP '+response.status+'）');
  return data;
 }
 function action(label,fn){const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await fn();}catch(e){message(e.message,true);}finally{button.disabled=false;}};return button;}
 async function refresh(){
  if(!endpoint||polling)return;
  polling=true;const current=endpoint;
  try{
   const data=await api(current+'/list');if(current!==endpoint)return;
   $('items').replaceChildren();
   const files=data.items.filter(item=>!item.isDir);
   if(!files.length)$('items').textContent='暂无文件，任一设备上传后会自动显示在这里。';
   for(const file of files){
    const row=document.createElement('div');row.className='entry row';
    const name=document.createElement('span');name.className='file-name';name.textContent=file.name+' · '+(file.size/1048576).toFixed(2)+' MB';
    const download=document.createElement('a');download.className='download';download.textContent='下载';download.href=current+'/content?name='+encodeURIComponent(file.name);
    row.append(name,download,action('删除',async()=>{if(!confirm('删除“'+file.name+'”？'))return;await api(current+'/file?name='+encodeURIComponent(file.name),{method:'DELETE'});await refresh();}));
    $('items').append(row);
   }
  }finally{polling=false;}
 }
 async function upload(files){
  if(!endpoint||busy||!files.length)return;
  const selected=Array.from(files);
  if(selected.some(f=>f.size>50*1048576)||selected.reduce((n,f)=>n+f.size,0)>99*1048576){message('单文件最多 50 MB，每批最多 99 MB',true);return;}
  const data=new FormData();selected.forEach(file=>data.append('files',file));
  busy=true;$('upload').disabled=true;message('正在上传，请保持页面打开…');
  try{const result=await api(endpoint+'/upload',{method:'POST',body:data});message('已上传 '+result.uploaded.length+' 个文件');}
  catch(e){message(e.message+'，请查看列表确认已上传文件。',true);}
  finally{busy=false;$('files').value='';enable(Boolean(endpoint));await refresh().catch(e=>message(e.message,true));}
 }
 $('upload').onclick=()=>$('files').click();$('files').onchange=()=>upload($('files').files);
 $('drop').onclick=()=>{if(endpoint&&!busy)$('files').click();};
 $('drop').ondragover=e=>e.preventDefault();$('drop').ondrop=e=>{e.preventDefault();upload(e.dataTransfer.files);};
 $('refresh').onclick=()=>refresh().catch(e=>message(e.message,true));
 if(owner){
  const manage='/tools/personal/transfer/sessions';
  $('generate').onclick=async()=>{
   if(busy){message('请等待上传完成');return;}
   $('generate').disabled=true;
   try{
    const target=new URL($('address').value);
    if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw Error('请输入有效服务器地址');
    if(token)await api(manage+'/'+token,{method:'DELETE'});
    endpoint='';token='';enable(false);$('qr').hidden=true;
    const session=await api(manage,{method:'POST'});
    token=session.token;expires=Date.parse(session.expires);endpoint=session.path;
    link=target.origin+session.path;
    $('qr').src='/tools/personal/transfer/qr?url='+encodeURIComponent(link);$('qr').hidden=false;
    $('expiry').textContent='有效至 '+new Date(expires).toLocaleTimeString()+'；重新生成会让旧二维码失效';
    $('generate').textContent='重新生成二维码';enable(true);await refresh();message('手机扫码后可直接收发文件');
   }catch(e){message(e.message,true);}finally{$('generate').disabled=false;}
  };
  $('revoke').onclick=async()=>{
   try{await api(manage+'/'+token,{method:'DELETE'});token='';endpoint='';link='';enable(false);$('qr').hidden=true;$('items').textContent='连接已结束';message('临时权限已撤销');}
   catch(e){message(e.message,true);}
  };
  $('copy').onclick=async()=>{
   try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(link);
    else{const el=document.createElement('textarea');el.value=link;document.body.append(el);el.select();const ok=document.execCommand('copy');el.remove();if(!ok)throw Error();}
    message('临时链接已复制');
   }catch{prompt('请复制临时链接',link);}
  };
  api('/tools/personal/transfer/addresses').then(data=>{
   for(const value of data.addresses){const el=document.createElement('option');el.value=new URL(value).origin;$('addresses').append(el);}
   if(data.addresses.length)$('address').value=new URL(data.addresses[0]).origin;
  }).catch(e=>message(e.message,true));
 }else{enable(true);refresh().catch(e=>message(e.message,true));}
 setInterval(()=>{
  if(owner&&endpoint&&Date.now()>=expires){endpoint='';enable(false);$('qr').hidden=true;message('连接已到期，请重新生成二维码');}
  if(!document.hidden)refresh().catch(e=>message(e.message,true));
 },5000);
})();
