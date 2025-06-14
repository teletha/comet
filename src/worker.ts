import { lang as i18n } from './lang/lang.js'; // .js拡張子を追加 (ES Modulesの解決のため)
import type { D1Database, D1Result, ExecutionContext } from '@cloudflare/workers-types';

// D1 と環境変数の型定義
interface Env {
  DB: D1Database;
  ADMIN_PASS?: string;
  TURNSTILE_SITEKEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}
  
  /** 解析 cookie ユーティリティ関数 */
  function parseCookie(cookieHeader: string | null): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const [name, ...rest] = part.trim().split('=');
      cookies[name] = rest.join('=');
    }
    return cookies;
  }
  

/**
 * プレーンテキストを安全なHTMLに変換する。
 * 1. HTML特殊文字をエスケープする (XSS対策)
 * 2. 改行文字(\n)を<br>タグに変換する
 * @param {string} str - 変換するプレーンテキスト
 * @returns {string} - 安全なHTML文字列
 */
function plainTextToHtml(str: string | null | undefined): string {
    if (!str) return '';
    // 1. HTML特殊文字をエスケープ (サニタイズ)
    const escapedStr = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

    // 2. 改行文字を<br>タグに変換
    return escapedStr.replace(/\n/g, '<br>');
}
  
  
  // 言語の取得
  async function getLanguage(request: Request): Promise<string> {
    const cookie = parseCookie(request.headers.get("Cookie"));
    if (cookie.lang) {
      return cookie.lang;
    }
    // Accept-Language ヘッダーから言語の優先順位を取得する
    const acceptLanguage = request.headers.get('Accept-Language');
    if (acceptLanguage) {
      const languages = acceptLanguage.split(',').map(lang => lang.trim().split(';')[0]);
      if (languages.some(lang => lang.startsWith('ja'))) {
        return 'ja';
      }
    }
    return 'en'; // デフォルトは英語
  }
  
  // テーマの取得
  async function getTheme(request: Request): Promise<string> {
    const cookie = parseCookie(request.headers.get("Cookie"));
        const urlParams = new URL(request.url).searchParams;
    return urlParams.get('theme') || cookie.theme || 'dark';
  }
  
  /** テーマ/言語のクッキーを設定する */
  function setCookie(name: string, value: string, res: Response): void {
    res.headers.append('Set-Cookie', `${name}=${value}; Path=/; SameSite=Lax; Max-Age=3600`);
  }
  
  /**  通知バーを表示する */
  function showNotification(msg: string): string {
    const notificationHtml = `
    <div id="notificationBar" class="notification-bar">
      <span id="notificationText">${msg}</span>
      <span id="closeNotification" class="close-btn">×</span>
    </div>
  `;
    return notificationHtml;
  }
  
  export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);
      const pathname = url.pathname;
  
      // 初期化言語
      const lang = await getLanguage(request);
      // 初期化テーマ
      const theme = await getTheme(request);
  
      // ルーティング
      if (pathname === '/' && request.method === 'GET') {
        // ホームページ：ログインフォームまたは管理パネルを表示
        return handleHomePage(request, env, lang, theme);
      } else if (pathname === '/login' && request.method === 'POST') {
        // 管理者ログイン
        return handleLogin(request, env);
      } else if (pathname === '/create' && request.method === 'POST') {
        // 議論エリアの作成(管理者)
        return handleCreateCommentArea(request, env);
      } else if (pathname.startsWith('/area/') && request.method === 'GET') {
        // 議論エリアへのアクセス、またはコメントJSONの取得
        if (pathname.endsWith('/comments')) {
          return handleGetComments(request, env);
        } else {
          // 議論エリアページ
          return handleCommentAreaPage(request, env, lang, theme);
        }
      } else if (pathname.startsWith('/area/') && request.method === 'POST') {
        // コメントまたはレポート
        if (pathname.endsWith('/comment')) {
          return handlePostComment(request, env);
        }
        if (pathname.match(/^\/area\/[^/]+\/comment\/\d+\/report$/)) {
          return handleReportComment(request, env);
        }
          if (pathname.match(/^\/area\/[^/]+\/comment\/\d+\/like$/)) {
              return handleLikeComment(request, env);
          }
      }
  
      // 管理者操作
      if (pathname.startsWith('/admin/') && request.method === 'POST') {
        const matchDeleteArea = pathname.match(/^\/admin\/area\/([^/]+)\/delete$/);
        if (matchDeleteArea) {
          return handleDeleteArea(matchDeleteArea[1], request, env);
        }
        const matchHideArea = pathname.match(/^\/admin\/area\/([^/]+)\/toggleHide$/);
        if (matchHideArea) {
          return handleToggleHideArea(matchHideArea[1], request, env);
        }
        const matchPinComment = pathname.match(/^\/admin\/comment\/(\d+)\/togglePin$/);
        if (matchPinComment) {
          const commentId = parseInt(matchPinComment[1], 10);
          return handleTogglePinComment(commentId, request, env);
        }
        const matchResolveReport = pathname.match(/^\/admin\/reports\/resolve\/(\d+)$/);
        if (matchResolveReport) {
          return handleResolveReport(parseInt(matchResolveReport[1], 10), request, env);
        }
        const matchToggleHideComment = pathname.match(/^\/admin\/comment\/(\d+)\/toggleHide$/);
        if (matchToggleHideComment) {
          const commentId = parseInt(matchToggleHideComment[1], 10);
          return handleToggleHideComment(commentId, request, env);
        }
      }
  
      // より詳細な管理者情報の取得（議論エリアリスト、レポートリストなど）
      if (pathname === '/admin/extendedInfo' && request.method === 'GET') {
        return handleAdminExtendedInfo(request, env);
      }
  
      // 言語切り替えの処理
      if (pathname === '/setLang' && request.method === 'POST') {
        return handleSetLang(request, env);
      }
      // テーマ切り替えの処理
      if(pathname === '/setTheme' && request.method === 'POST') {
        return handleSetTheme(request, env);
      }
  
      // 新規追加: 埋め込みページのルートを処理
      if (pathname.startsWith('/embed/area/') && request.method === 'GET') {
          const areaKey = decodeURIComponent(pathname.replace(/^\/embed\/area\//, ''));
        return handleEmbedCommentArea(areaKey, request, env, lang, theme);
      }
  
      return new Response("Not Found", { status: 404 });
    }
  };
  
  interface CommentArea {
    id: number;
    name: string;
    area_key: string;
    intro: string | null;
    hidden: number;
  }
  async function handleEmbedCommentArea(areaKey: string, request: Request, env: Env, lang: string, theme: string): Promise<Response> {
    const t = i18n[lang] || i18n['en'];
    let area: CommentArea | null = await env.DB.prepare(`
    SELECT * FROM comment_areas WHERE area_key = ?
    `).bind(areaKey).first();

    // コメントエリアが存在しない場合、自動的に作成する
    if (!area) {
        console.log(`Comment area with key '${areaKey}' not found for embed. Attempting to create automatically.`);
        try {
            // エリアの自動作成 (name と area_key は同じ、intro は空文字列)
            // 修正: hidden の値をパラメータとして渡す
            await env.DB.prepare(`
                INSERT INTO comment_areas (name, area_key, intro, hidden) VALUES (?, ?, ?, ?)
            `).bind(areaKey, areaKey, '', 0).run();
            // 作成されたエリアの情報を再取得して続行
            area = await env.DB.prepare(`
                SELECT * FROM comment_areas WHERE area_key = ?
            `).bind(areaKey).first<CommentArea>();
            console.log(`Comment area '${areaKey}' created automatically for embed.`);
        } catch (e) {
            console.error(`Failed to auto-create comment area '${areaKey}' for embed:`, e);
            // 自動作成に失敗した場合はエラーを返す
            if (e instanceof Error) {
                return new Response(`Failed to create comment area automatically: ${e.message}`, { status: 500 });
            } else {
                return new Response(`Failed to create comment area automatically: Unknown error`, { status: 500 });
            }
        }
    }

    // エリアが依然として存在しないか、非表示の場合はアクセス不可
    if (!area || area.hidden === 1) {
        return new Response("Comment area not available", { status: 404 });
    }
    const html = `
    <!DOCTYPE html>
    <html lang="${lang}" data-theme="${theme}">
    <head>
        <meta charset="UTF-8">
        <title>${t.comment_title} - ${area?.name || areaKey}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1.0">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown.min.css" crossorigin="anonymous">
        <style>
            body {
                background: var(--bg-color); color: var(--text-color); font-family: sans-serif;
                padding: 20px;
                margin: -10px;
            }
            a { color: var(--link-color); text-decoration: none; }
            a:hover { color: var(--link-hover-color); }
            .hint { color: var(--hint-color); margin-bottom: 10px; }
            .comment-list { margin-top: 20px; }
            
            .comment-item {
                padding: 10px 0 0 10px;
                background: var(--comment-bg-color);
                border-radius: 4px;
                /* margin-bottom は削除し、下のルールで制御 */
            }
            /* 修正点: comment-list の直接の子 (トップレベルコメント) にのみマージンを適用 */
            .comment-list > .comment-item {
                margin-bottom: 15px; /* トップレベルのコメント間の間隔 */
                padding-bottom: 15px;
            }
            /* 修正点: ネストされたコメント (返信) にマージンを調整 */
            .comment-item .comment-item {
                margin-top: 8px; /* 返信コメントの上部に少し間隔を空ける */
                margin-bottom: 0; /* 返信コメントの下部マージンをリセット */
            }
            .reply-item { margin-left: 20px; }
            .reply-btn, .report-btn, .like-btn {
                margin-left: 10px; color: var(--hint-color); cursor: pointer; font-size: 12px;
                display: inline-block;
            }
            .like-btn.liked {
                color: var(--link-color);
            }
            .reply-box { margin-top: 5px; }
            .markdown-content { font-size: 14px; color: var(--comment-text-color); }
            .form-group {
                display:flex;flex-direction:row;align-items: flex-start;
                margin: 20px 0;
            }
            .form-group textarea {
                background: var(--input-bg-color); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px; width: calc(100% - 18px); height: 60px;
                resize: vertical; margin-right: 10px; font-size: 14px;
            }
            .form-group .comment-action {
                display:flex;flex-direction:column;justify-content: flex-end;align-items: flex-end;
            }
            .form-group button {
                background: var(--button-bg-color); color: var(--button-text-color); border: none; padding: 6px 10px; cursor: pointer; border-radius: 3px;
                transition: background 0.3s ease, transform 0.2s ease;
                margin-left: 5px;
                font-size: 12px;
                white-space: nowrap;
            }
            .form-group button:hover {
                background: var(--button-hover-color); transform: scale(1.02);
            }
            .form-group button[disabled] {
                background: #ddd; /* 禁用状態時の背景色 */
                color: #999; /* 禁用状態時の文字色 */
                cursor: not-allowed; /* 禁用状態時のマウスカーソル */
            }
            .form-group button[disabled]:hover{
                background: #ddd; /* 禁用状態時の背景色 */
                color: #999; /* 禁用状態時の文字色 */
                transform:none;
            }
            .comment-tip {
                font-size: 0.8em;
                color: var(--hint-color);
                margin-top: 5px;
                white-space: nowrap;
            }
        .cf-challenge {
                margin-bottom: 10px;
            }
        /* 懸浮テキスト */
        .tooltip {
                position: relative;
                display: inline-block;
            }
        .tooltip .tooltiptext {
                visibility: hidden;
                background-color: var(--hint-color);
                color: var(--text-color);
                text-align: center;
                border-radius: 6px;
                padding: 5px;
                position: absolute;
                z-index: 1;
                bottom: 125%;
                left: 50%;
                margin-left: -60px;
                font-size: 0.8em;
                white-space: nowrap;
                opacity: 0;
            transition: opacity 0.3s;
            }
        .tooltip:hover .tooltiptext {
                visibility: visible;
                opacity: 1;
        }
        .notification-bar {
                position: fixed; bottom: 0; left: 0; width: 100%; background: var(--notification-bg-color); color: var(--notification-text-color); padding: 10px 20px;
                display: flex; align-items: center; justify-content: space-between; font-size: 14px; z-index: 9999;
            }
            .notification-bar.hidden { display: none; }
            .close-btn { cursor: pointer; margin-left: 20px; font-weight: bold; }
            /* 隠されたコメントの場合、プレースホルダー/ボタンのみ表示 */
        .hidden-comment-placeholder {
                font-style: italic;
                color: var(--hint-color);
            }
        .show-btn {
                color: var(--link-color);
                margin-left: 8px;
              cursor: pointer;
            }
        .show-btn:hover {
                text-decoration: underline;
            }
            .show-comment-input {
                margin-top: 10px;
                text-align: left;
            }
        .show-comment-input button {
                background: var(--button-bg-color); color: var(--button-text-color); border: none; padding: 8px 12px; cursor: pointer; border-radius: 3px;
                transition: background 0.3s ease, transform 0.2s ease;
                margin-bottom: 10px;
            }
        .show-comment-input button:hover {
            background: var(--button-hover-color); transform: scale(1.02);
            }
            /* 深色・浅色テーマ */
            :root {
                --bg-color: #121212;
                    --text-color: #fff;
                    --link-color: #bbb;
                    --link-hover-color: #fff;
                    --input-bg-color: #1e1e1e;
                    --border-color: #444;
                    --button-bg-color: #333;
                    --button-text-color: #fff;
                    --button-hover-color: #444;
                    --notification-bg-color: #2a2a2a;
                    --notification-text-color: #fff;
                    --comment-bg-color: #1e1e1e;
                  --comment-text-color:#ccc;
                      --hint-color:#aaa;
                }

                [data-theme="light"] {
                  --bg-color: #ffffff;
                    --text-color: #333;
                    --link-color: #555;
                  --link-hover-color: #000;
                    --input-bg-color: #eee;
                    --border-color: #ccc;
                    --button-bg-color: #ddd;
                    --button-text-color: #333;
                  --button-hover-color: #eee;
                    --notification-bg-color: #f0f0f0;
                    --notification-text-color: #333;
                     --comment-bg-color: #eee;
                    --comment-text-color:#555;
                  --hint-color:#777;
                }
            .markdown-content.markdown-body{
            background-color: inherit;
            }
        </style>
    </head>
    <body data-theme="${theme}">
    <div class="comment-list" id="commentList">${t.loading}</div>
    <div class="show-comment-input" id="showCommentInput">
    <button id="showInputBtn">${t.show_comment_input}</button>
    </div>
    <div id="commentForm" class="form-group" style="display: none;">
            <textarea id="newComment" placeholder="${t.comment_placeholder}"></textarea>
            <div class="comment-action">
                <input type="hidden" id="parentId" value="0" />
                <div class="cf-challenge" data-sitekey="${env.TURNSTILE_SITEKEY || ''}" data-theme="${theme}" style="display:none;"></div>
                <div class="tooltip">
            <button id="submitBtn" disabled>${t.submit_comment_btn}
                        <span class="tooltiptext" id="submitTooltip">${t.notification_missing_input}</span>
                    </button>
            </div>
                <div class="comment-tip">${t.comment_tip}</div>
            </div>
    </div>
    
    <!-- 通知バー -->
    <div id="notificationBar" class="notification-bar hidden">
            <span id="notificationText"></span>
                <span id="closeNotification" class="close-btn">×</span>
        </div>
        <script>
            const notificationBar = document.getElementById('notificationBar');
            const notificationText = document.getElementById('notificationText');
                const closeNotification = document.getElementById('closeNotification');
            closeNotification.addEventListener('click', () => notificationBar.classList.add('hidden'));
            function showNotification(msg) {
                notificationText.textContent = msg;
                notificationBar.classList.remove('hidden');
            }
            let commentList =  document.getElementById('commentList');
            let comments = []; // コメントデータをキャッシュ
            async function loadComments() {
                commentList.textContent = '${t.loading}';
                const res = await fetch('/area/${areaKey}/comments');
                if (!res.ok) {
                    commentList.textContent = '${t.notification_not_found}';
                return;
                }
                comments = await res.json();
                renderComments(comments);
            }
            // フラットなコメントデータをツリー構造に組み立てる
            function buildCommentTree(list) {
            const map = {};
                list.forEach(c => { map[c.id] = { ...c, replies: [] }; });
                const roots = [];
                list.forEach(c => {
                    if (c.parent_id && c.parent_id !== 0) {
                    map[c.parent_id]?.replies.push(map[c.id]);
                    } else {
                            roots.push(map[c.id]);
                    }
            });
                return roots;
            }
            // 管理者ログインを判断
                const authed = document.cookie.includes('auth=1');
            // コメントツリーをレンダリング
            function renderComments(comments) {
                    commentList.innerHTML = '';
                if (comments.length === 0) {
                        commentList.textContent = '${t.no_comments}';
                    return;
                }
            const tree = buildCommentTree(comments);
                tree.forEach(comment => {
                        commentList.appendChild(renderCommentItem(comment));
                });
            }
            function renderCommentItem(comment) {
                const div = document.createElement('div');
                div.className = 'comment-item' + (comment.parent_id ? ' reply-item' : '');
                // コメントが非表示の場合
            if (comment.hidden === 1) {
                // 管理者は原文を直接閲覧可能、一般ユーザーはデフォルトで折りたたまれる
                if (authed) {
                    // 管理者ビュー: 原文と「非表示/復元」操作が表示される
                    div.innerHTML = \`
                    <div class="markdown-content markdown-body" style="border-left:2px solid #444; padding-left:8px;">
                        [${t.comment_hidden}，${t.admin_panel_title}]<br/>
                            \${comment.html_content}
                        </div>
                    <small style="color:#777;">\${comment.created_at || ''}</small>
                        <span class="reply-btn" data-comment-id="\${comment.id}" style="text-decoration: none;">${t.reply_btn}</span>
                            <span class="report-btn" onclick="reportComment(\${comment.id})" style="text-decoration: none;">${t.report_comment}</span>
                            <span onclick="toggleHideComment(\${comment.id})" style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">
                            ${t.unhide}
                        </span>
                    \`;
                } else {
                    // 一般ユーザー: 「このコメントは非表示です」のみ表示され、「表示」をクリックすると展開される
                    div.innerHTML = \`
                    <div class="hidden-comment-placeholder">
                        ${t.comment_hidden}
                            <span class="show-btn" onclick="toggleHiddenContent(this, \${comment.id})">${t.view_comment}</span>
                        </div>
                    <div class="hidden-content" style="display:none;">
                            <div class="markdown-content markdown-body">\${comment.html_content}</div>
                        <small style="color:#777;">\${comment.created_at || ''}</small>
                            <span class="reply-btn" data-comment-id="\${comment.id}"  style="text-decoration: none;">${t.reply_btn}</span>
                        <span class="report-btn" onclick="reportComment(\${comment.id})" style="text-decoration: none;">${t.report_comment}</span>
                    </div>
                    \`;
                }
            } else {
                // 非表示ではない
                div.innerHTML = \`
                        <div class="markdown-content markdown-body">\${comment.html_content}</div>
                        <small style="color:#777;">\${comment.created_at || ''}</small>
                            <span class="reply-btn" data-comment-id="\${comment.id}"  style="text-decoration: none;">${t.reply_btn}</span>
                        <span class="report-btn" onclick="reportComment(\${comment.id})" style="text-decoration: none;">${t.report_comment}</span>
                        <span class="like-btn" data-comment-id="\${comment.id}" onclick="likeComment(\${comment.id})" style="text-decoration: none;">\${comment.liked ? '${t.liked}': '${t.like}'}\${comment.likes > 0 ? \`(\${comment.likes})\`: ''}</span>
                        \${authed ? \`<span onclick="toggleHideComment(\${comment.id})" style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">${t.hide}</span>  <span onclick="togglePinComment(\${comment.id})"  style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">\${comment.pinned ? '${t.unhide}' : '${t.hide}'}</span>\` : ''}
                \`;
            }
        // 子返信がある場合
            if (comment.replies && comment.replies.length > 0) {
                    comment.replies.forEach(r => {
                            div.appendChild(renderCommentItem(r));
                    });
            }
                return div;
            }

            // フロントエンドで「非表示」コメントの表示/折りたたみ
            window.toggleHiddenContent = (trigger, commentId) => {
                const wrapper = trigger.closest('.hidden-comment-placeholder').nextElementSibling;
                if (!wrapper) return;
                const isHidden = (wrapper.style.display === 'none');
                wrapper.style.display = isHidden ? 'block' : 'none';
                    trigger.textContent = isHidden ? '${t.collapse_comment}' : '${t.view_comment}';
            };

            // 個別コメントの非表示切り替え（管理者のみ）
            window.toggleHideComment = async (commentId) => {
                const res = await fetch('/admin/comment/' + commentId + '/toggleHide', { method: 'POST' });
                if (res.ok) {
                    showNotification('${t.notification_comment_hidden_toggle}');
                    // ローカルで更新
                    const index = comments.findIndex(c => c.id === commentId);
                    if (index !== -1) {
                            comments[index].hidden = comments[index].hidden === 1 ? 0 : 1;
                    }
                    renderComments(comments);
                } else {
                    showNotification('${t.notification_toggle_failed}：' + (await res.text()));
                }
            }
        // 個別コメントのピン留め切り替え（管理者のみ）
            window.togglePinComment = async (commentId) => {
                const res = await fetch('/admin/comment/' + commentId + '/togglePin', { method: 'POST' });
                if (res.ok) {
                        showNotification('${t.notification_toggle_success}');
                        // ローカルで更新
                        const index = comments.findIndex(c => c.id === commentId);
                        if (index !== -1) {
                                comments[index].pinned = comments[index].pinned === 1 ? 0 : 1;
                        }
                        renderComments(comments);
                } else {
                    showNotification('${t.notification_toggle_failed}：' + (await res.text()));
                }
            }
            // 入力ボックスを監視
            const newCommentInput = document.getElementById('newComment');
                const submitButton = document.getElementById('submitBtn');
            const submitTooltip = document.getElementById('submitTooltip');
        const cfChallenge = document.querySelector('.cf-challenge');
        function checkFormValidity() {
            if(newCommentInput.value.trim() && cfChallenge.querySelector('[name="cf-turnstile-response"]')?.value){
                    submitButton.disabled = false;
                    submitTooltip.style.visibility = 'hidden';
                } else {
                        submitButton.disabled = true;
                        submitTooltip.style.visibility = 'visible';
                    if(!newCommentInput.value.trim()){
                            submitTooltip.textContent = '${t.notification_comment_missing_content}';
                    } else if(!cfChallenge.querySelector('[name="cf-turnstile-response"]')?.value){
                            submitTooltip.textContent = '${t.turnstile_verification_required}'; // 日本語キーを使用
                    }
                }
            }
        newCommentInput.addEventListener('input', checkFormValidity);
        cfChallenge.addEventListener('DOMSubtreeModified', checkFormValidity);
                // コメント入力の表示
                document.getElementById('showInputBtn').addEventListener('click', () => {
                document.getElementById('commentForm').style.display = 'flex';
                document.getElementById('showCommentInput').style.display = 'none';
                    // Turnstileの初期化
                    const challengeDiv = document.querySelector('.cf-challenge');
                    challengeDiv.innerHTML = '';
                        challengeDiv.style.display = 'block';
                    if (window.turnstile) {
                        turnstile.render(challengeDiv, {
                        sitekey: '${env.TURNSTILE_SITEKEY || ''}',
                                theme: '${theme}',
                        });
                    } else {
                        document.addEventListener('turnstile-ready', () => {
                        turnstile.render(challengeDiv, {
                            sitekey: '${env.TURNSTILE_SITEKEY || ''}',
                                theme: '${theme}',
                            });
                        });
                    }
                });
            // 返信を開始
            document.addEventListener('click', e => {
                    if (e.target && e.target.classList.contains('reply-btn')) {
                        const commentId = e.target.dataset.commentId;
                            document.getElementById('parentId').value = commentId;
                        document.getElementById('commentForm').style.display = 'flex';
                        document.getElementById('showCommentInput').style.display = 'none';
                    document.getElementById('newComment').focus();
                        // Turnstileの初期化
                            const challengeDiv = document.querySelector('.cf-challenge');
                        challengeDiv.innerHTML = '';
                            challengeDiv.style.display = 'block';
                    if (window.turnstile) {
                            turnstile.render(challengeDiv, {
                        sitekey: '${env.TURNSTILE_SITEKEY || ''}',
                                theme: '${theme}',
                        });
                    } else {
                        document.addEventListener('turnstile-ready', () => {
                        turnstile.render(challengeDiv, {
                            sitekey: '${env.TURNSTILE_SITEKEY || ''}',
                                theme: '${theme}',
                            });
                        });
                    }
                }
            });

                // コメントを送信
                submitButton.addEventListener('click', async () => {
                    const content = document.getElementById('newComment').value.trim();
                    const parentId = document.getElementById('parentId').value || '0';
                    if (!content) {
                        showNotification('${t.notification_comment_missing_content}');
                        return;
                    }
            // Turnstileトークン
                    const token = document.querySelector('[name="cf-turnstile-response"]')?.value || '';
                    const formData = new FormData();
                    formData.append('content', content);
                    formData.append('parent_id', parentId);
                    formData.append('cf-turnstile-response', token);
                const res = await fetch('/area/${areaKey}/comment', { method: 'POST', body: formData });
                    if (res.ok) {
                        document.getElementById('newComment').value = '';
                        document.getElementById('parentId').value = '0';
                            // コメントを再取得
                        const res = await fetch('/area/${areaKey}/comments');
                        if (!res.ok) {
                                showNotification('${t.notification_comment_submit_failed}：' + (await res.text()));
                                return;
                    }
                        comments = await res.json();
                        renderComments(comments);
                    // Turnstileを非表示にし、リセット
                    const challengeDiv = document.querySelector('.cf-challenge');
                    challengeDiv.style.display = 'none';
                    setTimeout(() => {
                    challengeDiv.innerHTML = '';
                    challengeDiv.style.display = 'block';
                        // Turnstileを再レンダリング
                        turnstile.render(challengeDiv, {
                            sitekey: '${env.TURNSTILE_SITEKEY || ''}',
                                theme: '${theme}',
                        });
                    }, 100);
                    } else {
                            showNotification('${t.notification_comment_submit_failed}：' + (await res.text()));
                    }
                });
            // コメントに「いいね」
            window.likeComment = async (commentId) => {
                    const res = await fetch('/area/${areaKey}/comment/' + commentId + '/like', { method: 'POST' });
                    if (res.ok) {
                        // ローカルで更新
                            const index = comments.findIndex(c => c.id === commentId);
                            if (index !== -1) {
                                    comments[index].liked = !comments[index].liked;
                                    comments[index].likes = comments[index].liked ? comments[index].likes +1 : comments[index].likes -1;
                            }
                        renderComments(comments);
                } else {
                    showNotification('${t.notification_toggle_failed}：' + (await res.text()));
                }
            }
            // コメントをレポート
            window.reportComment = async (commentId) => {
                const reason = prompt('${t.report_comment}:');
                if (!reason) return;
                const formData = new FormData();
                formData.append('reason', reason);
            const res = await fetch('/area/${areaKey}/comment/' + commentId + '/report', {
                    method: 'POST',
                        body: formData
                });
                if (res.ok) {
                        showNotification('${t.notification_report_success}');
                    } else {
                        showNotification('${t.notification_report_failed}：' + (await res.text()));
                }
            }
        loadComments();
        // テーマと言語の初期化
            document.documentElement.setAttribute('data-theme', '${theme}');
            document.documentElement.lang = '${lang}';
            // テーマの切り替え
        const toggleThemeBtn = document.getElementById('toggleTheme');
        if(toggleThemeBtn){
        toggleThemeBtn.addEventListener('click', async () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        const res = await fetch('/setTheme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: newTheme }) });
        if (res.ok) {
        document.documentElement.setAttribute('data-theme', newTheme);
        toggleThemeBtn.textContent = newTheme === 'light' ? '${t.dark}' : '${t.light}';
        } else {
        showNotification('${t.notification_toggle_failed}：' + (await res.text()));
        }
        });
        }

        // 言語の切り替え
        const toggleLangBtn = document.getElementById('toggleLang');
        if(toggleLangBtn){
        toggleLangBtn.addEventListener('click', async () => {
        const currentLang = document.documentElement.lang || 'ja';
        const newLang = currentLang === 'ja' ? 'en' : 'ja';
        const res = await fetch('/setLang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: newLang }) });
        if(res.ok){
        document.documentElement.lang = newLang;
        toggleLangBtn.textContent = newLang === 'ja' ? 'EN' : '日本語';
            location.reload();
        }   else {
        showNotification('${t.notification_toggle_failed}：' + (await res.text()));
        }
        });
        }
            function sendHeight() {
                  console.log("Sending iframe height " + document.documentElement.scrollHeight + "   ${areaKey}");
                   window.parent.postMessage({
                    type: 'iframe-resize',
                    height: document.documentElement.scrollHeight,
                    id: '${areaKey}'
                   }, '*'); // すべてのオリジンをターゲットにする - 本番環境では注意が必要
                  }
               window.onload = function() {
                   console.log("iframe onload");
                   sendHeight();
                   // コンテンツが動的に変更されたときに高さを再送信する
                    const observer = new MutationObserver(sendHeight);
                     observer.observe(document.body, { childList: true, subtree: true });
                }
        </script>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    </body>
    </html>
`;
    return new Response(html, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8',
            'Access-Control-Allow-Origin': '*', // すべてのオリジンを許可
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
    });
}


 /** ホームページ：未ログイン => ログイン表示; ログイン済み => 管理パネル(詳細情報を表示) */
 async function handleHomePage(request: Request, env: Env, lang: string, theme: string): Promise<Response> {
     const cookie = parseCookie(request.headers.get("Cookie"));
     const authed = (cookie.auth === "1");
     const url = new URL(request.url);
     const t = i18n[lang] || i18n['en'];
     // 管理者の議論エリアリスト、レポートリストなどのJSONを取得したい場合
     if (url.searchParams.get('_extendedInfo') === '1' && authed) {
         return handleAdminExtendedInfo(request, env);
     }
     const html = `
 <!DOCTYPE html>
 <html lang="${lang}" data-theme="${theme}">
 <head>
 <meta charset="UTF-8">
 <title>${t.home_title}</title>
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown.min.css" crossorigin="anonymous">
 <style>
 body {
     background: var(--bg-color); color: var(--text-color); font-family: sans-serif;
     max-width: 800px; margin: 40px auto; padding: 20px;
 }
 h1 { margin-bottom: 20px; }
 a { color: var(--link-color); text-decoration: none; }
 a:hover { color: var(--link-hover-color); }
 ul { list-style: none; padding: 0; }
 li { margin-bottom: 10px; }
 
 .hidden { display: none; }
 
 .form-group {
     display: flex; flex-direction: column; margin: 20px 0;
     margin: 20px 0;
 }
 .form-group input {
     background: var(--input-bg-color); border: 1px solid var(--border-color); padding: 10px; color: var(--text-color); font-size: 14px; margin-bottom: 10px;
 }
 .form-group button {
     background: var(--button-bg-color); color: var(--button-text-color); border: none; padding: 10px; font-size: 14px; cursor: pointer;
     transition: background 0.3s ease, transform 0.2s ease;
 }
 .form-group button:hover {
     background: var(--button-hover-color); transform: scale(1.02);
 }
 
 hr { border: none; border-bottom: 1px solid var(--border-color); margin: 20px 0; }
 
 .notification-bar {
     position: fixed; bottom: 0; left: 0; width: 100%; background: var(--notification-bg-color); color: var(--notification-text-color); padding: 10px 20px;
     display: flex; align-items: center; justify-content: space-between; font-size: 14px; z-index: 9999;
 }
 .notification-bar.hidden { display: none; }
 .close-btn { cursor: pointer; margin-left: 20px; font-weight: bold; }
 .admin-section { margin-top: 30px; }
 
 .table-like { width: 100%; border-collapse: collapse; }
 .table-like th, .table-like td { border: none; padding: 8px; text-align: left;} /*  テーブルボーダーを削除 */
 .table-like th { background: var(--table-header-bg-color); }
 
 @media (max-width: 600px) {
 body { margin: 20px auto; padding: 10px; }
 }
 
 /* 深色・浅色テーマ */
 :root {
   --bg-color: #121212;
   --text-color: #fff;
   --link-color: #bbb;
   --link-hover-color: #fff;
   --input-bg-color: #1e1e1e;
   --border-color: #444;
   --button-bg-color: #333;
   --button-text-color: #fff;
   --button-hover-color: #444;
   --notification-bg-color: #2a2a2a;
     --notification-text-color: #fff;
   --table-header-bg-color: #1e1e1e;
 
 }
 
 [data-theme="light"] {
     --bg-color: #ffffff;
     --text-color: #333;
     --link-color: #555;
   --link-hover-color: #000;
     --input-bg-color: #eee;
     --border-color: #ccc;
   --button-bg-color: #ddd;
     --button-text-color: #333;
     --button-hover-color: #eee;
     --notification-bg-color: #f0f0f0;
     --notification-text-color: #333;
       --table-header-bg-color: #eee;
 }
 .top-actions {
     margin-bottom: 20px;
     display: flex;
     justify-content: flex-end;
 }
 .top-actions button {
     background: var(--button-bg-color); color: var(--button-text-color); border: none; padding: 8px 12px; cursor: pointer; border-radius: 3px;
     transition: background 0.3s ease, transform 0.2s ease;
     margin-left: 10px;
 }
 
 .top-actions button:hover {
     background: var(--button-hover-color); transform: scale(1.02);
 }
 </style>
 </head>
 <body>
 <div class="top-actions">
 <button id="toggleTheme">${theme === 'light' ? t.dark : t.light}</button>
 <button id="toggleLang">${lang === 'ja' ? 'EN' : '日本語'}</button>
 </div>
 <h1>${t.home_title}</h1>
 <!-- 通知バー -->
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
 <textarea id="areaIntro" placeholder="${t.area_intro_placeholder}"
          style="background:var(--input-bg-color);color:var(--text-color);border:1px solid var(--border-color);height:60px;font-size:14px;margin-bottom:10px;"></textarea>
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
 
 if (authed) {
 // 管理情報をロードする
 fetchExtendedInfo();
 }
 // ログインボタン
 const loginBtn = document.getElementById('loginBtn');
 if (loginBtn) {
 loginBtn.addEventListener('click', async () => {
     const pw = document.getElementById('passwordInput').value.trim();
     if (!pw) {
         showNotification('${t.notification_input_password}');
         return;
     }
     const res = await fetch('/login', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ password: pw })
     });
     const data = await res.json();
     if (!data.success) {
         showNotification(data.message || '${t.notification_login_failed}');
     } else {
         location.reload();
     }
 });
 }
 
 // 議論エリアの作成
 const createAreaBtn = document.getElementById('createAreaBtn');
 if (createAreaBtn) {
 createAreaBtn.addEventListener('click', async () => {
     const areaName = document.getElementById('areaName').value.trim();
     const areaKey = document.getElementById('areaKey').value.trim();
     const areaIntro = document.getElementById('areaIntro').value.trim();
     if (!areaName || !areaKey) {
         showNotification('${t.notification_missing_input}');
         return;
     }
     const formData = new FormData();
     formData.append('area_name', areaName);
     formData.append('area_key', areaKey);
     formData.append('intro', areaIntro);
     const res = await fetch('/create', { method: 'POST', body: formData });
     if (res.ok) {
         showNotification('${t.notification_create_success}');
      // クリア
      document.getElementById('areaName').value = '';
       document.getElementById('areaKey').value = '';
       document.getElementById('areaIntro').value = '';
      await fetchExtendedInfo(); // 更新
     } else {
         showNotification('${t.notification_create_failed}：' + (await res.text()));
     }
 });
 }
 
 async function fetchExtendedInfo() {
 // 管理者パネルの情報を取得する
 const res = await fetch('/?_extendedInfo=1');
 if (!res.ok) {
 document.getElementById('areaList').textContent = 'ロード失敗';
 document.getElementById('reportList').textContent = 'ロード失敗';
 return;
 }
 const data = await res.json();
 renderAreaList(data.areas);
 renderReportList(data.reports);
 }
 
 // 議論エリアリストのレンダリング
 function renderAreaList(areas) {
 const div = document.getElementById('areaList');
 if (areas.length === 0) {
 div.textContent = '${t.no_areas}';
 return;
 }
 
 let html = \`
 <table class="table-like">
 <thead>
     <tr>
         <th>${t.area_id}</th>
         <th>${t.area_name}</th>
         <th>${t.area_key}</th>
         <th>${t.area_hidden}</th>
         <th>${t.area_intro}</th>
         <th>${t.area_comments}</th>
         <th>${t.area_action}</th>
     </tr>
 </thead>
 <tbody>
 \`;
 
 areas.forEach(a => {
 html += \`
 <tr>
     <td>\${a.id}</td>
     <td>\${a.name}</td>
     <td>\${a.area_key}</td>
     <td>\${a.hidden ? '${t.hide}' : '${t.unhide}'}</td>
     <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
         \${a.intro || ''}
     </td>
     <td>\${a.comment_count}</td>
     <td>
         <a href="/area/\${encodeURIComponent(a.area_key)}" target="_blank">${t.view}</a>
          <span onclick="toggleHideArea('\${encodeURIComponent(a.area_key)}')"  style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">
           \${a.hidden ? '${t.unhide}' : '${t.hide}'}
         </span>
         <span onclick="deleteArea('\${encodeURIComponent(a.area_key)}')" style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">${t.delete}</span>
     </td>
 </tr>
 \`;
 });
 
 html += \`
 </tbody>
 </table>
 \`;
 div.innerHTML = html;
 }
 // レポートリストのレンダリング
 function renderReportList(reports) {
 const div = document.getElementById('reportList');
 if (reports.length === 0) {
   div.textContent = '${t.no_reports}';
   return;
 }
 let html = \`
 <table class="table-like">
 <thead>
     <tr>
     <th>${t.report_id}</th>
     <th>${t.report_comment_id}</th>
     <th>${t.report_content}</th>
     <th>${t.report_reason}</th>
     <th>${t.report_created_at}</th>
     <th>${t.report_resolved}</th>
     <th>${t.area_action}</th>
     </tr>
 </thead>
 <tbody>
 \`;
 reports.forEach(r => {
 html += \`
 <tr>
     <td>\${r.id}</td>
     <td>\${r.comment_id}</td>
     <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
     \${r.comment_content || ''}
     </td>
 <td>\${r.reason}</td>
 <td>\${r.created_at}</td>
 <td>\${r.resolved ? '${t.hide}' : '${t.unhide}'}</td>
 <td>
     \${r.resolved ? '' : \`<span onclick="resolveReport(\${r.id})" style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">${t.resolve_report}</span>\`}
     <span onclick="toggleHideComment(\${r.comment_id})" style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">${t.toggle_hide_comment}</span>
     </td>
 </tr>
 \`;
 });
 html += \`
 </tbody>
 </table>
 \`;
 div.innerHTML = html;
 }
 
 // 議論エリアの非表示切り替え
 async function toggleHideArea(areaKey) {
 const res = await fetch('/admin/area/' + areaKey + '/toggleHide', { method: 'POST' });
 if (res.ok) {
   showNotification('${t.notification_toggle_success}');
   await fetchExtendedInfo();
 } else {
   showNotification('${t.notification_toggle_failed}：' + (await res.text()));
 }
 }
 
 // 個別コメントの非表示切り替え
 async function toggleHideComment(commentId) {
 const res = await fetch('/admin/comment/' + commentId + '/toggleHide', { method: 'POST' });
 if (res.ok) {
   showNotification('${t.notification_comment_hidden_toggle}');
   await fetchExtendedInfo();
 } else {
   showNotification('${t.notification_toggle_failed}：' + (await res.text()));
 }
 }
 // 個別コメントのピン留め状態を切り替える
 async function togglePinComment(commentId) {
 const res = await fetch('/admin/comment/' + commentId + '/togglePin', { method: 'POST' });
 if (res.ok) {
 showNotification('${t.notification_toggle_success}');
 await fetchExtendedInfo();
 } else {
 showNotification('${t.notification_toggle_failed}：' + (await res.text()));
 }
 }
 // 議論エリアの削除
 async function deleteArea(areaKey) {
 if (!confirm('${t.delete_confirm}')) return;
 const res = await fetch('/admin/area/' + areaKey + '/delete', { method: 'POST' });
 if (res.ok) {
     showNotification('${t.notification_delete_success}');
   await fetchExtendedInfo();
 } else {
     showNotification('${t.notification_delete_failed}：' + (await res.text()));
 }
 }
 
 // レポートを処理する
 async function resolveReport(reportId) {
 const res = await fetch('/admin/reports/resolve/' + reportId, { method: 'POST' });
 if (res.ok) {
 showNotification('${t.notification_report_resolved}');
 await fetchExtendedInfo();
 } else {
 showNotification('${t.notification_toggle_failed}：' + (await res.text()));
 }
 }
 
 // テーマを切り替える
 const toggleThemeBtn = document.getElementById('toggleTheme');
 toggleThemeBtn.addEventListener('click', async () => {
 const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
 const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
 const res = await fetch('/setTheme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: newTheme }) });
  if (res.ok) {
     document.documentElement.setAttribute('data-theme', newTheme);
     toggleThemeBtn.textContent = newTheme === 'light' ? '${t.dark}' : '${t.light}';
  }  else {
     showNotification('${t.notification_toggle_failed}：' + (await res.text()));
 }
 });
 
 // 言語を切り替える
 const toggleLangBtn = document.getElementById('toggleLang');
 toggleLangBtn.addEventListener('click', async () => {
 const currentLang = document.documentElement.lang || 'ja';
 const newLang = currentLang === 'ja' ? 'en' : 'ja';
 const res = await fetch('/setLang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: newLang }) });
 if(res.ok){
 document.documentElement.lang = newLang;
 toggleLangBtn.textContent = newLang === 'ja' ? 'EN' : '日本語';
     location.reload();
 }   else {
 showNotification('${t.notification_toggle_failed}：' + (await res.text()));
 }
 });
 </script>
 <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
 </body>
 </html>
 `;
     return new Response(html, {
         headers: { "Content-Type": "text/html;charset=UTF-8",
             'Access-Control-Allow-Origin': '*',
             'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
             'Access-Control-Allow-Headers': 'Content-Type'
         }
     });
 }
 /** 管理者の「詳細情報」(議論エリアリスト + レポートリスト) JSON を返す */
 async function handleAdminExtendedInfo(request: Request, env: Env): Promise<Response> {
     const cookie = parseCookie(request.headers.get("Cookie"));
     const authed = cookie.auth === "1";
     if (!authed) {
         return new Response("Unauthorized", { status: 401 });
     }
     // 議論エリアリストをクエリする（コメント数を含む）
     const areasRes = await env.DB.prepare(`
 SELECT
 a.id,
 a.name,
 a.area_key,
 a.intro,
 a.hidden,
 (SELECT COUNT(*) FROM comments c WHERE c.area_key = a.area_key) as comment_count
 FROM comment_areas a
 ORDER BY a.id DESC
 `).all<CommentArea & { comment_count: number }>();
     const areas = areasRes.results || [];
     // レポートリストをクエリする（コメント情報と関連付け）
     const reportsRes = await env.DB.prepare(`
 SELECT
 r.id,
 r.comment_id,
 r.reason,
 r.created_at,
 r.resolved,
 c.content as comment_content
 FROM reports r
 LEFT JOIN comments c on c.id = r.comment_id
 ORDER BY r.id DESC
 `).all<{ id: number; comment_id: number; reason: string; created_at: string; resolved: number; comment_content: string | null; }>();
     const reports = reportsRes.results || [];
     return new Response(JSON.stringify({ areas, reports }), {
         status: 200,
         headers: { "Content-Type": "application/json;charset=UTF-8" }
     });
 }
 
 /** 管理者ログイン */
 async function handleLogin(request: Request, env: Env): Promise<Response> {
     try {
         const data: { password?: string } = await request.json();
         const password = data.password || '';
         const lang = await getLanguage(request); // 言語を取得
         const t = i18n[lang] || i18n['en']; // 翻訳文字列を取得
 
         if (password === env.ADMIN_PASS) {
             // パスワードが正しい => クッキーを設定
             const res = new Response(JSON.stringify({ success: true }), {
                 headers: { 'Content-Type': 'application/json;charset=UTF-8' }
             });
             setCookie('auth', '1', res);
             return res;
         } else {
             return new Response(JSON.stringify({ success: false, message: t.notification_login_failed }), { // 翻訳文字列を使用
                 status: 200,
                 headers: { 'Content-Type': 'application/json;charset=UTF-8' }
             });
         }
     } catch (err: any) {
         return new Response(JSON.stringify({ success: false, message: err.message }), {
             status: 400,
             headers: { 'Content-Type': 'application/json;charset=UTF-8' }
         });
     }
 }
 
 /** 管理者が新しい議論エリアを作成する */
 async function handleCreateCommentArea(request: Request, env: Env): Promise<Response> {
     const cookie = parseCookie(request.headers.get("Cookie"));
     if (cookie.auth !== "1") {
         return new Response("Unauthorized", { status: 401 });
     }
 
     const formData = await request.formData();
     const name = String(formData.get('area_name') || '');
     const key = String(formData.get('area_key') || '');
     const intro = formData.get('intro') || '';
 
     if (!name || !key) {
         return new Response("Name or key is empty", { status: 400 });
     }
 
     await env.DB.prepare(`
 INSERT INTO comment_areas (name, area_key, intro) VALUES (?, ?, ?)
 `).bind(name, key, intro).run();
 
     return new Response("OK", { status: 200 });
 }
 
 /** 単一の議論エリアページを表示する（訪問者向け、非表示の場合は403） */
 async function handleCommentAreaPage(request: Request, env: Env, lang: string, theme: string): Promise<Response> {
     const url = new URL(request.url);
      const areaKey = decodeURIComponent(url.pathname.replace(/^\/area\//, ''));
     const t = i18n[lang] || i18n['en'];
     const area: CommentArea | null = await env.DB.prepare(`
 SELECT * FROM comment_areas WHERE area_key = ?
 `).bind(areaKey).first<CommentArea>();
 
     if (!area) {
         return new Response(t.notification_not_found, { status: 404 }); // 翻訳文字列を使用
     }
     if (area.hidden === 1) {
         // 議論エリアが非表示の場合、訪問者はアクセス不可
         return new Response(t.notification_unauthorized, { status: 403 }); // 翻訳文字列を使用
     }
   // 議論エリアページを表示
 const html = `
 <!DOCTYPE html>
 <html lang="${lang}" data-theme="${theme}">
 <head>
 <meta charset="UTF-8">
 <title>${area.name}</title>
 <meta name="viewport" content="width=device-width,initial-scale=1.0">
 <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown.min.css" crossorigin="anonymous">
 <style>
 body {
     background: var(--bg-color); color: var(--text-color); font-family: sans-serif;
     max-width: 800px; margin: 40px auto; padding: 20px;
 }
 a { color: var(--link-color); text-decoration: none; }
 a:hover { color: var(--link-hover-color); }
 .hint { color: var(--hint-color); margin-bottom: 10px; }
 .comment-list { margin-top: 20px; }
 .comment-item {
         margin-bottom: 15px; padding: 10px; background: var(--comment-bg-color); border-radius: 4px;
         /* border: 1px solid var(--border-color); */
     }
 .reply-item { margin-left: 20px; }
 .reply-btn, .report-btn, .like-btn {
         margin-left: 10px; color: var(--hint-color); cursor: pointer; font-size: 12px;
         display: inline-block;
 }
 .like-btn.liked {
             color: var(--link-color);
 }
 .reply-box { margin-top: 5px; }
 .markdown-content { font-size: 14px; color: var(--comment-text-color); }
 .form-group {
 display:flex;flex-direction:row;align-items: flex-start;
 margin: 20px 0;
 }
 .form-group textarea {
     background: var(--input-bg-color); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px; width: 100%; height: 60px;
     resize: vertical; margin-bottom: 10px; font-size: 14px;
 }
 .form-group .comment-action {
 display:flex;flex-direction:column;justify-content: flex-end;align-items: flex-end;
 }
 .form-group button {
         background: var(--button-bg-color); color: var(--button-text-color); border: none; padding: 6px 10px; cursor: pointer; border-radius: 3px;
         transition: background 0.3s ease, transform 0.2s ease;
         margin-left: 5px;
         font-size: 12px;
         white-space: nowrap;
 }
 .form-group button:hover {
         background: var(--button-hover-color); transform: scale(1.02);
 }
 .form-group button[disabled] {
     background: #ddd; /* 禁用状態時の背景色 */
     color: #999; /* 禁用状態時の文字色 */
     cursor: not-allowed; /* 禁用状態時のマウスカーソル */
 }
 .form-group button[disabled]:hover{
   background: #ddd; /* 禁用状態時の背景色 */
     color: #999; /* 禁用状態時の文字色 */
      transform:none;
 }
 .comment-tip {
 font-size: 0.8em;
     color: var(--hint-color);
     margin-top: 5px;
     white-space: nowrap;
 }
 .cf-challenge {
     margin-bottom: 10px;
 }
 /* ツールチップ */
 .tooltip {
         position: relative;
         display: inline-block;
     }
 .tooltip .tooltiptext {
         visibility: hidden;
         background-color: var(--hint-color);
         color: var(--text-color);
         text-align: center;
         border-radius: 6px;
         padding: 5px;
         position: absolute;
         z-index: 1;
         bottom: 125%;
         left: 50%;
         margin-left: -60px;
         font-size: 0.8em;
         white-space: nowrap;
         opacity: 0;
     transition: opacity 0.3s;
     }
     .tooltip:hover .tooltiptext {
         visibility: visible;
         opacity: 1;
 }
 .notification-bar {
         position: fixed; bottom: 0; left: 0; width: 100%; background: var(--notification-bg-color); color: var(--notification-text-color); padding: 10px 20px;
         display: flex; align-items: center; justify-content: space-between; font-size: 14px; z-index: 9999;
 }
 .notification-bar.hidden { display: none; }
 .close-btn { cursor: pointer; margin-left: 20px; font-weight: bold; }
 
 /* 隠されたコメントの場合、プレースホルダー/ボタンのみ表示 */
 .hidden-comment-placeholder {
         font-style: italic;
         color: var(--hint-color);
 }
 .show-btn {
         color: var(--link-color);
         margin-left: 8px;
         cursor: pointer;
 }
 .show-btn:hover {
         text-decoration: underline;
 }
 .show-comment-input {
       margin-top: 10px;
         text-align: left;
     }
 .show-comment-input button {
             background: var(--button-bg-color); color: var(--button-text-color); border: none; padding: 8px 12px; cursor: pointer; border-radius: 3px;
             transition: background 0.3s ease, transform 0.2s ease;
       margin-bottom: 10px;
     }
 .show-comment-input button:hover {
     background: var(--button-hover-color); transform: scale(1.02);
     }
 /* 深色・浅色テーマ */
    :root {
        --bg-color: #121212;
         --text-color: #fff;
       --link-color: #bbb;
         --link-hover-color: #fff;
       --input-bg-color: #1e1e1e;
         --border-color: #444;
         --button-bg-color: #333;
         --button-text-color: #fff;
     --button-hover-color: #444;
         --notification-bg-color: #2a2a2a;
         --notification-text-color: #fff;
         --comment-bg-color: #1e1e1e;
       --comment-text-color:#ccc;
             --hint-color:#aaa;
     }
 
     [data-theme="light"] {
           --bg-color: #ffffff;
         --text-color: #333;
         --link-color: #555;
       --link-hover-color: #000;
         --input-bg-color: #eee;
         --border-color: #ccc;
     --button-bg-color: #ddd;
         --button-text-color: #333;
     --button-hover-color: #eee;
         --notification-bg-color: #f0f0f0;
         --notification-text-color: #333;
          --comment-bg-color: #eee;
         --comment-text-color:#555;
       --hint-color:#777;
     }
 .top-actions {
   margin-bottom: 20px;
     display: flex;
     justify-content: flex-end;
 }
 .top-actions button {
     background: var(--button-bg-color); color: var(--button-text-color); border: none; padding: 8px 12px; cursor: pointer; border-radius: 3px;
     transition: background 0.3s ease, transform 0.2s ease;
       margin-left: 10px;
     }
     
     .top-actions button:hover {
       background: var(--button-hover-color); transform: scale(1.02);
     }
         .markdown-content.markdown-body{
         background-color: inherit;
         }
 </style>
 </head>
 <body>
 <div class="top-actions">
 <button id="toggleTheme">${theme === 'light' ? t.dark : t.light}</button>
 <button id="toggleLang">${lang === 'ja' ? 'EN' : '日本語'}</button>
 </div>
 <h1>${area.name}</h1>
 <div class="hint">${area.intro || ''}</div>
     
 <div class="show-comment-input" id="showCommentInput">
 <button id="showInputBtn">${t.show_comment_input}</button>
 </div>
 <div id="commentForm" class="form-group" style="display: none;">
     <textarea id="newComment" placeholder="${t.comment_placeholder}"></textarea>
     <div class="comment-action">
         <input type="hidden" id="parentId" value="0" />
         <div class="cf-challenge" data-sitekey="${env.TURNSTILE_SITEKEY || ''}" data-theme="auto" style="display:none;"></div>
         <div class="tooltip">
         <button id="submitBtn" disabled>${t.submit_comment_btn}
             <span class="tooltiptext" id="submitTooltip">${t.notification_missing_input}</span>
         </button>
         </div>
         <div class="comment-tip">${t.comment_tip}</div>
     </div>
 </div>
     
 <div class="comment-list" id="commentList">${t.loading}</div>
 <!-- 通知バー -->
 <div id="notificationBar" class="notification-bar hidden">
     <span id="notificationText"></span>
     <span id="closeNotification" class="close-btn">×</span>
 </div>
 <script>
 const notificationBar = document.getElementById('notificationBar');
 const notificationText = document.getElementById('notificationText');
 const closeNotification = document.getElementById('closeNotification');
 closeNotification.addEventListener('click', () => notificationBar.classList.add('hidden'));
 function showNotification(msg) {
 notificationText.textContent = msg;
 notificationBar.classList.remove('hidden');
 }
 let commentList =  document.getElementById('commentList');
 let comments = []; // コメントデータをキャッシュ
 async function loadComments() {
 commentList.textContent = '${t.loading}';
 const res = await fetch(location.pathname + '/comments');
 if (!res.ok) {
 commentList.textContent = '${t.notification_not_found}';
 return;
 }
 comments = await res.json();
 renderComments(comments);
 }
 // フラットなコメントデータをツリー構造に組み立てる
 function buildCommentTree(list) {
   const map = {};
     list.forEach(c => { map[c.id] = { ...c, replies: [] }; });
     const roots = [];
     list.forEach(c => {
         if (c.parent_id && c.parent_id !== 0) {
             map[c.parent_id]?.replies.push(map[c.id]);
         } else {
                 roots.push(map[c.id]);
         }
     });
     return roots;
 }
 // 管理者ログインを判断
 const authed = document.cookie.includes('auth=1');
 // コメントツリーをレンダリング
 function renderComments(comments) {
 commentList.innerHTML = '';
 if (comments.length === 0) {
 commentList.textContent = '${t.no_comments}';
 return;
 }
 const tree = buildCommentTree(comments);
 tree.forEach(comment => {
     commentList.appendChild(renderCommentItem(comment));
 });
 }
 function renderCommentItem(comment) {
 const div = document.createElement('div');
 div.className = 'comment-item' + (comment.parent_id ? ' reply-item' : '');
 // コメントが非表示の場合
 if (comment.hidden === 1) {
 // 管理者は原文を直接閲覧可能、一般ユーザーはデフォルトで折りたたまれる
 if (authed) {
     // 管理者ビュー: 原文と「非表示/復元」操作が表示される
     div.innerHTML = \`
         <div class="markdown-content markdown-body" style="border-left:2px solid #444; padding-left:8px;">
         [${t.comment_hidden}，${t.admin_panel_title}]<br/>
             \${comment.html_content}
         </div>
         <small style="color:#777;">\${comment.created_at || ''}</small>
     <span class="reply-btn" data-comment-id="\${comment.id}" style="text-decoration: none;">${t.reply_btn}</span>
         <span class="report-btn" onclick="reportComment(\${comment.id})" style="text-decoration: none;">${t.report_comment}</span>
     <span onclick="toggleHideComment(\${comment.id})"  style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">
             ${t.unhide}
     </span>
     \`;
 } else {
     // 一般ユーザー: 「このコメントは非表示です」のみ表示され、「表示」をクリックすると展開される
         div.innerHTML = \`
             <div class="hidden-comment-placeholder">
                 ${t.comment_hidden}
                   <span class="show-btn" onclick="toggleHiddenContent(this, \${comment.id})">${t.view_comment}</span>
             </div>
         <div class="hidden-content" style="display:none;">
                 <div class="markdown-content markdown-body">\${comment.html_content}</div>
             <small style="color:#777;">\${comment.created_at || ''}</small>
             <span class="reply-btn" data-comment-id="\${comment.id}" style="text-decoration: none;">${t.reply_btn}</span>
             <span class="report-btn" onclick="reportComment(\${comment.id})" style="text-decoration: none;">${t.report_comment}</span>
         </div>
         \`;
 }
 } else {
 // 非表示ではない
     div.innerHTML = \`
         <div class="markdown-content markdown-body">\${comment.html_content}</div>
             <small style="color:#777;">\${comment.created_at || ''}</small>
             <span class="reply-btn" data-comment-id="\${comment.id}" style="text-decoration: none;">${t.reply_btn}</span>
             <span class="report-btn" onclick="reportComment(\${comment.id})" style="text-decoration: none;">${t.report_comment}</span>
             <span class="like-btn" data-comment-id="\${comment.id}" onclick="likeComment(\${comment.id})" style="text-decoration: none;">\${comment.liked ? '${t.liked}': '${t.like}'}\${comment.likes > 0 ? \`(\${comment.likes})\`: ''}</span>
             \${authed ? \`<span onclick="toggleHideComment(\${comment.id})" style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">${t.hide}</span>  <span onclick="togglePinComment(\${comment.id})" style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">\${comment.pinned ? '${t.unhide}' : '${t.hide}'}</span>\` : ''}
     \`;
 }
 // 子返信がある場合
 if (comment.replies && comment.replies.length > 0) {
     comment.replies.forEach(r => {
         div.appendChild(renderCommentItem(r));
     });
 }
 return div;
 }
 
 // フロントエンドで「非表示」コメントの表示/折りたたみ
 window.toggleHiddenContent = (trigger, commentId) => {
     const wrapper = trigger.closest('.hidden-comment-placeholder').nextElementSibling;
      if (!wrapper) return;
     const isHidden = (wrapper.style.display === 'none');
       wrapper.style.display = isHidden ? 'block' : 'none';
         trigger.textContent = isHidden ? '${t.collapse_comment}' : '${t.view_comment}';
 };
 
 // 個別コメントの非表示切り替え（管理者のみ）
 window.toggleHideComment = async (commentId) => {
     const res = await fetch('/admin/comment/' + commentId + '/toggleHide', { method: 'POST' });
     if (res.ok) {
         showNotification('${t.notification_comment_hidden_toggle}');
         // ローカルで更新
         const index = comments.findIndex(c => c.id === commentId);
         if (index !== -1) {
             comments[index].hidden = comments[index].hidden === 1 ? 0 : 1;
          }
         renderComments(comments);
     } else {
         showNotification('${t.notification_toggle_failed}：' + (await res.text()));
     }
 }
 // 個別コメントのピン留め切り替え（管理者のみ）
 window.togglePinComment = async (commentId) => {
     const res = await fetch('/admin/comment/' + commentId + '/togglePin', { method: 'POST' });
         if (res.ok) {
                 showNotification('${t.notification_toggle_success}');
                 // ローカルで更新
                 const index = comments.findIndex(c => c.id === commentId);
                 if (index !== -1) {
                         comments[index].pinned = comments[index].pinned === 1 ? 0 : 1;
                   }
                 renderComments(comments);
        } else {
             showNotification('${t.notification_toggle_failed}：' + (await res.text()));
        }
 }
 // 入力ボックスを監視
 const newCommentInput = document.getElementById('newComment');
   const submitButton = document.getElementById('submitBtn');
 const submitTooltip = document.getElementById('submitTooltip');
 const cfChallenge = document.querySelector('.cf-challenge');
 function checkFormValidity() {
     if(newCommentInput.value.trim() && cfChallenge.querySelector('[name="cf-turnstile-response"]')?.value){
         submitButton.disabled = false;
         submitTooltip.style.visibility = 'hidden';
     } else {
         submitButton.disabled = true;
         submitTooltip.style.visibility = 'visible';
         if(!newCommentInput.value.trim()){
             submitTooltip.textContent = '${t.notification_comment_missing_content}';
         } else if(!cfChallenge.querySelector('[name="cf-turnstile-response"]')?.value){
             submitTooltip.textContent = '${t.turnstile_verification_required}';
         }
     }
 }
 
 newCommentInput.addEventListener('input', checkFormValidity);
 cfChallenge.addEventListener('DOMSubtreeModified', checkFormValidity);
 // コメント入力の表示
     document.getElementById('showInputBtn').addEventListener('click', () => {
      document.getElementById('commentForm').style.display = 'flex';
      document.getElementById('showCommentInput').style.display = 'none';
          // Turnstileの初期化
             const challengeDiv = document.querySelector('.cf-challenge');
              challengeDiv.innerHTML = '';
                 challengeDiv.style.display = 'block';
             if (window.turnstile) {
                  turnstile.render(challengeDiv, {
                   sitekey: '${env.TURNSTILE_SITEKEY || ''}',
                     theme: 'auto',
                 });
            } else {
                document.addEventListener('turnstile-ready', () => {
                  turnstile.render(challengeDiv, {
                    sitekey: '${env.TURNSTILE_SITEKEY || ''}',
                      theme: 'auto',
                     });
                 });
             }
 });
 // 返信を開始
 document.addEventListener('click', e => {
     if (e.target && e.target.classList.contains('reply-btn')) {
         const commentId = e.target.dataset.commentId;
         document.getElementById('parentId').value = commentId;
         document.getElementById('commentForm').style.display = 'flex';
         document.getElementById('showCommentInput').style.display = 'none';
         document.getElementById('newComment').focus();
          // Turnstileの初期化
             const challengeDiv = document.querySelector('.cf-challenge');
                 challengeDiv.innerHTML = '';
                 challengeDiv.style.display = 'block';
             if (window.turnstile) {
                  turnstile.render(challengeDiv, {
                   sitekey: '${env.TURNSTILE_SITEKEY || ''}',
                     theme: 'auto',
                 });
            } else {
                document.addEventListener('turnstile-ready', () => {
                  turnstile.render(challengeDiv, {
                    sitekey: '${env.TURNSTILE_SITEKEY || ''}',
                      theme: 'auto',
                     });
                 });
             }
     }
 });
    
 // コメントを送信
 submitButton.addEventListener('click', async () => {
     const content = document.getElementById('newComment').value.trim();
     const parentId = document.getElementById('parentId').value || '0';
     if (!content) {
         showNotification('${t.notification_comment_missing_content}');
         return;
     }
     // Turnstileトークン
     const token = document.querySelector('[name="cf-turnstile-response"]')?.value || '';
     const formData = new FormData();
     formData.append('content', content);
     formData.append('parent_id', parentId);
     formData.append('cf-turnstile-response', token);
     
     const res = await fetch(location.pathname + '/comment', { method: 'POST', body: formData });
         if (res.ok) {
             document.getElementById('newComment').value = '';
             document.getElementById('parentId').value = '0';
         // コメントを再取得
           const res = await fetch(location.pathname + '/comments');
           if (!res.ok) {
             showNotification('${t.notification_comment_submit_failed}：' + (await res.text()));
           return;
       }
         comments = await res.json();
         renderComments(comments);
         
       // Turnstileを非表示にし、リセット
       const challengeDiv = document.querySelector('.cf-challenge');
           challengeDiv.style.display = 'none';
           setTimeout(() => {
               challengeDiv.innerHTML = '';
               challengeDiv.style.display = 'block';
                // Turnstileを再レンダリング
                 turnstile.render(challengeDiv, {
                     sitekey: '${env.TURNSTILE_SITEKEY || ''}',
                     theme: 'auto',
                 });
           }, 100);
         } else {
             showNotification('${t.notification_comment_submit_failed}：' + (await res.text()));
         }
 });
 // コメントに「いいね」
 window.likeComment = async (commentId) => {
      const res = await fetch(location.pathname + '/comment/' + commentId + '/like', { method: 'POST' });
         if (res.ok) {
         // ローカルで更新
         const index = comments.findIndex(c => c.id === commentId);
             if (index !== -1) {
                 comments[index].liked = !comments[index].liked;
                 comments[index].likes = comments[index].liked ? comments[index].likes +1 : comments[index].likes -1;
             }
           renderComments(comments);
     } else {
         showNotification('${t.notification_toggle_failed}：' + (await res.text()));
     }
 }
 // コメントをレポート
 window.reportComment = async (commentId) => {
 const reason = prompt('${t.report_comment}:');
 if (!reason) return;
 const formData = new FormData();
 formData.append('reason', reason);
 const res = await fetch(location.pathname + '/comment/' + commentId + '/report', {
     method: 'POST',
       body: formData
 });
 if (res.ok) {
     showNotification('${t.notification_report_success}');
 } else {
     showNotification('${t.notification_report_failed}：' + (await res.text()));
 }
 }
 
 // 最初のコメントのロード
 loadComments();
 // テーマと言語の初期化
 document.documentElement.setAttribute('data-theme', '${theme}');
 document.documentElement.lang = '${lang}';
  // テーマを切り替える
 const toggleThemeBtn = document.getElementById('toggleTheme');
 if(toggleThemeBtn){
 toggleThemeBtn.addEventListener('click', async () => {
 const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
 const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
 const res = await fetch('/setTheme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: newTheme }) });
 if (res.ok) {
 document.documentElement.setAttribute('data-theme', newTheme);
 toggleThemeBtn.textContent = newTheme === 'light' ? '${t.dark}' : '${t.light}';
 } else {
 showNotification('${t.notification_toggle_failed}：' + (await res.text()));
 }
 });
 }
 
 // 言語を切り替える
 const toggleLangBtn = document.getElementById('toggleLang');
 if(toggleLangBtn){
 toggleLangBtn.addEventListener('click', async () => {
 const currentLang = document.documentElement.lang || 'ja';
 const newLang = currentLang === 'ja' ? 'en' : 'ja';
 const res = await fetch('/setLang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: newLang }) });
 if(res.ok){
 document.documentElement.lang = newLang;
 toggleLangBtn.textContent = newLang === 'ja' ? 'EN' : '日本語';
     location.reload();
 }   else {
 showNotification('${t.notification_toggle_failed}：' + (await res.text()));
 }
 });
 }
 </script>
 <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
 </body>
 </html>
 `;
     return new Response(html, {
         headers: { "Content-Type": "text/html;charset=UTF-8",
             'Access-Control-Allow-Origin': '*',
             'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
             'Access-Control-Allow-Headers': 'Content-Type'
         }
     });
 }
   
 /** コメントリストを取得 (JSON) */
 interface Comment {
    id: number;
    content: string;
    parent_id: number;
    created_at: string;
    hidden: number;
    likes: number;
    pinned: number;
    html_content?: string; // Optional, added in client-side logic
    liked?: boolean; // Optional, added in client-side logic
 }
 async function handleGetComments(request: Request, env: Env): Promise<Response> {
 const url = new URL(request.url);
 const areaKey = decodeURIComponent(url.pathname.replace(/^\/area\/|\/comments$/g, ''));
 // 議論エリアが非表示かどうかをチェック
 const area: { hidden: number } | null = await env.DB.prepare("SELECT hidden FROM comment_areas WHERE area_key=?").bind(areaKey).first<{ hidden: number }>();
 if (!area) return new Response(JSON.stringify([]), { status: 200 }); // エリアが存在しない場合も空のリストを返す
 if (area.hidden === 1) {
     // 非表示の場合 => 訪問者視点ではコメントなしと見なされる
     return new Response(JSON.stringify([]), { status: 200 });
 }
 const res: D1Result<Comment> = await env.DB.prepare(`
 SELECT id, content, parent_id, created_at, hidden, likes, pinned
 FROM comments
 WHERE area_key = ?
 ORDER BY created_at ASC
 `).bind(areaKey).all<Comment>();
 const list = res.results || [];
 // 各コメントにhtml_contentフィールドを追加する（Markdownレンダリング用）
 list.forEach((c: Comment) => {
     c.html_content = c.content;
     c.liked = false;
 });
 return new Response(JSON.stringify(list), {
     status: 200,
     headers: { "Content-Type": "application/json;charset=UTF-8",
         'Access-Control-Allow-Origin': '*',
         'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
         'Access-Control-Allow-Headers': 'Content-Type'
     }
 });
 }
 
 /** コメントを投稿する（返信＋Markdown対応） */
 async function handlePostComment(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const areaKey = decodeURIComponent(url.pathname.replace(/^\/area\/|\/comment$/g, ''));
    const formData = await request.formData();
    const content = plainTextToHtml(String(formData.get('content') || '')) || '';
    const parentId = parseInt(String(formData.get('parent_id') || '0'), 10);
    const tokenValue = formData.get('cf-turnstile-response');
    
    if (!content) {
        return new Response("Missing comment content", { status: 400 });
    }
    
    // Turnstile 認証
    if (env.TURNSTILE_SECRET_KEY) {
        const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
        const params = new URLSearchParams();
        params.append('secret', env.TURNSTILE_SECRET_KEY);
        params.append('response', typeof tokenValue === 'string' ? tokenValue : ''); 
        const verifyRes = await fetch(verifyUrl, {
            method: 'POST',
            body: params,
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        const verifyData: { success: boolean } = await verifyRes.json();
        if (!verifyData.success) {
            return new Response("Turnstile verification failed", { status: 403 });
        }
    }
    
    // コメントエリアの存在チェックと自動作成
    let area: { hidden: number } | null = await env.DB.prepare("SELECT hidden FROM comment_areas WHERE area_key=?").bind(areaKey).first<{ hidden: number }>();
    
    if (!area) {
        // コメントエリアが存在しない場合、自動的に作成
        // デフォルトの名前は area_key を使用、intro は空文字列
        try {
            await env.DB.prepare(`
                INSERT INTO comment_areas (name, area_key, intro, hidden) VALUES (?, ?, ?, 0)
            `).bind(areaKey, areaKey, '', 0).run();
            // 新しく作成されたエリアの情報を取得し直す
            area = await env.DB.prepare("SELECT hidden FROM comment_areas WHERE area_key=?").bind(areaKey).first<{ hidden: number }>();
        } catch (e) {
            console.error("Failed to auto-create comment area:", e);
            return new Response("Failed to create comment area automatically.", { status: 500 });
        }
    }
    
    // エリアが隠されているかチェック
    if (area?.hidden === 1) { // area can be null if creation failed and wasn't re-assigned
        return new Response("This discussion area is not available", { status: 403 });
    }
    
    // データベースにコメントを挿入する（デフォルト hidden=0, likes=0, pinned=0）
    await env.DB.prepare(`
    INSERT INTO comments (area_key, content, parent_id, hidden, likes, pinned) VALUES (?, ?, ?, 0, 0, 0)
    `).bind(areaKey, content, parentId).run();
    
    return new Response("OK", { status: 200 });
}
 /** コメントを「いいね」する */
 async function handleLikeComment(request: Request, env: Env): Promise<Response> {
 const match = request.url.match(/\/comment\/(\d+)\/like$/);
 if (!match) {
     return new Response("Invalid", { status: 400 });
 }
 const commentId = parseInt(match[1], 10);
 // コメントが存在するかチェック
 const comment: { likes: number } | null = await env.DB.prepare("SELECT likes FROM comments WHERE id=?").bind(commentId).first<{ likes: number }>();
 if (!comment) {
     return new Response("Comment does not exist", { status: 404 });
 }
 const newLikes = (comment.likes || 0) + 1;
 await env.DB.prepare("UPDATE comments SET likes=? WHERE id=?").bind(newLikes, commentId).run();
 return new Response("OK", { status: 200 });
 }
 /** コメントをレポートする */
 async function handleReportComment(request: Request, env: Env): Promise<Response> {
 const match = new URL(request.url).pathname.match(/\/comment\/(\d+)\/report$/);
 if (!match) {
     return new Response("Invalid", { status: 400 });
 }
 const commentId = parseInt(match[1], 10);
 const formData = await request.formData();
 const reason = String(formData.get('reason') || '');
 
 if (!reason) {
     return new Response("Missing report reason", { status: 400 });
 }
 // コメントが存在するかチェック
 const comment: { id: number } | null = await env.DB.prepare("SELECT id FROM comments WHERE id=?").bind(commentId).first<{ id: number }>();
 if (!comment) {
     return new Response("Comment does not exist", { status: 404 });
 }
 // レポートを書き込む
 await env.DB.prepare("INSERT INTO reports (comment_id, reason) VALUES (?, ?)").bind(commentId, reason).run();
 return new Response("OK", { status: 200 });
 }
 /** 議論エリアを削除する (管理者) */
 async function handleDeleteArea(areaKeyEncoded: string, request: Request, env: Env): Promise<Response> {
     const cookie = parseCookie(request.headers.get("Cookie"));
     if (cookie.auth !== "1") {
         return new Response("Unauthorized", { status: 401 });
     }
     const areaKey = decodeURIComponent(areaKeyEncoded);
     // まず存在するかチェック
     const area: { id: number } | null = await env.DB.prepare("SELECT id FROM comment_areas WHERE area_key=?").bind(areaKey).first<{ id: number }>();
     if (!area) {
         return new Response("Discussion area does not exist", { status: 404 });
     }
     // 削除操作：まずコメントを削除し、次に自分自身を削除
     await env.DB.prepare("DELETE FROM comments WHERE area_key=?").bind(areaKey).run();
     await env.DB.prepare("DELETE FROM reports WHERE comment_id IN (SELECT id FROM comments WHERE area_key=? )").bind(areaKey).run(); // Add delete reports
     await env.DB.prepare("DELETE FROM comment_areas WHERE area_key=?").bind(areaKey).run();
     return new Response("OK", { status: 200 });
 }
 /** 議論エリアの非表示状態を切り替える (管理者) */
 async function handleToggleHideArea(areaKeyEncoded: string, request: Request, env: Env): Promise<Response> {
     const cookie = parseCookie(request.headers.get("Cookie"));
     if (cookie.auth !== "1") {
         return new Response("Unauthorized", { status: 401 });
     }
     const areaKey = decodeURIComponent(areaKeyEncoded);
     const area: { hidden: number } | null = await env.DB.prepare("SELECT hidden FROM comment_areas WHERE area_key=?").bind(areaKey).first<{ hidden: number }>();
     if (!area) {
         return new Response("Discussion area does not exist", { status: 404 });
     }
     const newHidden = area.hidden === 1 ? 0 : 1;
     await env.DB.prepare("UPDATE comment_areas SET hidden=? WHERE area_key=?").bind(newHidden, areaKey).run();
     return new Response("OK", { status: 200 });
 }
 /** 個別コメントの非表示状態を切り替える (管理者) */
 async function handleToggleHideComment(commentId: number, request: Request, env: Env): Promise<Response> {
 const cookie = parseCookie(request.headers.get("Cookie"));
 if (cookie.auth !== "1") {
     return new Response("Unauthorized", { status: 401 });
 }
 // 存在するかどうかをクエリ
 const comment: { hidden: number } | null = await env.DB.prepare("SELECT hidden FROM comments WHERE id=?").bind(commentId).first<{ hidden: number }>();
 if (!comment) {
     return new Response("Comment does not exist", { status: 404 });
 }
 const newHidden = (comment.hidden || 0) === 1 ? 0 : 1;
 await env.DB.prepare("UPDATE comments SET hidden=? WHERE id=?").bind(newHidden, commentId).run();
 return new Response("OK", { status: 200 });
 }
 /** 個別コメントのピン留め状態を切り替える (管理者) */
 async function handleTogglePinComment(commentId: number, request: Request, env: Env): Promise<Response> {
    const cookie = parseCookie(request.headers.get("Cookie"));
    if (cookie.auth !== "1") {
        return new Response("Unauthorized", { status: 401 });
    }
    // 存在するかどうかをクエリ
    const comment: { pinned: number } | null = await env.DB.prepare("SELECT pinned FROM comments WHERE id=?").bind(commentId).first<{ pinned: number }>();
    if (!comment) {
        return new Response("Comment does not exist", { status: 404 });
    }
    const newPinned = (comment.pinned || 0) === 1 ? 0 : 1;
    await env.DB.prepare("UPDATE comments SET pinned=? WHERE id=?").bind(newPinned, commentId).run();
    return new Response("OK", { status: 200 });
}
/** レポートを処理する -> 処理済みとマーク */
async function handleResolveReport(reportId: number, request: Request, env: Env): Promise<Response> {
    const cookie = parseCookie(request.headers.get("Cookie"));
    if (cookie.auth !== "1") {
        return new Response("Unauthorized", { status: 401 });
    }
    // 存在するかどうかをクエリ
    const rep: { id: number } | null = await env.DB.prepare("SELECT id FROM reports WHERE id=?").bind(reportId).first<{ id: number }>();
    if (!rep) {
        return new Response("Report does not exist", { status: 404 });
    }
    await env.DB.prepare("UPDATE reports SET resolved=1 WHERE id=?").bind(reportId).run();
    return new Response("OK", { status: 200 });
}
/** 言語切り替えを処理する */
async function handleSetLang(request: Request, env: Env): Promise<Response> {
    try {
        const data: { lang?: string } = await request.json();
        const lang = data.lang || 'en'; // デフォルトは英語
        const res = new Response(JSON.stringify({ success: true }), {
           headers: {
               'Content-Type': 'application/json;charset=UTF-8',
                'Access-Control-Allow-Origin': '*',
               'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
               'Access-Control-Allow-Headers': 'Content-Type'
           }
       });
       setCookie('lang', lang, res);
       return res;
   } catch (err: any) {
       return new Response(JSON.stringify({ success: false, message: err.message }), {
           status: 400,
           headers: {
               'Content-Type': 'application/json;charset=UTF-8',
                'Access-Control-Allow-Origin': '*',
               'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
               'Access-Control-Allow-Headers': 'Content-Type'
           }
       });
   }
}
/** テーマ切り替えを処理する */
async function handleSetTheme(request: Request, env: Env): Promise<Response> {
   try {
       const data: { theme?: string } = await request.json();
       const theme = data.theme || 'dark'; // デフォルトはダークテーマ
       const res = new Response(JSON.stringify({ success: true }), {
           headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'Access-Control-Allow-Origin': '*',
               'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
               'Access-Control-Allow-Headers': 'Content-Type'
           }
       });
       setCookie('theme', theme, res);
       return res;
   } catch (err: any) {
       return new Response(JSON.stringify({ success: false, message: err.message }), {
           status: 400,
           headers: {
               'Content-Type': 'application/json;charset=UTF-8',
               'Access-Control-Allow-Origin': '*',
               'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
               'Access-Control-Allow-Headers': 'Content-Type'
           }
       });
   }
}