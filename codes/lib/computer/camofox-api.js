// camofox 브라우저 서버 연동: 탭 목록·REST 호출·서버 기동. 프로필 설정은 camofox-profile.js가 맡는다.
import { execFile } from "node:child_process";
import { camofoxEnv } from "./camofox-user.js";
import { USER_DIR } from "../paths.js";
import { isDockerRuntime } from "../runtime.js";

export function runFile(file, args, env, timeoutMs = 45_000) {
    return new Promise((resolve) => {
        execFile(file, args, { env, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            resolve({
                ok: !err,
                code: err && typeof err.code === "number" ? err.code : err ? -1 : 0,
                stdout: (stdout || "").toString(),
                stderr: (stderr || "").toString(),
            });
        });
    });
}

export function normalizeUrl(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) return u;
    return `https://${u}`;
}

export function camofoxBase() {
    return `http://${process.env.CAMOFOX_HOST || "127.0.0.1"}:${process.env.CAMOFOX_PORT || "9377"}`;
}

export async function camofoxApi(apiPath, opts = {}) {
    const res = await fetch(`${camofoxBase()}${apiPath}`, {
        ...opts,
        signal: AbortSignal.timeout(opts.timeoutMs || 15_000),
    });
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

// 브라우저 결정 경로는 전부 로그를 남긴다. 세션이 언제/왜 재생성됐는지 추적용.
export function blog(msg, extra) {
    console.log(`[computer] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`);
}

// 서버/세션 상태를 직접 HTTP로 판정한다. CLI 출력 파싱은 경고 문구·타임아웃에 취약하다.
export async function camofoxServerUp() {
    const h = await camofoxApi("/health", { timeoutMs: 4_000 }).catch(() => null);
    return h?.ok ? h.json || null : null;
}

// 서버가 죽어 있으면 띄우고 health를 돌려준다. 이 경로로 뜬 서버는 무기한 타임아웃 env를 물려받는다.
// displayNum이 없으면(로컬 설치의 headless 브라우저) 화면 없이 띄운다.
export async function ensureCamofoxServer(displayNum) {
    // 일시 타임아웃을 서버 다운으로 오인해 재기동하면 살아있는 세션이 날아간다. 한 번 더 확인한다.
    const health = (await camofoxServerUp()) || (await camofoxServerUp());
    if (health) return health;
    // terminal_run의 camofox CLI와 같은 HOME을 써야 같은 서버 설정과 로그 위치를 본다
    const env = camofoxEnv({ ...process.env, HOME: isDockerRuntime() ? USER_DIR : process.env.HOME || USER_DIR });
    if (displayNum != null) env.DISPLAY = `:${displayNum}`;
    const started = await runFile("camofox", ["server", "start", "--background"], env, 20_000);
    blog("camofox server start", { ok: started.ok, err: (started.stderr || "").slice(0, 200) });
    return await camofoxServerUp();
}

export async function camofoxUserTabs(user) {
    const t = await camofoxApi(`/tabs?userId=${encodeURIComponent(user)}`, { timeoutMs: 6_000 }).catch(() => null);
    return t?.ok && Array.isArray(t.json?.tabs) ? t.json.tabs : null;
}

// 브라우저 탭 스크린샷 저장 폴더. display.js와 같은 tmp 루트를 쓴다.
export const SCREENSHOTS_DIR = "/tmp/tabyagent-xvfb/screenshots";
