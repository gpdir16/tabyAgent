const MESSAGES = {
    auth_pending: {
        en: "Access not approved.\n\nIn a terminal:\n{approveCmd}\n\nOr ask the approved user to send in Telegram:\n/approve {code}\n\nCode expires in {minutes} minutes.",
        ko: "접근이 승인되지 않았습니다.\n\n터미널에서:\n{approveCmd}\n\n또는 승인된 사용자에게 Telegram에서 다음을 보내달라고 요청하세요:\n/approve {code}\n\n코드는 {minutes}분 후 만료됩니다.",
        ja: "未承認です。\n\nターミナルで:\n{approveCmd}\n\nまたは承認済みユーザーに Telegram で次を送ってもらってください:\n/approve {code}\n\nコードは{minutes}分で期限切れになります。",
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
    user_ask_hint_button: {
        en: "Tap a button below, or type your own answer.",
        ko: "아래 버튼을 누르거나, 메시지로 직접 답해 주세요.",
        ja: "下のボタンを押すか、メッセージで直接回答してください。",
    },
    user_ask_hint_text: {
        en: "Type your answer as a message.",
        ko: "메시지로 직접 답해 주세요.",
        ja: "メッセージで直接回答してください。",
    },
    user_ask_timeout: {
        en: "No answer within the time limit — the question was cancelled.",
        ko: "시간 내에 답변이 없어 질문이 취소되었습니다.",
        ja: "制限時間内に回答がなく、質問はキャンセルされました。",
    },
    user_ask_expired: {
        en: "This question is no longer active.",
        ko: "이 질문은 더 이상 유효하지 않습니다.",
        ja: "この質問はもう有効ではありません。",
    },
    user_ask_cancelled: {
        en: "Cancelled.",
        ko: "취소됨.",
        ja: "キャンセルされました。",
    },
    agent_error: {
        en: "Something went wrong while processing your message.",
        ko: "메시지 처리 중 오류가 발생했습니다.",
        ja: "メッセージの処理中にエラーが発生しました。",
    },
    agent_error_transport_closed: {
        en: "The model connection closed unexpectedly while receiving the response. This is usually a temporary provider/network issue. Please try again.",
        ko: "응답을 받는 중 모델 연결이 예기치 않게 종료되었습니다. 보통 일시적인 제공자/네트워크 문제입니다. 잠시 후 다시 시도해 주세요.",
        ja: "応答受信中にモデル接続が予期せず切断されました。通常は一時的なプロバイダー/ネットワーク問題です。少し待って再試行してください。",
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
    status_self_improving: {
        en: "Finding ways to improve",
        ko: "개선할 방법을 찾는 중",
        ja: "改善方法を探している",
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
    start_ready: {
        en: "Ready. Send a message.\nSettings: /config · Agents: /agents · New chat: /new · Stop: /stop",
        ko: "준비됐어요. 메시지를 보내세요.\n설정: /config · 에이전트: /agents · 새 대화: /new · 중지: /stop",
        ja: "準備完了。メッセージを送ってください。\n設定: /config · エージェント: /agents · 新しい会話: /new · 停止: /stop",
    },
    main_topic_notice: {
        en: "To chat with the default agent as before, select the 'tabyAgent' thread. If you use Telegram's default 'All Messages' thread, conversations from multiple agents can get mixed together.",
        ko: "기존처럼 기본 에이전트에게 대화하려면 'tabyAgent' 쓰레드를 선택하고 대화하세요. 텔레그램에서 기본적으로 선택된 '전체' 쓰레드를 사용하여 대화할 경우 여러 에이전트의 대화가 섞일수 있습니다.",
        ja: "これまで通りデフォルトエージェントと話すには、「tabyAgent」スレッドを選んでください。Telegram で最初に選ばれている「すべて」スレッドで話すと、複数エージェントの会話が混ざる可能性があります。",
    },
    stop_requested: {
        en: "Stopping the current task…",
        ko: "진행 중인 작업을 중지합니다…",
        ja: "進行中の作業を停止します…",
    },
    stop_nothing_running: {
        en: "Nothing is running right now.",
        ko: "지금 실행 중인 작업이 없습니다.",
        ja: "現在実行中の作業はありません。",
    },
    stopped_by_user: {
        en: "Stopped.",
        ko: "중지했습니다.",
        ja: "停止しました。",
    },
    schedule_no_output: {
        en: "(no output)",
        ko: "(출력 없음)",
        ja: "(出力なし)",
    },
    todo_reminder: {
        en: "⏰ Reminder: {title}",
        ko: "⏰ 리마인더: {title}",
        ja: "⏰ リマインダー: {title}",
    },
    todo_list_header: {
        en: "📋 Your todos",
        ko: "📋 할 일 목록",
        ja: "📋 やることリスト",
    },
    todo_list_empty: {
        en: "No open todos.",
        ko: "남은 할 일이 없습니다.",
        ja: "未完了のタスクはありません。",
    },
    todo_assigned_to: {
        en: "assigned to {name}",
        ko: "담당: {name}",
        ja: "担当: {name}",
    },
    todo_offer_line: {
        en: "{name} offered{reason}",
        ko: "{name} 제안{reason}",
        ja: "{name} が立候補{reason}",
    },
    todo_suggestions_header: {
        en: "⏳ Pending suggestions",
        ko: "⏳ 승인 대기 중인 제안",
        ja: "⏳ 承認待ちの提案",
    },
    todo_usage: {
        en: "Send /todo <title> to add one.",
        ko: "/todo <제목> 으로 추가할 수 있습니다.",
        ja: "/todo <タイトル> で追加できます。",
    },
    todo_btn_done: {
        en: "✅ Done",
        ko: "✅ 완료",
        ja: "✅ 完了",
    },
    todo_btn_del: {
        en: "🗑 Delete",
        ko: "🗑 삭제",
        ja: "🗑 削除",
    },
    todo_btn_run: {
        en: "▶ Run now",
        ko: "▶ 지금 실행",
        ja: "▶ 今すぐ実行",
    },
    todo_btn_accept: {
        en: "🤝 Let {name} do it",
        ko: "🤝 {name}에게 맡기기",
        ja: "🤝 {name} に任せる",
    },
    todo_btn_approve: {
        en: "✅ Approve",
        ko: "✅ 승인",
        ja: "✅ 承認",
    },
    todo_btn_reject: {
        en: "❌ Reject",
        ko: "❌ 거절",
        ja: "❌ 却下",
    },
    todo_sug_kind_add: {
        en: "a new todo",
        ko: "새 할 일",
        ja: "新しいタスク",
    },
    todo_sug_kind_edit: {
        en: "an edit",
        ko: "수정",
        ja: "変更",
    },
    todo_sug_kind_delete: {
        en: "a deletion",
        ko: "삭제",
        ja: "削除",
    },
    todo_suggest_card: {
        en: '💡 {agent} suggests {kind}: "{title}"{reason}',
        ko: '💡 {agent} 제안 — {kind}: "{title}"{reason}',
        ja: '💡 {agent} の提案 — {kind}: "{title}"{reason}',
    },
    todo_offer_card: {
        en: '🤝 {agent} offers to handle: "{title}"{reason}',
        ko: '🤝 {agent} 이(가) 맡겠다고 합니다: "{title}"{reason}',
        ja: '🤝 {agent} が引き受けます: "{title}"{reason}',
    },
    todo_added: {
        en: "Added: {title}",
        ko: "추가했습니다: {title}",
        ja: "追加しました: {title}",
    },
    todo_done_ok: {
        en: "✅ Done: {title}",
        ko: "✅ 완료: {title}",
        ja: "✅ 完了: {title}",
    },
    todo_deleted: {
        en: "🗑 Deleted: {title}",
        ko: "🗑 삭제했습니다: {title}",
        ja: "🗑 削除しました: {title}",
    },
    todo_approved: {
        en: "✅ Approved: {title}",
        ko: "✅ 승인했습니다: {title}",
        ja: "✅ 承認しました: {title}",
    },
    todo_rejected: {
        en: "❌ Suggestion rejected.",
        ko: "❌ 제안을 거절했습니다.",
        ja: "❌ 提案を却下しました。",
    },
    todo_offer_accepted: {
        en: "🤝 {name} will handle it now: {title}",
        ko: "🤝 {name} 이(가) 지금 처리합니다: {title}",
        ja: "🤝 {name} が今処理します: {title}",
    },
    todo_run_queued: {
        en: "▶ {name} is running it now: {title}",
        ko: "▶ {name} 이(가) 지금 실행합니다: {title}",
        ja: "▶ {name} が今実行します: {title}",
    },
    todo_run_failed: {
        en: "Couldn't start it: {error}",
        ko: "실행하지 못했습니다: {error}",
        ja: "実行できませんでした: {error}",
    },
    todo_expired: {
        en: "This action is no longer available.",
        ko: "더 이상 사용할 수 없는 동작입니다.",
        ja: "この操作はもう使えません。",
    },
    update_notify_title: {
        en: "🆕 A new version is available: {version}",
        ko: "🆕 새 버전이 출시되었습니다: {version}",
        ja: "🆕 新しいバージョンがリリースされました: {version}",
    },
    update_notify_script_label: {
        en: "Run this command on the host to update:",
        ko: "호스트에서 아래 명령으로 업데이트하세요:",
        ja: "ホストで次のコマンドを実行して更新してください:",
    },
    update_notify_current: {
        en: "Current version: {version}",
        ko: "현재 버전: {version}",
        ja: "現在のバージョン: {version}",
    },
    update_notify_button: {
        en: "GitHub Release",
        ko: "GitHub 릴리스",
        ja: "GitHub リリース",
    },
    migrate_working: {
        en: "Building the tabyBot migration package…",
        ko: "tabyBot 마이그레이션 패키지를 만드는 중…",
        ja: "tabyBot 移行パッケージを作成中…",
    },
    migrate_caption: {
        en: "tabyBot migration package.\nUpload this file to tabyBot — the agent will handle the restore.\n⚠️ Contains API keys and auth tokens — don't share it, and delete both the file and this message once the migration is done.",
        ko: "tabyBot 마이그레이션 패키지입니다.\n이 파일을 tabyBot에 업로드하면 에이전트가 잘 복원해줄겁니다.\n⚠️ API 키 및 인증 토큰이 포함되어 있으니 타인에게 공유하지 말고 마이그레이션이 끝나면 파일과 이 메시지를 모두 삭제하세요.",
        ja: "tabyBot 移行パッケージです。\nこのファイルを tabyBot にアップロードするとエージェントが復元します。\n⚠️ APIキー・認証トークンを含むため共有せず、移行が終わったらファイルとこのメッセージを削除してください。",
    },
    migrate_fail: {
        en: "Failed to build the migration package: {error}",
        ko: "마이그레이션 패키지 생성 실패: {error}",
        ja: "移行パッケージの作成に失敗しました: {error}",
    },
    migrate_excluded: {
        en: "Note: {dirs} were left out of the package due to the size limit.",
        ko: "참고: 용량 제한으로 인해 {dirs} 은 패키지에서 제외했습니다.",
        ja: "注意: サイズ制限のため {dirs} はパッケージから除外しました。",
    },
    migrate_notice: {
        en: "💡 You can now migrate all your agents' data to tabyBot with the /migrate command. tabyBot is the improved version of tabyAgent — it uses a website instead of a Telegram bot as the chat interface. Initial setup can be a bit more involved than tabyAgent, so if you're not experienced with server administration, we recommend setting it up together with another AI.\n✅ Migration is optional — tabyAgent also receives most tabyBot updates. If you're happy with tabyAgent as it is, you don't need to migrate.",
        ko: "💡 이제 /migrate 명령어로 모든 에이전트의 데이터를 tabyBot으로 마이그레이션할 수 있습니다. tabyBot은 tabyAgent의 더 개선된 버전이며 텔레그램 봇 대신 웹사이트를 대화 창구로 사용합니다. tabyAgent보다 처음 설정하기에 약간 더 복잡할수 있기에 서버 관리 경험이 없는 사용자인 경우 다른 AI와 함께 설정하는것을 추천합니다.\n✅ 마이그레이션은 선택 사항이며 tabyAgent도 tabyBot의 업데이트들을 대부분 적용받습니다. 지금 tabyAgent에 불편함이 없으며 만족하는 경우 마이그레이션하지 않아도 됩니다.",
        ja: "💡 /migrate コマンドですべてのエージェントのデータを tabyBot へ移行できるようになりました。tabyBot は tabyAgent の改良版で、Telegram ボットの代わりにウェブサイトを会話窓口として使います。初期設定は tabyAgent より少し複雑になることがあるため、サーバー管理の経験がない方は別の AI と一緒に設定することをおすすめします。\n✅ 移行は任意です。tabyAgent も tabyBot のアップデートのほとんどを受け取ります。今の tabyAgent に不満がなく満足している場合は、移行しなくても大丈夫です。",
    },
    migrate_notice_button: {
        en: "What's different?",
        ko: "무엇이 다른가요?",
        ja: "何が違いますか？",
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
    const raw = String(err?.message || err || "");
    const lowered = raw.toLowerCase();
    if (lowered.includes("premature close") || lowered.includes("und_err_socket") || lowered.includes("socket hang up")) {
        return t("agent_error_transport_closed", lang);
    }

    const base = t("agent_error", lang);
    const detail = raw.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!detail) return base;
    return `${base}\n\n${detail}`;
}
