const MESSAGES = {
    auth_pending: {
        en: "Access not approved. On the server run:\n\ndocker compose exec tabyagent approve {code}\n\nCode expires in {minutes} minutes.",
        ko: "승인되지 않았습니다. 서버에서 실행하세요:\n\ndocker compose exec tabyagent approve {code}\n\n코드는 {minutes}분 후 만료됩니다.",
        ja: "未承認です。サーバーで実行してください:\n\ndocker compose exec tabyagent approve {code}\n\nコードは{minutes}分で期限切れになります。",
    },
    auth_expired: {
        en: "Your approval code expired. Send any message to receive a new code.",
        ko: "인증 코드가 만료되었습니다. 메시지를내면 새 코드를 받습니다.",
        ja: "認証コードの期限が切れました。メッセージを送ると新しいコードが届きます。",
    },
    tool_rounds_exceeded: {
        en: "I hit the tool call limit for this message. Please try again or simplify the request.",
        ko: "이 메시지의 도구 호출 한도에 도달했습니다. 다시 시도하거나 요청을 단순화해 주세요.",
        ja: "このメッセージのツール呼び出し上限に達しました。再試行するか、リクエストを簡略化してください。",
    },
    agent_error: {
        en: "Something went wrong while processing your message.",
        ko: "메시지 처리 중 오류가 발생했습니다.",
        ja: "メッセージの処理中にエラーが発生しました。",
    },
    missing_bot_token: {
        en: "telegram.botToken is not set in /app/user/config.json",
        ko: "telegram.botToken이 /app/user/config.json에 설정되지 않았습니다.",
        ja: "telegram.botToken が /app/user/config.json に設定されていません。",
    },
    status_generating: {
        en: "Generating response",
        ko: "응답 생성 중",
        ja: "応答を生成中",
    },
    status_streaming: {
        en: "Streaming response",
        ko: "응답 스트리밍 중",
        ja: "応答をストリーミング中",
    },
    status_tools: {
        en: "Running tools",
        ko: "도구 실행 중",
        ja: "ツール実行中",
    },
    status_thinking: {
        en: "Thinking",
        ko: "사고 중",
        ja: "思考中",
    },
    status_compressing: {
        en: "Compressing context",
        ko: "컨텍스트 압축 중",
        ja: "コンテキストを圧縮中",
    },
    status_error: {
        en: "Error",
        ko: "오류",
        ja: "エラー",
    },
};

export function statusText(phase, lang = "en") {
    const key = `status_${phase}`;
    const bucket = MESSAGES[key] || MESSAGES.status_generating;
    return bucket[lang] || bucket.en;
}

export function t(key, lang = "en", vars = {}) {
    const bucket = MESSAGES[key] || MESSAGES.agent_error;
    const text = bucket[lang] || bucket.en;
    return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export function formatAgentError(err, lang = "en") {
    const base = t("agent_error", lang);
    const detail = String(err?.message || err || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
    if (!detail) return base;
    const safe = detail.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return `${base}\n\n<code>${safe}</code>`;
}
