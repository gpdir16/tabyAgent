// camofox 브라우저 프로필을 부팅 때 맞춘다. 에이전트의 terminal_run은 이 모듈을 거치지 않고
// camofox CLI를 바로 부르므로, 설정 파일을 미리 고쳐 두지 않으면 브라우저가 뜨지 않는다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeFileAtomic } from "../atomic-file.js";
import { USER_DIR } from "../paths.js";

export function camofoxProfilesDir() {
    return process.env.CAMOFOX_PROFILES_DIR || path.join(USER_DIR, "camofox", "profiles");
}

/* ── Firefox 세션 복원 끄기: 예전에는 user.js로 browser.startup.page=3과 resume_from_crash를 켰다.
   camofox(Playwright)는 브라우저를 띄울 때 첫 페이지의 load를 기다리는데, 세션 복원이 켜져 있으면
   그 load가 오지 않아 새 프로필도, 크래시 뒤 다시 띄울 때도 3분 동안 멈춘 뒤 실패한다.
   그 값은 prefs.js에도 남아 user.js만 지워서는 안 꺼지므로, 한 번 켰던 프로필은 user.js로 Camoufox
   기본값을 다시 덮는다. */
const RESTORE_PREF_RE = /"browser\.(startup\.page|sessionstore\.resume_from_crash)"/;
const RESET_RESTORE_PREFS = ['user_pref("browser.startup.page", 0);', 'user_pref("browser.sessionstore.resume_from_crash", false);', ""].join("\n");

function readText(file) {
    try {
        return fs.readFileSync(file, "utf8");
    } catch {
        return "";
    }
}

export function resetSessionRestorePrefs(user) {
    const dir = path.join(camofoxProfilesDir(), user);
    const file = path.join(dir, "user.js");
    const current = readText(file);
    if (current === RESET_RESTORE_PREFS) return;
    if (!RESTORE_PREF_RE.test(current) && !RESTORE_PREF_RE.test(readText(path.join(dir, "prefs.js")))) return;
    try {
        writeFileAtomic(file, RESET_RESTORE_PREFS);
        console.log(`tabyAgent: camofox profile restore prefs reset (${user})`);
    } catch {
        // 덮지 못하면 이 프로필은 예전처럼 띄울 때 멈출 수 있지만 다른 프로필은 계속 맞춘다
    }
}

/* ── 프로필 버전 표시: camofox-browser는 프로필 폴더의 compatibility.json에 만든 Camoufox 버전을
   적어 두고, 설치된 버전과 다르면 그 프로필(로그인 포함)을 통째로 거부한다. 밖에서는
   "Internal server error"로만 보여 브라우저 전체가 고장 난 것처럼 된다. 이미지를 다시 빌드하면
   Camoufox가 최신으로 받아지므로 업데이트할 때마다 이 일이 생긴다. Firefox 프로필은 상위 버전으로는
   스스로 옮겨 가므로, 올라간 경우에만 표시를 현재 버전으로 고쳐 로그인을 살린다. ── */
function camoufoxCacheDirs() {
    const homes = [...new Set([process.env.HOME, os.homedir(), USER_DIR].filter(Boolean))];
    return homes.map((home) => {
        if (process.platform === "darwin") return path.join(home, "Library", "Caches", "camoufox");
        if (process.platform === "win32") return path.join(home, "AppData", "Local", "camoufox", "camoufox", "Cache");
        return path.join(home, ".cache", "camoufox");
    });
}

// camofox-browser가 비교하는 형식("156.0.1-beta.39")과 같게 만든다. 못 읽으면 "".
export function installedCamoufoxVersion() {
    for (const dir of camoufoxCacheDirs()) {
        try {
            const v = JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8"));
            if (v?.version && v?.release) return `${v.version}-${v.release}`;
        } catch {
            // 이 경로에 설치돼 있지 않으면 다음 후보를 본다
        }
    }
    return "";
}

function isNewerVersion(a, b) {
    const x = String(a).match(/\d+/g)?.map(Number) || [];
    const y = String(b).match(/\d+/g)?.map(Number) || [];
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
        if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    }
    return false;
}

export function upgradeProfileCompat(user, current) {
    if (!current) return;
    const file = path.join(camofoxProfilesDir(), user, "compatibility.json");
    try {
        const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
        const from = envelope?.data?.camoufoxVersion;
        if (envelope?.version !== 1 || !from || !isNewerVersion(current, from)) return;
        const data = { ...envelope.data, camoufoxVersion: current, upgradedFrom: from, upgradedAt: new Date().toISOString() };
        writeFileAtomic(file, JSON.stringify({ ...envelope, data }, null, 2));
        console.log(`tabyAgent: camofox profile compat upgraded (${user}: ${from} -> ${current})`);
    } catch {
        // 표시 파일이 없으면 camofox가 처음 열 때 만들고, 깨졌으면 camofox가 직접 오류를 낸다
    }
}

// 부팅 때 모든 프로필을 맞춘다.
export function prepareAllProfiles() {
    const current = installedCamoufoxVersion();
    let users = [];
    try {
        users = fs
            .readdirSync(camofoxProfilesDir(), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
    } catch {
        // 프로필 폴더가 아직 없으면 맞출 것도 없다
    }
    for (const user of users) {
        resetSessionRestorePrefs(user);
        upgradeProfileCompat(user, current);
    }
}

// 브라우저를 띄우기 전에 그 프로필을 맞춘다.
export function ensureProfilePrefs(user) {
    resetSessionRestorePrefs(user);
    upgradeProfileCompat(user, installedCamoufoxVersion());
}
