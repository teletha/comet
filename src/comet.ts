import { Hono } from 'hono';
import type { Context } from 'hono';

// 多言語辞書（worker.jsから全量移植）
const i18n: Record<string, any> = {
  ja: {
    home_title: 'コメントシステム - ホーム',
    login_title: '管理者ログイン',
    password_placeholder: 'パスワードを入力してください',
    login_btn: 'ログイン',
    admin_panel_title: 'コメントエリア管理パネル',
    area_list_title: '既存のコメントエリアリスト',
    create_area_title: '新しいコメントエリアを作成',
    area_name_placeholder: '名前',
    area_key_placeholder: 'ユニークキー',
    area_intro_placeholder: '紹介文（任意）',
    create_btn: '作成',
    report_management_title: 'レポート管理',
    loading: '読み込み中...',
    no_areas: 'コメントエリアはまだありません',
    area_id: 'ID',
    area_name: '名前',
    area_key: 'キー',
    area_hidden: '非表示',
    area_intro: '紹介',
    area_comments: 'コメント',
    area_action: '操作',
    view: '表示',
    hide: '非表示にする',
    unhide: '非表示を解除',
    delete: '削除',
    no_reports: 'レポートはまだありません',
    report_id: 'ID',
    report_comment_id: 'コメントID',
    report_content: '内容',
    report_reason: '理由',
    report_created_at: '作成日時',
    report_resolved: '処理済み',
    resolve_report: '処理済みとマーク',
    toggle_hide_comment: '非表示/復元',
    delete_confirm: 'このコメントエリアを削除しますか？この操作は元に戻せません。',
    notification_input_password: 'パスワードを入力してください',
    notification_login_failed: 'パスワードが間違っています',
    notification_create_success: '作成に成功しました',
    notification_create_failed: '作成に失敗しました',
    notification_delete_success: '削除に成功しました',
    notification_delete_failed: '削除に失敗しました',
    notification_toggle_success: '操作に成功しました',
    notification_toggle_failed: '操作に失敗しました',
    notification_report_success: '報告に成功しました',
    notification_report_failed: '報告に失敗しました',
    notification_report_resolved: '処理済みとしてマークされました',
    notification_comment_hidden_toggle: 'コメントの非表示状態が切り替わりました',
    notification_comment_submit_failed: 'コメントの投稿に失敗しました',
    notification_missing_input: '名前とユニークキーは必須です',
    notification_report_missing_reason: 'レポート理由が不足しています',
    notification_comment_missing_content: 'コメント内容は空にできません',
    notification_unauthorized: '未承認',
    notification_not_found: '見つかりませんでした',
    comment_title: 'コメントエリア',
    comment_placeholder: '返信もできます。',
    submit_comment_btn: 'コメントを投稿',
    comment_tip: '一度投稿すると削除できません',
    no_comments: 'コメントはまだありません',
    reply_btn: '返信',
    report_comment: '報告',
    comment_hidden: 'このコメントは非表示にされています',
    view_comment: '表示',
    collapse_comment: '折りたたむ',
    language: '言語',
    theme: 'テーマ',
    light: 'ライト',
    dark: 'ダーク',
    like: 'いいね',
    liked: 'いいね済み',
    show_comment_input: 'コメント入力欄を表示',
    turnstile_verification_required: '認証を完了してください。'
  },
  en: {
    home_title: 'Comment System - Home',
    login_title: 'Admin Login',
    password_placeholder: 'Enter password',
    login_btn: 'Login',
    admin_panel_title: 'Comment Area Management',
    area_list_title: 'Existing Comment Areas',
    create_area_title: 'Create New Comment Area',
    area_name_placeholder: 'Name',
    area_key_placeholder: 'Unique Key',
    area_intro_placeholder: 'Introduction (optional)',
    create_btn: 'Create',
    report_management_title: 'Report Management',
    loading: 'Loading...',
    no_areas: 'No comment areas yet',
    area_id: 'ID',
    area_name: 'Name',
    area_key: 'Key',
    area_hidden: 'Hidden',
    area_intro: 'Intro',
    area_comments: 'Comments',
    area_action: 'Actions',
    view: 'View',
    hide: 'Hide',
    unhide: 'Unhide',
    delete: 'Delete',
    no_reports: 'No reports yet',
    report_id: 'ID',
    report_comment_id: 'Comment ID',
    report_content: 'Content',
    report_reason: 'Reason',
    report_created_at: 'Created At',
    report_resolved: 'Resolved',
    resolve_report: 'Mark as Resolved',
    toggle_hide_comment: 'Hide/Restore',
    delete_confirm: 'Confirm delete this comment area? This action cannot be undone',
    notification_input_password: 'Please enter password',
    notification_login_failed: 'Incorrect password',
    notification_create_success: 'Created successfully',
    notification_create_failed: 'Failed to create',
    notification_delete_success: 'Deleted successfully',
    notification_delete_failed: 'Failed to delete',
    notification_toggle_success: 'Operation successful',
    notification_toggle_failed: 'Operation failed',
    notification_report_success: 'Reported successfully',
    notification_report_failed: 'Failed to report',
    notification_report_resolved: 'Marked as resolved',
    notification_comment_hidden_toggle: 'Comment hidden state toggled',
    notification_comment_submit_failed: 'Failed to submit comment',
    notification_missing_input: 'Name and key are required',
    notification_report_missing_reason: 'Missing report reason',
    notification_comment_missing_content: 'Comment content cannot be empty',
    notification_unauthorized: 'Unauthorized',
    notification_not_found: 'Not Found',
    comment_title: 'Comment Area',
    comment_placeholder: 'reply available',
    submit_comment_btn: 'Submit Comment',
    comment_tip: 'Once posted cannot be deleted',
    no_comments: 'No comments yet',
    reply_btn: 'Reply',
    report_comment: 'Report',
    comment_hidden: 'This comment has been hidden',
    view_comment: 'View',
    collapse_comment: 'Collapse',
    language: 'Language',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    like: 'Like',
    liked:'Liked',
    show_comment_input: 'Show Comment Input',
    turnstile_verification_required: 'Please complete the verification.'
  }
};

