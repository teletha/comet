import htmlEmbed from "./template/embed.html" assert { type: "text" }; // HTMLファイルをインポート
import { lang as i18n } from "./lang/lang.js"; // .js拡張子を追加 (ES Modulesの解決のため)

import type { D1Database, D1Result, ExecutionContext } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { html, raw } from "hono/html";

// D1 と環境変数の型定義
interface Env {
    DB: D1Database;
    ADMIN_PASS?: string;
    TURNSTILE_SITEKEY?: string;
    TURNSTILE_SECRET_KEY?: string;
}

// Honoのコンテキストにセットする変数の型
type HonoVariables = {
    lang: string;
    theme: string;
    i18nTranslate: Record<string, string>; // i18n[lang] の結果の型に合わせて調整してください
};

/** 解析 cookie ユーティリティ関数 */
function parseCookie(cookieHeader: string | null): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;
    const parts = cookieHeader.split(";");
    for (const part of parts) {
        const [name, ...rest] = part.trim().split("=");
        cookies[name] = rest.join("=");
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
    if (!str) return "";
    // 1. HTML特殊文字をエスケープ (サニタイズ)
    const escapedStr = str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    // 2. 改行文字を<br>タグに変換
    return escapedStr.replace(/\n/g, "<br>");
}

// 言語の取得
async function getLanguage(request: Request): Promise<string> {
    const cookie = parseCookie(request.headers.get("Cookie"));
    if (cookie.lang) {
        return cookie.lang;
    }
    // Accept-Language ヘッダーから言語の優先順位を取得する
    const acceptLanguage = request.headers.get("Accept-Language");
    if (acceptLanguage) {
        const languages = acceptLanguage.split(",").map((lang) => lang.trim().split(";")[0]);
        if (languages.some((lang) => lang.startsWith("ja"))) {
            return "ja";
        }
    }
    return "en"; // デフォルトは英語
}

// テーマの取得
async function getTheme(request: Request): Promise<string> {
    const cookie = parseCookie(request.headers.get("Cookie"));
    const urlParams = new URL(request.url).searchParams;
    return urlParams.get("theme") || cookie.theme || "dark";
}

