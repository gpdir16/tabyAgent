const MESSAGES = {
    auth_pending: {
        en: "Access not approved.\n\nOn the server:\ndocker compose exec tabyagent approve {code}\n\nOr ask the approved user to send in Telegram:\n/approve {code}\n\nCode expires in {minutes} minutes.",
        ko: "접근이 승인되지 않았습니다.\n\n서버에서:\ndocker compose exec tabyagent approve {code}\n\n또는 승인된 사용자에게 Telegram에서 다음을 보내달라고 요청하세요:\n/approve {code}\n\n코드는 {minutes}분 후 만료됩니다.",
        ja: "未承認です。\n\nサーバーで:\ndocker compose exec tabyagent approve {code}\n\nまたは承認済みユーザーに Telegram で次を送ってもらってください:\n/approve {code}\n\nコードは{minutes}分で期限切れになります。",
    },
    auth_denied_command: {
        en: "This command requires an approved account. Send any message to get an approval code, or ask the owner to approve you.",
        ko: "이 명령은 승인된 계정만 사용할 수 있습니다. 아무 메시지를 내면 승인 코드를 받을 수 있고, 소유자에게 승인을 요청할 수도 있습니다.",
        ja: "このコマンドは承認済みアカウントのみ使用できます。メッセージを送ると承認コードが届きます。オーナーに承認を依頼することもできます。",
    },
    auth_approve_fail: {
        en: "Invalid or expired approval code.",
        ko: "승인 코드가 잘못되었거나 만료되었습니다.",
        ja: "承認コードが無効か期限切れです。",
    },
    auth_approve_ok: {
        en: "Approved chat {chatId}. The previous user was disconnected.",
        ko: "채팅 {chatId}을(를) 승인했습니다. 이전 사용자 연결은 끊어졌습니다.",
        ja: "チャット {chatId} を承認しました。以前のユーザーは切断されました。",
    },
    auth_approve_self: {
        en: "You are already the approved user.",
        ko: "이미 승인된 사용자입니다.",
        ja: "すでに承認済みユーザーです。",
    },
    auth_disconnected: {
        en: "Your access was revoked because another user was approved. This bot allows only one user at a time.",
        ko: "다른 사용자가 승인되어 연결이 끊어졌습니다. 이 봇은 한 번에 한 명만 사용할 수 있습니다.",
        ja: "別のユーザーが承認されたため、接続が切断されました。このボットは同時に1人のみ利用できます。",
    },
    auth_granted: {
        en: "You are now the approved user. You can send messages to the bot.",
        ko: "승인되었습니다. 이제 봇에 메시지를 보낼 수 있습니다.",
        ja: "承認されました。ボットにメッセージを送れます。",
    },
    auth_approve_usage: {
        en: "Usage: /approve <6-digit code>",
        ko: "사용법: /approve <6자리 코드>",
        ja: "使い方: /approve <6桁コード>",
    },
    tool_rounds_exceeded: {
        en: "I hit the tool call limit for this message. Please try again or simplify the request.",
        ko: "이 메시지의 도구 호출 한도에 도달했습니다. 다시 시도하거나 요청을 단순화해 주세요.",
        ja: "このメッセージのツール呼び出し上限に達しました。再試行するか、リクエストを簡略化してください。",
    },
    empty_reply_exhausted: {
        en: "I finished the work but could not produce a text reply after several attempts. Please ask again or request a summary.",
        ko: "작업은 마쳤지만 텍스트 응답을 여러 번 시도해도 생성하지 못했습니다. 다시 요청하거나 결과 요약을 요청해 주세요.",
        ja: "作業は完了しましたが、テキスト応答を複数回試しても生成できませんでした。再度依頼するか、結果の要約を求めてください。",
    },
    agent_error: {
        en: "Something went wrong while processing your message.",
        ko: "메시지 처리 중 오류가 발생했습니다.",
        ja: "メッセージの処理中にエラーが発生しました。",
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
    new_chat_ok: {
        en: "Started a new chat.",
        ko: "새 대화를 시작했습니다.",
        ja: "新しい会話を開始しました。",
    },
    new_chat_ok_flushed: {
        en: "Started a new chat. Long-term memory was updated.",
        ko: "새 대화를 시작했습니다. 장기 기억을 갱신했습니다.",
        ja: "新しい会話を開始しました。長期記憶を更新しました。",
    },
    start_ready: {
        en: "Ready. Send a message.\nSettings: /config · New chat: /new · Reload MCP: /reload",
        ko: "준비됐어요. 메시지를 보내세요.\n설정: /config · 새 대화: /new · MCP 다시 불러오기: /reload",
        ja: "準備完了。メッセージを送ってください。\n設定: /config · 新しい会話: /new · MCP再読み込み: /reload",
    },
    new_chat_memory_error: {
        en: "Failed to update long-term memory. But a new chat has started successfully.",
        ko: "장기 기억 업데이트를 실패했습니다. 하지만 새 대화는 성공적으로 시작했습니다.",
        ja: "長期記憶の更新に失敗しました。ただし、新しい会話は正常に開始しました。",
    },
    cron_auto_header: {
        en: "ℹ️ Automatically executed scheduled task",
        ko: "ℹ️ 반복 작업으로 자동 실행된 작업",
        ja: "ℹ️ 定期タスクにより自動実行された作業",
    },
    cron_no_output: {
        en: "(no output)",
        ko: "(출력 없음)",
        ja: "(出力なし)",
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