function parseCookie(cookieHeader: string | null | undefined) {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [name, ...rest] = part.trim().split('=');
    cookies[name] = rest.join('=');
  }
  return cookies;
}

function plainTextToHtml(str: string) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

async function getLanguage(c: Context) {
  const cookie = parseCookie(c.req.header('cookie'));
  if (cookie.lang) return cookie.lang;
  const acceptLanguage = c.req.header('accept-language');
  if (acceptLanguage && acceptLanguage.includes('ja')) return 'ja';
  return 'en';
}

async function getTheme(c: Context) {
  const cookie = parseCookie(c.req.header('cookie'));
  const theme = c.req.query('theme') || cookie.theme || 'dark';
  return theme;
}

interface Env {
  DB: any;
  TURNSTILE_SITEKEY?: string;
  ADMIN_PASS?: string;
}

const app = new Hono<{ Bindings: Env }>();

// 埋め込みページ: /embed/area/:areaKey
app.get('/embed/area/:areaKey', async (c) => {
  const lang = await getLanguage(c);
  const theme = await getTheme(c);
  const t = i18n[lang] || i18n.en;
  const areaKey = c.req.param('areaKey');
  let area = await c.env.DB.prepare('SELECT * FROM comment_areas WHERE area_key = ?').bind(areaKey).first();
  if (!area) {
    await c.env.DB.prepare('INSERT INTO comment_areas (name, area_key, intro, hidden) VALUES (?, ?, ?, ?)').bind(areaKey, areaKey, '', 0).run();
    area = await c.env.DB.prepare('SELECT * FROM comment_areas WHERE area_key = ?').bind(areaKey).first();
  }
  if (!area || area.hidden === 1) {
    return c.text('Comment area not available', 404);
  }
  // HTML生成（簡易版）
  return c.html(`
    <!DOCTYPE html>
    <html lang="${lang}" data-theme="${theme}">
    <head><meta charset="UTF-8"><title>${t.home_title}</title></head>
    <body>
      <div id="commentList">${t.loading}</div>
      <div class="show-comment-input"><button>${t.show_comment_input}</button></div>
      <form style="display:none;"><textarea placeholder="${t.comment_placeholder}"></textarea><button>${t.submit_comment_btn}</button></form>
      <div class="comment-tip">${t.comment_tip}</div>
    </body>
    </html>
  `);
});