/** テーマ/言語のクッキーを設定する */
function setCookie(name: string, value: string, res: Response): void {
    res.headers.append("Set-Cookie", `${name}=${value}; Path=/; SameSite=Lax; Max-Age=3600`);
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

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

app.all("*", async (c, next) => {
    const request = c.req.raw; // HonoのRequestからオリジナルのRequestオブジェクトを取得
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 初期化言語
    const lang = await getLanguage(request);
    // 初期化テーマ
    const theme = await getTheme(request);

    // Honoのコンテキストにlangとthemeをセットして下流のハンドラで使えるようにする (任意)
    c.set("lang", lang);
    c.set("theme", theme);
    c.set("i18nTranslate", i18n[lang] || i18n["en"]);

    await next();
});

// ホームページ
app.get("/", async (c) => {
    const request = c.req.raw;
    const lang = c.get("lang"); // 型が string と推論される
    const theme = c.get("theme"); // 型が string と推論される
    return handleHomePage(request, c.env, lang, theme);
});

// 管理者ログイン
app.post("/login", async (c) => {
    return handleLogin(c.req.raw, c.env);
});

// 議論エリアの作成(管理者)
app.post("/create", async (c) => {
    return handleCreateCommentArea(c.req.raw, c.env);
});

// コメントリスト取得
app.get("/area/:areaKey/comments", async (c) => {
    return handleGetComments(c.req.raw, c.env);
});

// コメント投稿
app.post("/area/:areaKey/comment", async (c) => {
    return handlePostComment(c.req.raw, c.env);
});

// 議論エリアページ
app.get("/area/:areaKey", async (c) => {
    const request = c.req.raw;
    const lang = c.get("lang"); // 型が string と推論される
    const theme = c.get("theme"); // 型が string と推論される
    return handleCommentAreaPage(request, c.env, lang, theme);
});

// 管理者操作 - エリア削除
app.post("/admin/area/:areaKey/delete", async (c) => {
    const areaKey = c.req.param("areaKey");
    return handleDeleteArea(areaKey, c.req.raw, c.env);
});

// 管理者操作 - エリア非表示切り替え
app.post("/admin/area/:areaKey/toggleHide", async (c) => {
    const areaKey = c.req.param("areaKey");
    return handleToggleHideArea(areaKey, c.req.raw, c.env);
});

// 管理者操作 - コメントピン留め切り替え
app.post("/admin/comment/:commentId/togglePin", async (c) => {
    const commentId = parseInt(c.req.param("commentId"), 10);
    return handleTogglePinComment(commentId, c.req.raw, c.env);
});

// 管理者操作 - レポート解決
app.post("/admin/reports/resolve/:reportId", async (c) => {
    const reportId = parseInt(c.req.param("reportId"), 10);
    return handleResolveReport(reportId, c.req.raw, c.env);
});

// より詳細な管理者情報の取得
app.get("/admin/extendedInfo", async (c) => {
    return handleAdminExtendedInfo(c.req.raw, c.env);
});

// 言語切り替え
app.post("/setLang", async (c) => {
    return handleSetLang(c.req.raw, c.env);
});

// テーマ切り替え
app.post("/setTheme", async (c) => {
    return handleSetTheme(c.req.raw, c.env);
});

export default app;

interface CommentArea {
    id: number;
    name: string;
    area_key: string;
    intro: string | null;
    hidden: number;
}

/** ホームページ：未ログイン => ログイン表示; ログイン済み => 管理パネル(詳細情報を表示) */
async function handleHomePage(request: Request, env: Env, lang: string, theme: string): Promise<Response> {
    const cookie = parseCookie(request.headers.get("Cookie"));
    const authed = cookie.auth === "1";
    const url = new URL(request.url);
    const t = i18n[lang] || i18n["en"];
    // 管理者の議論エリアリスト、レポートリストなどのJSONを取得したい場合
    if (url.searchParams.get("_extendedInfo") === "1" && authed) {
        return handleAdminExtendedInfo(request, env);
    }

    const pageContent = html` <!DOCTYPE html>
        <html lang="${lang}" data-theme="${theme}">
            <head>
                <meta charset="UTF-8" />
                <title>${t.home_title}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <link
                    rel="stylesheet"
                    href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown.min.css"
                    crossorigin="anonymous"
                />
                <style>
                    body {
                      background:; var(--bg-color)
                      color: var(--text-color);
                      font-family: sans-serif;
                      max-width: 800px;
                      margin: 40px auto;
                      padding: 20px;
                    }
                    h1 {
                      margin-bottom: 20px;
                    }
                    a {
                      color: var(--link-color);
                      text-decoration: none;
                    }
                    a:hover {
                      color: var(--link-hover-color);
                    }
                    ul {
                      list-style: none;
                      padding: 0;
                    }
                    li {
                      margin-bottom: 10px;
                    }

                    .hidden {
                      display: none;
                    }

                    .form-group {
                      display: flex;
                      flex-direction: column;
                      margin: 20px 0;
                      margin: 20px 0;
                    }
                    .form-group input {
                      background: var(--input-bg-color);
                      border: 1px solid var(--border-color);
                      padding: 10px;
                      color: var(--text-color);
                      font-size: 14px;
                      margin-bottom: 10px;
                    }
                    .form-group button {
                      background: var(--button-bg-color);
                      color: var(--button-text-color);
                      border: none;
                      padding: 10px;
                      font-size: 14px;
                      cursor: pointer;
                      transition: background 0.3s ease, transform 0.2s ease;
                    }
                    .form-group button:hover {
                      background: var(--button-hover-color);
                      transform: scale(1.02);
                    }

                    hr {
                      border: none;
                      border-bottom: 1px solid var(--border-color);
                      margin: 20px 0;
                    }

                    .notification-bar {
                      position: fixed;
                      bottom: 0;
                      left: 0;
                      width: 100%;
                      background: var(--notification-bg-color);
                      color: var(--notification-text-color);
                      padding: 10px 20px;
                      display: flex;
                      align-items: center;
                      justify-content: space-between;
                      font-size: 14px;
                      z-index: 9999;
                    }
                    .notification-bar.hidden {
                      display: none;
                    }
                    .close-btn {
                      cursor: pointer;
                      margin-left: 20px;
                      font-weight: bold;
                    }
                    .admin-section {
                      margin-top: 30px;
                    }

                    .table-like {
                      width: 100%;
                      border-collapse: collapse;
                    }
                    .table-like th,
                    .table-like td {
                      border: none;
                      padding: 8px;
                      text-align: left;
                    } /*  テーブルボーダーを削除 */
                    .table-like th {
                      background: var(--table-header-bg-color);
                    }

                    @media (max-width: 600px) {
                      body {
                        margin: 20px auto;
                        padding: 10px;
                      }
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
                      background: var(--button-bg-color);
                      color: var(--button-text-color);
                      border: none;
                      padding: 8px 12px;
                      cursor: pointer;
                      border-radius: 3px;
                      transition: background 0.3s ease, transform 0.2s ease;
                      margin-left: 10px;
                    }

                    .top-actions button:hover {
                      background: var(--button-hover-color);
                      transform: scale(1.02);
                    }
                </style>
            </head>
            <body>
                <div class="top-actions">
                    <button id="toggleTheme">${theme === "light" ? t.dark : t.light}</button>
                    <button id="toggleLang">${lang === "ja" ? "EN" : "日本語"}</button>
                </div>
                <h1>${t.home_title}</h1>
                <!-- 通知バー -->
                <div id="notificationBar" class="notification-bar hidden">
                    <span id="notificationText"></span>
                    <span id="closeNotification" class="close-btn">×</span>
                </div>

                <div id="loginSection" class="${authed ? "hidden" : ""}">
                    <h2>${t.login_title}</h2>
                    <div class="form-group">
                        <input type="password" id="passwordInput" placeholder="${t.password_placeholder}" />
                        <button id="loginBtn">${t.login_btn}</button>
                    </div>
                </div>

                <div id="adminSection" class="admin-section ${!authed ? "hidden" : ""}">
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
                        <textarea
                            id="areaIntro"
                            placeholder="${t.area_intro_placeholder}"
                            style="background:var(--input-bg-color);color:var(--text-color);border:1px solid var(--border-color);height:60px;font-size:14px;margin-bottom:10px;"
                        ></textarea>
                        <button id="createAreaBtn">${t.create_btn}</button>
                    </div>

                    <hr />
                    <h3>${t.report_management_title}</h3>
                    <div id="reportList">${t.loading}</div>
                </div>
                <script>
                    const authed = ${authed ? "true" : "false"};
                    const notificationBar = document.getElementById("notificationBar");
                    const notificationText = document.getElementById("notificationText");
                    const closeNotification = document.getElementById("closeNotification");
                    closeNotification.addEventListener("click", () => notificationBar.classList.add("hidden"));
                    function showNotification(msg) {
                        notificationText.textContent = msg;
                        notificationBar.classList.remove("hidden");
                    }

                    if (authed) {
                        // 管理情報をロードする
                        fetchExtendedInfo();
                    }
                    // ログインボタン
                    const loginBtn = document.getElementById("loginBtn");
                    if (loginBtn) {
                        loginBtn.addEventListener("click", async () => {
                            const pw = document.getElementById("passwordInput").value.trim();
                            if (!pw) {
                                showNotification("${t.notification_input_password}");
                                return;
                            }
                            const res = await fetch("/login", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ password: pw }),
                            });
                            const data = await res.json();
                            if (!data.success) {
                                showNotification(data.message || "${t.notification_login_failed}");
                            } else {
                                location.reload();
                            }
                        });
                    }

                    // 議論エリアの作成
                    const createAreaBtn = document.getElementById("createAreaBtn");
                    if (createAreaBtn) {
                        createAreaBtn.addEventListener("click", async () => {
                            const areaName = document.getElementById("areaName").value.trim();
                            const areaKey = document.getElementById("areaKey").value.trim();
                            const areaIntro = document.getElementById("areaIntro").value.trim();
                            if (!areaName || !areaKey) {
                                showNotification("${t.notification_missing_input}");
                                return;
                            }
                            const formData = new FormData();
                            formData.append("area_name", areaName);
                            formData.append("area_key", areaKey);
                            formData.append("intro", areaIntro);
                            const res = await fetch("/create", {
                                method: "POST",
                                body: formData,
                            });
                            if (res.ok) {
                                showNotification("${t.notification_create_success}");
                                // クリア
                                document.getElementById("areaName").value = "";
                                document.getElementById("areaKey").value = "";
                                document.getElementById("areaIntro").value = "";
                                await fetchExtendedInfo(); // 更新
                            } else {
                                showNotification("${t.notification_create_failed}：" + (await res.text()));
                            }
                        });
                    }

                    async function fetchExtendedInfo() {
                        // 管理者パネルの情報を取得する
                        const res = await fetch("/?_extendedInfo=1");
                        if (!res.ok) {
                            document.getElementById("areaList").textContent = "ロード失敗";
                            document.getElementById("reportList").textContent = "ロード失敗";
                            return;
                        }
                        const data = await res.json();
                        renderAreaList(data.areas);
                        renderReportList(data.reports);
                    }

                    // 議論エリアリストのレンダリング
                    function renderAreaList(areas) {
                        const div = document.getElementById("areaList");
                        if (areas.length === 0) {
                            div.textContent = "${t.no_areas}";
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

                        areas.forEach((a) => {
                            html += \`
 <tr>
     <td>\${a.id}</td>
     <td>\${a.name}</td>
     <td>\${a.area_key}</td>
     <td>\${a.hidden ? "${t.hide}" : "${t.unhide}"}</td>
     <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
         \${a.intro || ""}
     </td>
     <td>\${a.comment_count}</td>
     <td>
         <a href="/area/\${encodeURIComponent(a.area_key)}" target="_blank">${t.view}</a>
          <span onclick="toggleHideArea('\${encodeURIComponent(
              a.area_key
          )}')"  style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">
           \${a.hidden ? "${t.unhide}" : "${t.hide}"}
         </span>
         <span onclick="deleteArea('\${encodeURIComponent(
             a.area_key
         )}')" style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">${t.delete}</span>
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
                        const div = document.getElementById("reportList");
                        if (reports.length === 0) {
                            div.textContent = "${t.no_reports}";
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
                        reports.forEach((r) => {
                            html += \`
 <tr>
     <td>\${r.id}</td>
     <td>\${r.comment_id}</td>
     <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
     \${r.comment_content || ""}
     </td>
 <td>\${r.reason}</td>
 <td>\${r.created_at}</td>
 <td>\${r.resolved ? "${t.hide}" : "${t.unhide}"}</td>
 <td>
     \${
         r.resolved
             ? ""
             : \`<span onclick="resolveReport(\${r.id})" style="text-decoration: none;display: inline-block;cursor: pointer; margin-left: 10px;">${t.resolve_report}</span>\`
     }
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
                        const res = await fetch("/admin/area/" + areaKey + "/toggleHide", {
                            method: "POST",
                        });
                        if (res.ok) {
                            showNotification("${t.notification_toggle_success}");
                            await fetchExtendedInfo();
                        } else {
                            showNotification("${t.notification_toggle_failed}：" + (await res.text()));
                        }
                    }

                    // 議論エリアの削除
                    async function deleteArea(areaKey) {
                        if (!confirm("${t.delete_confirm}")) return;
                        const res = await fetch("/admin/area/" + areaKey + "/delete", {
                            method: "POST",
                        });
                        if (res.ok) {
                            showNotification("${t.notification_delete_success}");
                            await fetchExtendedInfo();
                        } else {
                            showNotification("${t.notification_delete_failed}：" + (await res.text()));
                        }
                    }

                    // レポートを処理する
                    async function resolveReport(reportId) {
                        const res = await fetch("/admin/reports/resolve/" + reportId, {
                            method: "POST",
                        });
                        if (res.ok) {
                            showNotification("${t.notification_report_resolved}");
                            await fetchExtendedInfo();
                        } else {
                            showNotification("${t.notification_toggle_failed}：" + (await res.text()));
                        }
                    }

                    // テーマを切り替える
                    const toggleThemeBtn = document.getElementById("toggleTheme");
                    toggleThemeBtn.addEventListener("click", async () => {
                        const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
                        const newTheme = currentTheme === "dark" ? "light" : "dark";
                        const res = await fetch("/setTheme", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ theme: newTheme }),
                        });
                        if (res.ok) {
                            document.documentElement.setAttribute("data-theme", newTheme);
                            toggleThemeBtn.textContent = newTheme === "light" ? "${t.dark}" : "${t.light}";
                        } else {
                            showNotification("${t.notification_toggle_failed}：" + (await res.text()));
                        }
                    });

                    // 言語を切り替える
                    const toggleLangBtn = document.getElementById("toggleLang");
                    toggleLangBtn.addEventListener("click", async () => {
                        const currentLang = document.documentElement.lang || "ja";
                        const newLang = currentLang === "ja" ? "en" : "ja";
                        const res = await fetch("/setLang", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ lang: newLang }),
                        });
                        if (res.ok) {
                            document.documentElement.lang = newLang;
                            toggleLangBtn.textContent = newLang === "ja" ? "EN" : "日本語";
                            location.reload();
                        } else {
                            showNotification("${t.notification_toggle_failed}：" + (await res.text()));
                        }
                    });
                </script>
                <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            </body>
        </html>`;
    return new Response(pageContent.toString(), {
        headers: {
            "Content-Type": "text/html;charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
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
    const areasRes = await env.DB.prepare(
        `
 SELECT
 a.id,
 a.name,
 a.area_key,
 a.intro,
 a.hidden,
 (SELECT COUNT(*) FROM comments c WHERE c.area_key = a.area_key) as comment_count
 FROM comment_areas a
 ORDER BY a.id DESC
 `
    ).all<CommentArea & { comment_count: number }>();
    const areas = areasRes.results || [];
    // レポートリストをクエリする（コメント情報と関連付け）
    const reportsRes = await env.DB.prepare(
        `
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
 `
    ).all<{
        id: number;
        comment_id: number;
        reason: string;
        created_at: string;
        resolved: number;
        comment_content: string | null;
    }>();
    const reports = reportsRes.results || [];
    return new Response(JSON.stringify({ areas, reports }), {
        status: 200,
        headers: { "Content-Type": "application/json;charset=UTF-8" },
    });
}

/** 管理者ログイン */
async function handleLogin(request: Request, env: Env): Promise<Response> {
    try {
        const data: { password?: string } = await request.json();
        const password = data.password || "";
        const lang = await getLanguage(request); // 言語を取得
        const t = i18n[lang] || i18n["en"]; // 翻訳文字列を取得

        if (password === env.ADMIN_PASS) {
            // パスワードが正しい => クッキーを設定
            const res = new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json;charset=UTF-8" },
            });
            setCookie("auth", "1", res);
            return res;
        } else {
            return new Response(
                JSON.stringify({
                    success: false,
                    message: t.notification_login_failed,
                }),
                {
                    // 翻訳文字列を使用
                    status: 200,
                    headers: { "Content-Type": "application/json;charset=UTF-8" },
                }
            );
        }
    } catch (err: any) {
        return new Response(JSON.stringify({ success: false, message: err.message }), {
            status: 400,
            headers: { "Content-Type": "application/json;charset=UTF-8" },
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
    const name = String(formData.get("area_name") || "");
    const key = String(formData.get("area_key") || "");
    const intro = formData.get("intro") || "";

    if (!name || !key) {
        return new Response("Name or key is empty", { status: 400 });
    }

    await env.DB.prepare(
        `
 INSERT INTO comment_areas (name, area_key, intro) VALUES (?, ?, ?)
 `
    )
        .bind(name, key, intro)
        .run();

    return new Response("OK", { status: 200 });
}

/** 単一の議論エリアページを表示する（訪問者向け、非表示の場合は403） */
async function handleCommentAreaPage(request: Request, env: Env, lang: string, theme: string): Promise<Response> {
    const url = new URL(request.url);
    const areaKey = decodeURIComponent(url.pathname.replace(/^\/area\//, ""));
    const t = i18n[lang] || i18n["en"];
    const area: CommentArea | null = await env.DB.prepare(`SELECT * FROM comment_areas WHERE area_key = ?`)
        .bind(areaKey)
        .first<CommentArea>();

    if (!area) {
        return new Response(t.notification_not_found, { status: 404 }); // 翻訳文字列を使用
    }
    if (area.hidden === 1) {
        // 議論エリアが非表示の場合、訪問者はアクセス不可
        return new Response(t.notification_unauthorized, { status: 403 }); // 翻訳文字列を使用
    }
    // 議論エリアページを表示
    const pageContent = html`<html>
        <head>
            <link rel="stylesheet" href="/main.css" />
        </head>
        <body>
            <div class="comment-list" id="commentList">Loading...</div>
            <div id="commentForm">
                <textarea id="newComment" placeholder="Write your comment"></textarea>
                <div class="cf-challenge" data-sitekey="${env.TURNSTILE_SITEKEY || ""}" data-theme="auto"></div>
                <input type="hidden" id="parentId" value="0" />
                <button id="submitBtn" disabled>Submit</button>
            </div>

            <!-- 通知バー -->
            <div id="notificationBar" class="notification-bar hidden">
                <span id="notificationText"></span>
                <span id="closeNotification" class="close-btn">×</span>
            </div>
            <script src="/mimic.js" type="module"></script>
            <script type="module">
                import $ from "/mimic.js";

                const notificationBar = document.getElementById("notificationBar");
                const notificationText = document.getElementById("notificationText");
                const closeNotification = document.getElementById("closeNotification");
                closeNotification.addEventListener("click", () => notificationBar.classList.add("hidden"));
                function showNotification(msg) {
                    notificationText.textContent = msg;
                    notificationBar.classList.remove("hidden");
                }
                let commentList = $("#commentList");
                let comments = []; // コメントデータをキャッシュ
                async function loadComments() {
                    commentList.text("${t.loading}");
                    const res = await fetch(location.pathname + "/comments");
                    if (!res.ok) {
                        commentList.text("${t.notification_not_found}");
                        return;
                    }
                    comments = await res.json();
                    renderComments(comments);
                }

                /*
                 * フラットなコメントリストをツリー構造に変換する関数
                 *
                 * @param {Array} list - コメントオブジェクトの配列（各コメントはidとparent_idを持つ）
                 * @returns {Array} ツリー構造化されたコメント配列（親コメントがルート、子コメントがreplies配列に格納される）
                 *
                 * 各コメントをidをキーとするマップに格納し、
                 * parent_idを参照して子コメントを親のreplies配列に追加することで、
                 * 階層構造（ツリー）を作成する。
                 * parent_idが0またはnullのコメントはルートノードとして扱われる。
                 */
                function buildCommentTree(list) {
                    const map = {};
                    list.forEach((c) => {
                        map[c.id] = { ...c, replies: [] };
                    });
                    const roots = [];
                    list.forEach((c) => {
                        if (c.parent_id && c.parent_id !== 0) {
                            map[c.parent_id]?.replies.push(map[c.id]);
                        } else {
                            roots.push(map[c.id]);
                        }
                    });
                    return roots;
                }

                /*
                 * コメントリスト全体をレンダリングする関数
                 *
                 * @param {Array} comments - コメントオブジェクトの配列
                 *
                 * コメントが空の場合は「コメントなし」メッセージを表示し、
                 * それ以外はコメントのツリー構造を組み立ててから
                 * 表示用のDOMを追加していく。
                 */
                function renderComments(comments) {
                    commentList.empty();
                    if (comments.length === 0) {
                        commentList.text("${t.no_comments}");
                        return;
                    }
                    const tree = buildCommentTree(comments);
                    tree.forEach((comment) => {
                        if (comment.hidden !== 1) {
                            commentList.append(renderCommentItem(comment));
                        }
                    });
                }

                /*
                 * 単一コメント要素のDOM構造を生成する関数
                 *
                 * @param {Object} comment - コメントオブジェクト
                 * @returns {jQuery} - コメントを表すjQueryオブジェクト
                 *
                 * コメント本文、投稿日時、返信ボタンを含むDOMを生成し、
                 * 返信コメントがあれば再帰的に子要素として追加する。
                 */
                function renderCommentItem(comment) {
                    let div = $("<div/>")
                        .add("comment")
                        .make("div")
                        .text(comment.html_content)
                        .parent()
                        .make("span")
                        .text(comment.created_at)
                        .parent()
                        .make("span")
                        .add("reply-btn")
                        .data("commentId", comment.id)
                        .text("${t.reply_btn}")
                        .parent();

                    comment.replies?.forEach((r) => {
                        div.append(renderCommentItem(r));
                    });
                    return div;
                }

                /*
                 * コメント投稿フォームのバリデーションとTurnstileの状態を監視する処理。
                 *
                 * 概要:
                 * - コメント入力欄とTurnstileチャレンジの応答をチェックし、送信ボタンの有効・無効を切り替える。
                 * - チャレンジが完了していない場合は .cf-challenge を表示、完了していれば非表示にする。
                 *
                 * 処理内容:
                 * 1. checkFormValidity 関数で入力値と cf-turnstile-response の存在を確認。
                 * 2. コメント入力の変化を .input イベントで監視。
                 * 3. MutationObserver により .cf-challenge 内の DOM 変更を監視し、状態変化に応じて検証を実行。
                 */
                const commentBox = $("#newComment");
                const submitButton = document.getElementById("submitBtn");
                const challenge = $(".cf-challenge");
                function checkFormValidity() {
                    if (commentBox.value().trim() && challenge.find('[name="cf-turnstile-response"]').value()) {
                        submitButton.disabled = false;
                        challenge.show(false);
                    } else {
                        submitButton.disabled = true;
                        challenge.show(true);
                    }
                }

                commentBox.input(checkFormValidity);
                new MutationObserver(checkFormValidity).observe(challenge.nodes[0], {
                    childList: true,
                    subtree: true,
                    attributes: true,
                });

                /**
                 * Turnstile CAPTCHA を初期化する関数。
                 *
                 * ・class="cf-challenge" を持つ要素を対象に CAPTCHA をレンダリングする。
                 * ・window.turnstile が存在する場合は即座に描画を行う。
                 * ・まだ読み込まれていない場合は "turnstile-ready" イベントを待ってから描画する。
                 * ・レンダリング前に innerHTML を空にし、表示を block にする。
                 *
                 * 注意点:
                 * ・.cf-challenge 要素が複数存在する場合は最初の1つのみが対象となる。
                 * ・同じ要素に対して複数回 render() するとエラーになるため、事前にクリアしている。
                 * ・Turnstile の sitekey は env.TURNSTILE_SITEKEY によって動的に設定される。
                 */
                function initTurnstile() {
                    let e = challenge.empty().show(true).nodes[0];
                    let render = () => {
                        turnstile.render(e, {
                            sitekey: "${env.TURNSTILE_SITEKEY}",
                            theme: "auto",
                        });
                    };

                    if (window.turnstile) {
                        render();
                    } else {
                        document.addEventListener("turnstile-ready", render, { once: true });
                    }
                }

                /**
                 * コメントフォームで Cloudflare Turnstile CAPTCHA を初期化し、
                 * 「返信」ボタンが押されたときに対象コメントへ返信できるようにする処理。
                 *
                 * - ページ読み込み直後に CAPTCHA を表示
                 * - 返信ボタンをクリックすると hidden input に親コメントIDを設定し、
                 *   コメント入力欄にフォーカスして CAPTCHA を再初期化する
                 */
                initTurnstile();
                $(document).click((e) => {
                    if ($(e.target).has("reply-btn")) {
                        $("#parentId").value(e.target.dataset.commentId);
                        $("#newComment").nodes[0].focus();
                        initTurnstile();
                    }
                });

                // コメントを送信
                submitButton.addEventListener("click", async () => {
                    let content = $("#newComment").value().trim();
                    let parentId = $("#parentId").value() || "0";
                    if (!content) {
                        showNotification("${t.notification_comment_missing_content}");
                        return;
                    }
                    // Turnstileトークン
                    let token = document.querySelector('[name="cf-turnstile-response"]')?.value || "";
                    let formData = new FormData();
                    formData.append("content", content);
                    formData.append("parent_id", parentId);
                    formData.append("cf-turnstile-response", token);

                    let res = await fetch(location.pathname + "/comment", {
                        method: "POST",
                        body: formData,
                    });
                    if (res.ok) {
                        $("#newComment").value("");
                        $("#parentId").value("0");
                        // コメントを再取得
                        let res = await fetch(location.pathname + "/comments");
                        if (!res.ok) {
                            showNotification("${t.notification_comment_submit_failed}：" + (await res.text()));
                            return;
                        }
                        comments = await res.json();
                        renderComments(comments);

                        // Turnstileを非表示にし、リセット
                        challenge.show(false);
                        setTimeout(() => {
                            challenge.empty().show(true);
                            // Turnstileを再レンダリング
                            turnstile.render(challenge.nodes[0], {
                                sitekey: "${env.TURNSTILE_SITEKEY || ""}",
                                theme: "auto",
                            });
                        }, 100);
                    } else {
                        showNotification("${t.notification_comment_submit_failed}：" + (await res.text()));
                    }
                });

                // 最初のコメントのロード
                loadComments();
                // テーマ設定
                document.documentElement.setAttribute("data-theme", "${theme}");

                /**
                 * This script runs only if the current page is loaded inside an iframe.
                 * Its purpose is to notify the parent window of the iframe's height (scrollHeight),
                 * so that the parent can dynamically resize the iframe as its content changes.
                 *
                 * The height is sent once after page load and then again whenever the DOM changes
                 * (e.g., when comments are added or removed). The parent window must handle the
                 * postMessage event and update the iframe height accordingly.
                 */
                if (window.self !== window.top) {
                    function sendHeight() {
                        window.parent.postMessage(
                            {
                                type: "iframe-resize",
                                height: document.documentElement.scrollHeight,
                                id: "${areaKey}",
                            },
                            "*"
                        );
                    }

                    new MutationObserver(sendHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
                }
            </script>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
        </body>
    </html>`;
    return new Response(pageContent.toString(), {
        headers: {
            "Content-Type": "text/html;charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
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
    const areaKey = decodeURIComponent(url.pathname.replace(/^\/area\/|\/comments$/g, ""));
    // 議論エリアが非表示かどうかをチェック
    const area: { hidden: number } | null = await env.DB.prepare("SELECT hidden FROM comment_areas WHERE area_key=?")
        .bind(areaKey)
        .first<{ hidden: number }>();
    if (!area) return new Response(JSON.stringify([]), { status: 200 }); // エリアが存在しない場合も空のリストを返す
    if (area.hidden === 1) {
        // 非表示の場合 => 訪問者視点ではコメントなしと見なされる
        return new Response(JSON.stringify([]), { status: 200 });
    }
    const res: D1Result<Comment> = await env.DB.prepare(
        `
 SELECT id, content, parent_id, created_at, hidden, likes, pinned
 FROM comments
 WHERE area_key = ?
 ORDER BY created_at ASC
 `
    )
        .bind(areaKey)
        .all<Comment>();
    const list = res.results || [];
    // 各コメントにhtml_contentフィールドを追加する（Markdownレンダリング用）
    list.forEach((c: Comment) => {
        c.html_content = c.content;
        c.liked = false;
    });
    return new Response(JSON.stringify(list), {
        status: 200,
        headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}

/** コメントを投稿する（返信＋Markdown対応） */
async function handlePostComment(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const areaKey = decodeURIComponent(url.pathname.replace(/^\/area\/|\/comment$/g, ""));
    const formData = await request.formData();
    const content = plainTextToHtml(String(formData.get("content") || "")) || "";
    const parentId = parseInt(String(formData.get("parent_id") || "0"), 10);
    const tokenValue = formData.get("cf-turnstile-response");

    if (!content) {
        return new Response("Missing comment content", { status: 400 });
    }

    // Turnstile 認証
    if (env.TURNSTILE_SECRET_KEY) {
        const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
        const params = new URLSearchParams();
        params.append("secret", env.TURNSTILE_SECRET_KEY);
        params.append("response", typeof tokenValue === "string" ? tokenValue : "");
        const verifyRes = await fetch(verifyUrl, {
            method: "POST",
            body: params,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        const verifyData: { success: boolean } = await verifyRes.json();
        if (!verifyData.success) {
            return new Response("Turnstile verification failed", { status: 403 });
        }
    }

    // コメントエリアの存在チェックと自動作成
    let area: { hidden: number } | null = await env.DB.prepare("SELECT hidden FROM comment_areas WHERE area_key=?")
        .bind(areaKey)
        .first<{ hidden: number }>();

    if (!area) {
        // コメントエリアが存在しない場合、自動的に作成
        // デフォルトの名前は area_key を使用、intro は空文字列
        try {
            await env.DB.prepare(
                `
                INSERT INTO comment_areas (name, area_key, intro, hidden) VALUES (?, ?, ?, 0)
            `
            )
                .bind(areaKey, areaKey, "", 0)
                .run();
            // 新しく作成されたエリアの情報を取得し直す
            area = await env.DB.prepare("SELECT hidden FROM comment_areas WHERE area_key=?").bind(areaKey).first<{ hidden: number }>();
        } catch (e) {
            console.error("Failed to auto-create comment area:", e);
            return new Response("Failed to create comment area automatically.", {
                status: 500,
            });
        }
    }

    // エリアが隠されているかチェック
    if (area?.hidden === 1) {
        // area can be null if creation failed and wasn't re-assigned
        return new Response("This discussion area is not available", {
            status: 403,
        });
    }

    // データベースにコメントを挿入する（デフォルト hidden=0, likes=0, pinned=0）
    await env.DB.prepare(
        `
    INSERT INTO comments (area_key, content, parent_id, hidden, likes, pinned) VALUES (?, ?, ?, 0, 0, 0)
    `
    )
        .bind(areaKey, content, parentId)
        .run();

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
    const area: { id: number } | null = await env.DB.prepare("SELECT id FROM comment_areas WHERE area_key=?")
        .bind(areaKey)
        .first<{ id: number }>();
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
    const area: { hidden: number } | null = await env.DB.prepare("SELECT hidden FROM comment_areas WHERE area_key=?")
        .bind(areaKey)
        .first<{ hidden: number }>();
    if (!area) {
        return new Response("Discussion area does not exist", { status: 404 });
    }
    const newHidden = area.hidden === 1 ? 0 : 1;
    await env.DB.prepare("UPDATE comment_areas SET hidden=? WHERE area_key=?").bind(newHidden, areaKey).run();
    return new Response("OK", { status: 200 });
}

/** 個別コメントのピン留め状態を切り替える (管理者) */
async function handleTogglePinComment(commentId: number, request: Request, env: Env): Promise<Response> {
    const cookie = parseCookie(request.headers.get("Cookie"));
    if (cookie.auth !== "1") {
        return new Response("Unauthorized", { status: 401 });
    }
    // 存在するかどうかをクエリ
    const comment: { pinned: number } | null = await env.DB.prepare("SELECT pinned FROM comments WHERE id=?")
        .bind(commentId)
        .first<{ pinned: number }>();
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
        const lang = data.lang || "en"; // デフォルトは英語
        const res = new Response(JSON.stringify({ success: true }), {
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
        setCookie("lang", lang, res);
        return res;
    } catch (err: any) {
        return new Response(JSON.stringify({ success: false, message: err.message }), {
            status: 400,
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }
}
/** テーマ切り替えを処理する */
async function handleSetTheme(request: Request, env: Env): Promise<Response> {
    try {
        const data: { theme?: string } = await request.json();
        const theme = data.theme || "dark"; // デフォルトはダークテーマ
        const res = new Response(JSON.stringify({ success: true }), {
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
        setCookie("theme", theme, res);
        return res;
    } catch (err: any) {
        return new Response(JSON.stringify({ success: false, message: err.message }), {
            status: 400,
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }
}
