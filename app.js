(() => {
  'use strict';
  const boxes = [...document.querySelectorAll('input[data-task]')];
  const storageKey = 'study-calendar-static-2026-v2';
  let progress = {};
  try { progress = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) {}
  let client = null, user = null, role = null;
  const $ = id => document.getElementById(id);
  const config = window.XIAOSHU_CONFIG || {};
  const configured = !!(config.supabaseUrl && config.supabaseAnonKey);
  const state = $('cloud-state'), panel = $('auth-panel'), authBtn = $('auth-toggle'), logoutBtn = $('logout');
  const notify = msg => { $('auth-notice').textContent = msg; };
  function refresh() {
    const done = boxes.filter(b => b.checked).length;
    $('progress-label').textContent = `已完成 ${done} / ${boxes.length} 项`;
    $('progress-num').textContent = Math.round(100 * done / boxes.length) + '%';
    $('progress-fill').style.width = (100 * done / boxes.length) + '%';
    document.querySelectorAll('.day.busy').forEach(day => {
      const id = day.getAttribute('href').slice(1);
      const tasks = [...document.querySelectorAll('#' + id + ' input[data-task]')];
      day.dataset.completed = tasks.length && tasks.every(x => x.checked) ? 'yes' : 'no';
    });
  }
  function localSave() { try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch (_) {} }
  function applyLocal() { boxes.forEach(b => { b.checked = !!progress[b.dataset.task]; }); refresh(); }
  boxes.forEach(b => b.addEventListener('change', async () => {
    if (client && user && role !== 'owner') { b.checked = !b.checked; alert('只有小舒可以修改打卡进度。'); return; }
    const was = !b.checked;
    progress[b.dataset.task] = b.checked; localSave(); refresh();
    if (client && user) {
      const { error } = await client.from('task_checks').upsert({ task_id: Number(b.dataset.task), completed: b.checked }, { onConflict: 'task_id' });
      if (error) { b.checked = was; progress[b.dataset.task] = was; localSave(); refresh(); alert('云端保存失败：' + error.message); }
    }
  }));
  $('reset').addEventListener('click', async () => {
    if (!confirm('确定清空全部打卡记录吗？')) return;
    if (client && user && role !== 'owner') { alert('只有小舒可以重置打卡。'); return; }
    if (client && user) {
      const { error } = await client.from('task_checks').delete().gte('task_id', 1);
      if (error) { alert('云端重置失败：' + error.message); return; }
    }
    progress = {}; try { localStorage.removeItem(storageKey); } catch (_) {}
    applyLocal();
  });
  applyLocal();
  authBtn.onclick = () => {
    if (!configured) { alert('尚未配置 Supabase。请先按照说明文件设置 config.js 和数据库。'); return; }
    panel.classList.toggle('open');
  };
  function boardState(day, text) { $('board-status-' + day).textContent = text; }
  function safeDate(value) { try { return new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}); } catch(_) { return ''; } }
  function renderMessages(day, rows) {
    const target = $('messages-' + day); target.replaceChildren();
    if (!rows.length) { boardState(day, '还没有留言，来写下第一句吧。'); return; }
    boardState(day, `共 ${rows.length} 条留言`);
    for (const r of rows) {
      const item = document.createElement('div'); item.className = 'message';
      const by = document.createElement('div'); by.className = 'author';
      by.textContent = (r.author_id === user?.id ? '我' : '对方') + ' · ' + safeDate(r.created_at);
      const content = document.createElement('div'); content.className = 'content'; content.textContent = r.content;
      item.append(by, content); target.append(item);
    }
  }
  async function loadMessages(day) {
    if (!client || !user) return;
    const { data, error } = await client.from('board_messages').select('id,author_id,content,created_at').eq('day', day).order('created_at',{ascending:true}).limit(200);
    if (error) { boardState(day, '读取失败：' + error.message); return; }
    renderMessages(day, data || []);
  }
  async function loadAll() {
    if (!client || !user) return;
    const { data: member, error: memberError } = await client.from('board_members').select('role').eq('user_id',user.id).maybeSingle();
    if (memberError || !member) {
      role = null; state.textContent = '账号尚未授权，请在数据库成员表中添加此账号';
      document.querySelectorAll('.send').forEach(b => b.disabled = true);
      return;
    }
    role = member.role;
    state.textContent = `共享模式 · ${role === 'owner' ? '小舒' : '访客'}已登录`;
    logoutBtn.hidden = false; authBtn.textContent = '账号设置'; panel.classList.remove('open');
    boxes.forEach(b => { b.disabled = role !== 'owner'; });
    const { data: checks, error } = await client.from('task_checks').select('task_id,completed');
    if (!error) {
      progress = {}; for (const row of checks || []) progress[row.task_id] = row.completed;
      localSave(); applyLocal();
    } else state.textContent = '打卡同步失败：' + error.message;
    document.querySelectorAll('.send').forEach(b => b.disabled = false);
    await Promise.all([...Array(30)].map((_, i) => loadMessages(i + 1)));
  }
  document.querySelectorAll('.send').forEach(btn => btn.addEventListener('click', async () => {
    const day = Number(btn.dataset.day), input = $('message-input-' + day), content = input.value.trim();
    if (!user || !role) { alert('请先登录已授权的共享账号。'); return; }
    if (!content) { input.focus(); return; }
    btn.disabled = true; boardState(day, '正在发送…');
    const { error } = await client.from('board_messages').insert({ day, content, author_id:user.id });
    btn.disabled = false;
    if (error) boardState(day, '发送失败：' + error.message);
    else { input.value = ''; await loadMessages(day); }
  }));
  if (!configured) return;
  if (!window.supabase || !window.supabase.createClient) { state.textContent = '数据库连接脚本未加载，请使用 Safari 打开公开网站'; return; }
  client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  state.textContent = '数据库已配置 · 请登录共享账号';
  $('login').onclick = async () => {
    const email = $('email').value.trim(), password = $('password').value;
    if (!email || !password) { notify('请填写邮箱和密码。'); return; }
    $('login').disabled = true; notify('正在登录…');
    const { data, error } = await client.auth.signInWithPassword({email,password});
    $('login').disabled = false;
    if (error) { notify('登录失败：' + error.message); return; }
    user = data.user; await loadAll();
  };
  logoutBtn.onclick = async () => {
    await client.auth.signOut(); user=null; role=null; logoutBtn.hidden=true;
    state.textContent = '已退出共享账号'; authBtn.textContent = '共享留言登录';
    boxes.forEach(b => b.disabled=false);
    document.querySelectorAll('.send').forEach(b => b.disabled=true);
    document.querySelectorAll('.messages').forEach(el => el.replaceChildren());
    document.querySelectorAll('.board-status').forEach(el => el.textContent='登录后查看共享留言');
  };
  client.auth.getUser().then(async ({data,error}) => {if(!error && data.user) {user=data.user;await loadAll();}});
  document.addEventListener('visibilitychange', () => {if(!document.hidden && user && role) { const hash = location.hash.match(/day-(\d+)/); if(hash) loadMessages(Number(hash[1])); }});
  window.addEventListener('hashchange', () => {const match = location.hash.match(/day-(\d+)/); if (match && user && role) loadMessages(Number(match[1]));});
})();