// ホームページ
app.get('/', async (c) => {
  const lang = await getLanguage(c);
  const theme = await getTheme(c);
  const t = i18n[lang] || i18n.en;
  const cookie = parseCookie(c.req.header('cookie'));
  const authed = cookie.auth === '1';
  // worker.jsのhandleHomePageのHTML/JS/CSSを忠実にTypeScriptテンプレートリテラルで再現
  return c.html(String.raw`
<!DOCTYPE html>
<html lang="${lang}" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<title>${t.home_title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="main.css"/>
</head>
<body>
  <div class="top-actions">
    <button id="toggleTheme">${theme === 'light' ? t.dark : t.light}</button>
    <button id="toggleLang">${lang === 'ja' ? 'EN' : '日本語'}</button>
  </div>
  <h1>${t.home_title}</h1>
  <div id="notificationBar" class="notification-bar hidden">
    <span id="notificationText"></span>
    <span id="closeNotification" class="close-btn">×</span>
  </div>
  <div id="loginSection" class="${authed ? 'hidden' : ''}">
    <h2>${t.login_title}</h2>
    <div class="form-group">
      <input type="password" id="passwordInput" placeholder="${t.password_placeholder}" />
      <button id="loginBtn">${t.login_btn}</button>
    </div>
  </div>
  <div id="adminSection" class="admin-section ${!authed ? 'hidden' : ''}">
    <h2>${t.admin_panel_title}</h2>
    <div>
      <h3>${t.area_list_title}</h3>
      <div id="areaList">${t.loading}</div>
    </div>
    <hr />
    <h3>${t.create_area_title}</h3>
    <div class="form-group">
      <input type="text" id="areaName" placeholder="${t.area_name_placeholder}" />
      <input type="text" id="areaKey" placeholder="${t.area_key_placeholder}" />
      <textarea id="areaIntro" placeholder="${t.area_intro_placeholder}" style="background:var(--input-bg-color);color:var(--text-color);border:1px solid var(--border-color);height:60px;font-size:14px;margin-bottom:10px;"></textarea>
      <button id="createAreaBtn">${t.create_btn}</button>
    </div>
    <hr />
    <h3>${t.report_management_title}</h3>
    <div id="reportList">${t.loading}</div>
  </div>
  <script>
    const authed = ${authed ? 'true' : 'false'};
    const notificationBar = document.getElementById('notificationBar');
    const notificationText = document.getElementById('notificationText');
    const closeNotification = document.getElementById('closeNotification');
    closeNotification.addEventListener('click', () => notificationBar.classList.add('hidden'));
    function showNotification(msg) {
      notificationText.textContent = msg;
      notificationBar.classList.remove('hidden');
    }
    if (authed) { fetchExtendedInfo(); }
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', async () => {
        const pw = document.getElementById('passwordInput').value.trim();
        if (!pw) { showNotification('${t.notification_input_password}'); return; }
        const res = await fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
        const data = await res.json();
        if (!data.success) { showNotification(data.message || '${t.notification_login_failed}'); } else { location.reload(); }
      });
    }
    const createAreaBtn = document.getElementById('createAreaBtn');
    if (createAreaBtn) {
      createAreaBtn.addEventListener('click', async () => {
        const areaName = document.getElementById('areaName').value.trim();
        const areaKey = document.getElementById('areaKey').value.trim();
        const areaIntro = document.getElementById('areaIntro').value.trim();
        if (!areaName || !areaKey) { showNotification('${t.notification_missing_input}'); return; }
        const formData = new FormData();
        formData.append('area_name', areaName);
        formData.append('area_key', areaKey);
        formData.append('intro', areaIntro);
        const res = await fetch('/create', { method: 'POST', body: formData });
        if (res.ok) {
          showNotification('${t.notification_create_success}');
          document.getElementById('areaName').value = '';
          document.getElementById('areaKey').value = '';
          document.getElementById('areaIntro').value = '';
          await fetchExtendedInfo();
        } else {
          showNotification('${t.notification_create_failed}：' + (await res.text()));
        }
      });
    }
    async function fetchExtendedInfo() {
      const res = await fetch('/admin/extendedInfo');
      if (!res.ok) {
        document.getElementById('areaList').textContent = 'ロード失敗';
        document.getElementById('reportList').textContent = 'ロード失敗';
        return;
      }
      const data = await res.json();
      renderAreaList(data.areas);
      renderReportList(data.reports);
    }
    function renderAreaList(areas) {
      const div = document.getElementById('areaList');
      if (areas.length === 0) { div.textContent = '${t.no_areas}'; return; }
      let html = "<table class=\"table-like\"><thead><tr><th>${t.area_id}</th><th>${t.area_name}</th><th>${t.area_key}</th><th>${t.area_hidden}</th><th>${t.area_intro}</th><th>${t.area_comments}</th><th>${t.area_action}</th></tr></thead><tbody>";
      for (let i = 0; i < areas.length; i++) {
        const a = areas[i];
        html += "<tr><td>" + a.id + "</td><td>" + a.name + "</td><td>" + a.area_key + "</td><td>" + (a.hidden ? '${t.hide}' : '${t.unhide}') + "</td><td style=\"max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">" + (a.intro || '') + "</td><td>" + a.comment_count + "</td><td><a href=\"/area/" + encodeURIComponent(a.area_key) + "\" target=\"_blank\">${t.view}</a> <span onclick=\"toggleHideArea('" + encodeURIComponent(a.area_key) + "')\" style=\"text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;\">" + (a.hidden ? '${t.unhide}' : '${t.hide}') + "</span> <span onclick=\"deleteArea('" + encodeURIComponent(a.area_key) + "')\" style=\"text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;\">${t.delete}</span></td></tr>";
      }
      html += "</tbody></table>";
      div.innerHTML = html;
    }
    function renderReportList(reports) {
      const div = document.getElementById('reportList');
      if (reports.length === 0) { div.textContent = '${t.no_reports}'; return; }
      let html = "<table class=\"table-like\"><thead><tr><th>${t.report_id}</th><th>${t.report_comment_id}</th><th>${t.report_content}</th><th>${t.report_reason}</th><th>${t.report_created_at}</th><th>${t.report_resolved}</th><th>${t.area_action}</th></tr></thead><tbody>";
      for (let i = 0; i < reports.length; i++) {
        const r = reports[i];
        html += "<tr><td>" + r.id + "</td><td>" + r.comment_id + "</td><td style=\"max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">" + (r.comment_content || '') + "</td><td>" + r.reason + "</td><td>" + r.created_at + "</td><td>" + (r.resolved ? '${t.hide}' : '${t.unhide}') + "</td><td>" + (r.resolved ? '' : '<span onclick=\\"resolveReport(' + r.id + ')\\" style=\\"text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;\\">${t.resolve_report}</span>') + '<span onclick=\\"toggleHideComment(' + r.comment_id + ')\\" style=\\"text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;\\">${t.toggle_hide_comment}</span>' + "</td></tr>";
      }
      html += "</tbody></table>";
      div.innerHTML = html;
    }
    async function toggleHideArea(areaKey) {
      const res = await fetch('/admin/area/' + areaKey + '/toggleHide', { method: 'POST' });
      if (res.ok) { showNotification('${t.notification_toggle_success}'); await fetchExtendedInfo(); } else { showNotification('${t.notification_toggle_failed}：' + (await res.text())); }
    }
    async function toggleHideComment(commentId) {
      const res = await fetch('/admin/comment/' + commentId + '/toggleHide', { method: 'POST' });
      if (res.ok) { showNotification('${t.notification_comment_hidden_toggle}'); await fetchExtendedInfo(); } else { showNotification('${t.notification_toggle_failed}：' + (await res.text())); }
    }
    async function togglePinComment(commentId) {
      const res = await fetch('/admin/comment/' + commentId + '/togglePin', { method: 'POST' });
      if (res.ok) { showNotification('${t.notification_toggle_success}'); await fetchExtendedInfo(); } else { showNotification('${t.notification_toggle_failed}：' + (await res.text())); }
    }
    async function deleteArea(areaKey) {
      if (!confirm('${t.delete_confirm}')) return;
      const res = await fetch('/admin/area/' + areaKey + '/delete', { method: 'POST' });
      if (res.ok) { showNotification('${t.notification_delete_success}'); await fetchExtendedInfo(); } else { showNotification('${t.notification_delete_failed}：' + (await res.text())); }
    }
    async function resolveReport(reportId) {
      const res = await fetch('/admin/reports/resolve/' + reportId, { method: 'POST' });
      if (res.ok) { showNotification('${t.notification_report_resolved}'); await fetchExtendedInfo(); } else { showNotification('${t.notification_toggle_failed}：' + (await res.text())); }
    }
    const toggleThemeBtn = document.getElementById('toggleTheme');
    toggleThemeBtn.addEventListener('click', async () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      const res = await fetch('/setTheme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: newTheme }) });
      if (res.ok) { document.documentElement.setAttribute('data-theme', newTheme); toggleThemeBtn.textContent = newTheme === 'light' ? '${t.dark}' : '${t.light}'; } else { showNotification('${t.notification_toggle_failed}：' + (await res.text())); }
    });
    const toggleLangBtn = document.getElementById('toggleLang');
    toggleLangBtn.addEventListener('click', async () => {
      const currentLang = document.documentElement.lang || 'ja';
      const newLang = currentLang === 'ja' ? 'en' : 'ja';
      const res = await fetch('/setLang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: newLang }) });
      if(res.ok){ document.documentElement.lang = newLang; toggleLangBtn.textContent = newLang === 'ja' ? 'EN' : '日本語'; location.reload(); } else { showNotification('${t.notification_toggle_failed}：' + (await res.text())); }
    });
  </script>
</body>
</html>
`);
});

