(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.XIAOSHU_CONFIG || {};
  const client = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase?.createClient ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const today = new Date();
  const selected = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let user = null, role = null, tasks = [], messages = [], request = 0;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const same = (a,b) => iso(a) === iso(b);
  const setDate = d => { selected.setFullYear(d.getFullYear(),d.getMonth(),d.getDate()); renderCalendar(); loadDate(); };
  const status = (id,text) => { $(id).textContent = text; };
  function renderCalendar(){
    const y=selected.getFullYear(), m=selected.getMonth(), days=new Date(y,m+1,0).getDate();
    $('month-title').textContent=`${y} 年 ${m+1} 月`;
    $('year-select').value=y; $('month-select').value=m+1; fillDays(); $('day-select').value=selected.getDate();
    const cal=$('calendar'); cal.replaceChildren();
    for(const name of ['一','二','三','四','五','六','日']){const el=document.createElement('div');el.className='weekday';el.textContent=name;cal.append(el);}
    for(let i=0;i<(new Date(y,m,1).getDay()+6)%7;i++){const el=document.createElement('div');el.className='blank';cal.append(el);}
    for(let day=1;day<=days;day++){const date=new Date(y,m,day),b=document.createElement('button');b.type='button';b.className='day'+(same(date,selected)?' selected':'')+(same(date,today)?' today':'');b.innerHTML=`<span>${day}</span><small></small>`;b.onclick=()=>setDate(date);cal.append(b);}
    $('selected-date').textContent=`${y} 年 ${m+1} 月 ${selected.getDate()} 日`;
    $('day-weekday').textContent=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][selected.getDay()];
  }
  function fillDays(){const sel=$('day-select'),end=new Date(selected.getFullYear(),selected.getMonth()+1,0).getDate();sel.replaceChildren();for(let d=1;d<=end;d++)sel.add(new Option(`${d} 日`,d));}
  function renderTasks(){
    $('day-count').textContent=`${tasks.length} 项待办`;
    $('task-list').replaceChildren();
    if(!tasks.length){status('task-status',role?'这一天还没有待办。':'登录后查看共享待办。');return;}
    status('task-status','');
    for(const task of tasks){const row=document.createElement('div');row.className='task'+(task.completed?' done':'');const check=document.createElement('input');check.type='checkbox';check.checked=task.completed;check.disabled=role!=='owner';check.setAttribute('aria-label','完成'+task.title);check.onchange=()=>updateTask(task,{completed:check.checked});const title=document.createElement('span');title.textContent=task.title;row.append(check,title);if(role==='owner'){const actions=document.createElement('div');actions.className='task-actions';const edit=document.createElement('button');edit.type='button';edit.textContent='修改';edit.onclick=()=>{const value=prompt('修改待办',task.title)?.trim();if(value && value!==task.title)updateTask(task,{title:value.slice(0,160)});};const del=document.createElement('button');del.type='button';del.textContent='删除';del.onclick=()=>{if(confirm(`删除“${task.title}”？`))deleteTask(task.id);};actions.append(edit,del);row.append(actions);} $('task-list').append(row);}
  }
  function renderMessages(){const box=$('messages');box.replaceChildren();for(const message of messages){const item=document.createElement('div');item.className='message';const meta=document.createElement('small');meta.textContent=`${message.author_id===user?.id?'我':'对方'} · ${new Date(message.created_at).toLocaleString('zh-CN')}`;const content=document.createElement('span');content.textContent=message.content;item.append(meta,content);box.append(item);} status('board-status',role?messages.length?`共 ${messages.length} 条留言`:'这一天还没有留言。':'登录后查看共享留言');}
  async function loadDate(){const seq=++request;tasks=[];messages=[];renderTasks();renderMessages();if(!client||!user||!role)return;const date=iso(selected);const [t,m]=await Promise.all([client.from('task_items').select('id,title,completed').eq('task_date',date).order('id'),client.from('board_messages').select('id,author_id,content,created_at').eq('message_date',date).order('created_at')]);if(seq!==request)return;if(t.error)status('task-status','读取待办失败：'+t.error.message);else{tasks=t.data||[];renderTasks();}if(m.error)status('board-status','读取留言失败：'+m.error.message);else{messages=m.data||[];renderMessages();}markCalendar();}
  async function markCalendar(){if(!client||!user||!role)return;const y=selected.getFullYear(),m=selected.getMonth(),first=iso(new Date(y,m,1)),last=iso(new Date(y,m+1,0));const {data}=await client.from('task_items').select('task_date,completed').gte('task_date',first).lte('task_date',last);if(y!==selected.getFullYear()||m!==selected.getMonth())return;const counts=new Map();for(const row of data||[]){const p=counts.get(row.task_date)||{all:0,done:0};p.all++;if(row.completed)p.done++;counts.set(row.task_date,p);}for(const b of $('calendar').querySelectorAll('.day')){const day=Number(b.querySelector('span').textContent),p=counts.get(iso(new Date(y,m,day)));b.querySelector('small').textContent=p?`${p.done}/${p.all} 完成`:'';}$('month-count').textContent=`本月 ${[...counts.values()].reduce((n,p)=>n+p.all,0)} 项待办`;}
  async function updateTask(task,changes){const {error}=await client.from('task_items').update(changes).eq('id',task.id);if(error){status('task-status','保存失败：'+error.message);return;}await loadDate();}
  async function deleteTask(id){const {error}=await client.from('task_items').delete().eq('id',id);if(error){status('task-status','删除失败：'+error.message);return;}await loadDate();}
  $('task-form').onsubmit=async e=>{e.preventDefault();if(role!=='owner')return;const title=$('task-title').value.trim();if(!title)return;const {error}=await client.from('task_items').insert({task_date:iso(selected),title});if(error){status('task-status','添加失败：'+error.message);return;}$('task-title').value='';await loadDate();};
  $('message-form').onsubmit=async e=>{e.preventDefault();if(!role)return;const content=$('message-input').value.trim();if(!content)return;$('send').disabled=true;const {error}=await client.from('board_messages').insert({message_date:iso(selected),author_id:user.id,content});$('send').disabled=false;if(error){status('board-status','发送失败：'+error.message);return;}$('message-input').value='';await loadDate();};
  $('auth-toggle').onclick=()=>{if(!client){alert('数据库尚未配置，请检查 config.js。');return;}$('auth-panel').hidden=!$('auth-panel').hidden;};
  $('login').onclick=async()=>{const email=$('email').value.trim(),password=$('password').value;if(!email||!password){status('auth-notice','请输入邮箱和密码。');return;}$('login').disabled=true;const {data,error}=await client.auth.signInWithPassword({email,password});$('login').disabled=false;$('password').value='';if(error){status('auth-notice','登录失败：'+error.message);return;}await authorize(data.user);};
  $('logout').onclick=async()=>{await client.auth.signOut();user=null;role=null;tasks=[];messages=[];$('logout').hidden=true;$('task-form').hidden=true;$('send').disabled=true;status('cloud-state','未登录');renderTasks();renderMessages();markCalendar();};
  async function authorize(u){const {data,error}=await client.from('board_members').select('role').eq('user_id',u.id).maybeSingle();if(error||!data){await client.auth.signOut();status('auth-notice','此账号尚未加入共享空间。');return;}user=u;role=data.role;$('logout').hidden=false;$('task-form').hidden=role!=='owner';$('send').disabled=false;$('auth-panel').hidden=true;status('cloud-state',role==='owner'?'已登录 · 可编辑待办':'已登录 · 可留言');await loadDate();}
  for(let y=today.getFullYear()-5;y<=today.getFullYear()+10;y++)$('year-select').add(new Option(`${y} 年`,y));for(let m=1;m<=12;m++)$('month-select').add(new Option(`${m} 月`,m));
  $('year-select').onchange=()=>{const d=Math.min(selected.getDate(),new Date(Number($('year-select').value),selected.getMonth()+1,0).getDate());setDate(new Date(Number($('year-select').value),selected.getMonth(),d));};
  $('month-select').onchange=()=>{const y=selected.getFullYear(),m=Number($('month-select').value)-1,d=Math.min(selected.getDate(),new Date(y,m+1,0).getDate());setDate(new Date(y,m,d));};
  $('go-date').onclick=()=>setDate(new Date(Number($('year-select').value),Number($('month-select').value)-1,Number($('day-select').value)));
  $('prev-month').onclick=()=>setDate(new Date(selected.getFullYear(),selected.getMonth()-1,Math.min(selected.getDate(),new Date(selected.getFullYear(),selected.getMonth(),0).getDate())));
  $('next-month').onclick=()=>setDate(new Date(selected.getFullYear(),selected.getMonth()+1,Math.min(selected.getDate(),new Date(selected.getFullYear(),selected.getMonth()+2,0).getDate())));
  renderCalendar();renderTasks();renderMessages();status('cloud-state',client?'未登录':'数据库尚未配置');if(client)client.auth.getUser().then(({data})=>{if(data.user)authorize(data.user);});
})();