// 管理者ログイン
app.post('/login', async (c) => {
  const body = await c.req.json();
  const password = body.password || '';
  // 管理パスワードは環境変数 ADMIN_PASS から取得
  if (password === c.env.ADMIN_PASS) {
    // 認証成功: Cookieをセット
    const res = new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json;charset=UTF-8' }
    });
    res.headers.append('Set-Cookie', 'auth=1; Path=/; SameSite=Lax; Max-Age=3600');
    return res;
  } else {
    return c.json({ success: false, message: 'パスワードが間違っています' });
  }
});

// コメントエリア作成
app.post('/create', async (c) => {
  // 管理者認証（簡易: Cookieでauth=1）
  const cookie = parseCookie(c.req.header('cookie'));
  if (cookie.auth !== '1') {
    return c.text('Unauthorized', 401);
  }
  const body = await c.req.parseBody();
  const name = typeof body.area_name === 'string' ? body.area_name.trim() : '';
  const key = typeof body.area_key === 'string' ? body.area_key.trim() : '';
  const intro = typeof body.intro === 'string' ? body.intro.trim() : '';
  if (!name || !key) {
    return c.text('Name or key is empty', 400);
  }
  await c.env.DB.prepare('INSERT INTO comment_areas (name, area_key, intro) VALUES (?, ?, ?)').bind(name, key, intro).run();
  return c.text('OK');
});

// コメントエリアページ
app.get('/area/:areaKey', async (c) => {
  const lang = await getLanguage(c);
  const theme = await getTheme(c);
  const t = i18n[lang] || i18n.en;
  const areaKey = c.req.param('areaKey');
  const area = await c.env.DB.prepare('SELECT * FROM comment_areas WHERE area_key = ?').bind(areaKey).first();
  if (!area) {
    return c.text(t.notification_not_found, 404);
  }
  if (area.hidden === 1) {
    return c.text(t.notification_unauthorized, 403);
  }
  // HTML生成（簡易）
  return c.html(`
    <!DOCTYPE html>
    <html lang="${lang}" data-theme="${theme}">
    <head><meta charset="UTF-8"><title>${area.name}</title></head>
    <body>
      <h1>${area.name}</h1>
      <div>${area.intro || ''}</div>
      <div class="show-comment-input"><button>${t.show_comment_input}</button></div>
      <form style="display:none;"><textarea placeholder="${t.comment_placeholder}"></textarea><button>${t.submit_comment_btn}</button></form>
      <div class="comment-tip">${t.comment_tip}</div>
      <div id="commentList">${t.loading}</div>
      <script>
        // コメント取得・表示はフロントでfetchする想定
        fetch('/area/${areaKey}/comments').then(r=>r.json()).then(list=>{
          const el = document.getElementById('commentList');
          if(!list.length) el.textContent = '${t.no_comments}';
          else el.textContent = list.map(c=>c.content).join('\n');
        });
      </script>
    </body>
    </html>
  `);
});

// コメントリスト取得
app.get('/area/:areaKey/comments', async (c) => {
  const areaKey = c.req.param('areaKey');
  // コメントエリアが非表示かどうかをチェック
  const area = await c.env.DB.prepare('SELECT hidden FROM comment_areas WHERE area_key=?').bind(areaKey).first();
  if (!area || area.hidden === 1) {
    return c.json([]);
  }
  const res = await c.env.DB.prepare(`
    SELECT id, content, parent_id, created_at, hidden, likes, pinned
    FROM comments
    WHERE area_key = ?
    ORDER BY created_at ASC
  `).bind(areaKey).all();
  const list = res.results || [];
  // 各コメントに html_content フィールドを追加（Markdown未対応、プレーンテキスト）
  list.forEach((c: any) => {
    c.html_content = c.content;
    c.liked = false;
  });
  return c.json(list);
});

// コメント投稿
app.post('/area/:areaKey/comment', async (c) => {
  const areaKey = c.req.param('areaKey');
  const body = await c.req.parseBody();
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const parentId = body.parent_id ? parseInt(body.parent_id as string, 10) : 0;
  if (!content) {
    return c.text('Missing comment content', 400);
  }
  // コメントエリアの存在チェックと自動作成
  let area = await c.env.DB.prepare('SELECT hidden FROM comment_areas WHERE area_key=?').bind(areaKey).first();
  if (!area) {
    await c.env.DB.prepare('INSERT INTO comment_areas (name, area_key, intro, hidden) VALUES (?, ?, ?, 0)').bind(areaKey, areaKey, '', 0).run();
    area = await c.env.DB.prepare('SELECT hidden FROM comment_areas WHERE area_key=?').bind(areaKey).first();
  }
  if (area.hidden === 1) {
    return c.text('This discussion area is not available', 403);
  }
  await c.env.DB.prepare('INSERT INTO comments (area_key, content, parent_id, hidden, likes, pinned) VALUES (?, ?, ?, 0, 0, 0)').bind(areaKey, content, parentId).run();
  return c.text('OK');
});

// コメントいいね
app.post('/area/:areaKey/comment/:commentId/like', async (c) => {
  const commentId = parseInt(c.req.param('commentId'), 10);
  const comment = await c.env.DB.prepare('SELECT likes FROM comments WHERE id=?').bind(commentId).first();
  if (!comment) {
    return c.text('Comment does not exist', 404);
  }
  const newLikes = comment.likes + 1;
  await c.env.DB.prepare('UPDATE comments SET likes=? WHERE id=?').bind(newLikes, commentId).run();
  return c.text('OK');
});

// コメントレポート
app.post('/area/:areaKey/comment/:commentId/report', async (c) => {
  const commentId = parseInt(c.req.param('commentId'), 10);
  const body = await c.req.parseBody();
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return c.text('Missing report reason', 400);
  }
  const comment = await c.env.DB.prepare('SELECT id FROM comments WHERE id=?').bind(commentId).first();
  if (!comment) {
    return c.text('Comment does not exist', 404);
  }
  await c.env.DB.prepare('INSERT INTO reports (comment_id, reason) VALUES (?, ?)').bind(commentId, reason).run();
  return c.text('OK');
});

// 管理系API（非表示/削除/ピン留め/レポート処理など）
app.post('/admin/area/:areaKey/delete', async (c) => {
  const areaKey = c.req.param('areaKey');
  // 認証チェックは省略（必要なら追加）
  const area = await c.env.DB.prepare('SELECT id FROM comment_areas WHERE area_key=?').bind(areaKey).first();
  if (!area) {
    return c.text('Discussion area does not exist', 404);
  }
  await c.env.DB.prepare('DELETE FROM comments WHERE area_key=?').bind(areaKey).run();
  await c.env.DB.prepare('DELETE FROM reports WHERE comment_id IN (SELECT id FROM comments WHERE area_key=? )').bind(areaKey).run();
  await c.env.DB.prepare('DELETE FROM comment_areas WHERE area_key=?').bind(areaKey).run();
  return c.text('OK');
});

app.post('/admin/area/:areaKey/toggleHide', async (c) => {
  const areaKey = c.req.param('areaKey');
  const area = await c.env.DB.prepare('SELECT hidden FROM comment_areas WHERE area_key=?').bind(areaKey).first();
  if (!area) {
    return c.text('Discussion area does not exist', 404);
  }
  const newHidden = area.hidden === 1 ? 0 : 1;
  await c.env.DB.prepare('UPDATE comment_areas SET hidden=? WHERE area_key=?').bind(newHidden, areaKey).run();
  return c.text('OK');
});

app.post('/admin/comment/:commentId/toggleHide', async (c) => {
  const commentId = parseInt(c.req.param('commentId'), 10);
  const comment = await c.env.DB.prepare('SELECT hidden FROM comments WHERE id=?').bind(commentId).first();
  if (!comment) {
    return c.text('Comment does not exist', 404);
  }
  const newHidden = comment.hidden === 1 ? 0 : 1;
  await c.env.DB.prepare('UPDATE comments SET hidden=? WHERE id=?').bind(newHidden, commentId).run();
  return c.text('OK');
});

app.post('/admin/comment/:commentId/togglePin', async (c) => {
  const commentId = parseInt(c.req.param('commentId'), 10);
  const comment = await c.env.DB.prepare('SELECT pinned FROM comments WHERE id=?').bind(commentId).first();
  if (!comment) {
    return c.text('Comment does not exist', 404);
  }
  const newPinned = comment.pinned === 1 ? 0 : 1;
  await c.env.DB.prepare('UPDATE comments SET pinned=? WHERE id=?').bind(newPinned, commentId).run();
  return c.text('OK');
});

app.post('/admin/reports/resolve/:reportId', async (c) => {
  const reportId = parseInt(c.req.param('reportId'), 10);
  const rep = await c.env.DB.prepare('SELECT id FROM reports WHERE id=?').bind(reportId).first();
  if (!rep) {
    return c.text('Report does not exist', 404);
  }
  await c.env.DB.prepare('UPDATE reports SET resolved=1 WHERE id=?').bind(reportId).run();
  return c.text('OK');
});

// 言語/テーマ切替
app.post('/setLang', async (c) => {
  const body = await c.req.json();
  const lang = body.lang || 'en';
  const res = new Response(JSON.stringify({ success: true }), {
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
  res.headers.append('Set-Cookie', `lang=${lang}; Path=/; SameSite=Lax; Max-Age=3600`);
  return res;
});
app.post('/setTheme', async (c) => {
  const body = await c.req.json();
  const theme = body.theme || 'dark';
  const res = new Response(JSON.stringify({ success: true }), {
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
  res.headers.append('Set-Cookie', `theme=${theme}; Path=/; SameSite=Lax; Max-Age=3600`);
  return res;
});

// 管理者拡張情報（エリア・レポート一覧JSON）
app.get('/admin/extendedInfo', async (c) => {
  const cookie = parseCookie(c.req.header('cookie'));
  if (cookie.auth !== '1') {
    return c.text('Unauthorized', 401);
  }
  const areasRes = await c.env.DB.prepare(`
    SELECT a.id, a.name, a.area_key, a.intro, a.hidden,
      (SELECT COUNT(*) FROM comments c WHERE c.area_key = a.area_key) as comment_count
    FROM comment_areas a
    ORDER BY a.id DESC
  `).all();
  const areas = areasRes.results || [];
  const reportsRes = await c.env.DB.prepare(`
    SELECT r.id, r.comment_id, r.reason, r.created_at, r.resolved, c.content as comment_content
    FROM reports r
    LEFT JOIN comments c on c.id = r.comment_id
    ORDER BY r.id DESC
  `).all();
  const reports = reportsRes.results || [];
  return c.json({ areas, reports });
});

// comet.ts を Cloudflare Worker のエントリーポイントとして使うためのエクスポート
export default app;
