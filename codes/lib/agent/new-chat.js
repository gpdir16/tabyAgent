import { loadUserConfig } from "../config-loader.js";
import { runAgent } from "./loop.js";
import { clearChatHistory, loadChatHistory } from "./chat-history.js";
import { TelegramStatusMessage } from "../telegram-status.js";
import { sendChatActionSafe } from "../telegram-api.js";
import { t } from "../i18n.js";

export const MIN_TURNS_FOR_MEMORY_FLUSH = 5;

const MEMORY_FLUSH_PROMPT = {
    ko: `[시스템 · /new]
사용자가 새 대화를 시작했습니다. 곧 이 스레드 기록이 삭제됩니다.

위 대화에서 **다음 세션에도 꼭 필요한 사실만** \`/app/user/memory.md\`에 저장하세요.
- 먼저 \`file_read\`로 memory.md를 확인한 뒤 \`file_patch\`로 추가·갱신하세요.
- 이미 memory.md에 있는 내용은 중복하지 마세요.
- 일시적인 잡담, 추측, 중복, 불필요한 세부사항은 **넣지 마세요**.
- 사용자 선호, 진행 중인 작업, 중요 결정 등 장기적으로 유용한 것만 간결히 남기세요.

저장이 끝나면 한 문장으로 "완료"만 답하세요.`,
    en: `[System · /new]
The user is starting a new chat. This thread will be cleared shortly.

From the conversation above, persist **only facts worth keeping across sessions** to \`/app/user/memory.md\`.
- Read memory.md with \`file_read\` first, then add or update with \`file_patch\`.
- Do not duplicate what is already in memory.md.
- Do **not** add transient chit-chat, guesses, duplicates, or unnecessary detail.
- Keep only durable items: preferences, ongoing work, important decisions — briefly.

When done, reply with one short sentence: "Done."`,
    ja: `[システム · /new]
ユーザーが新しい会話を始めます。このスレッドはまもなく削除されます。

上記の会話から、**次のセッションにも必要な事実だけ** \`/app/user/memory.md\` に保存してください。
- まず \`file_read\` で memory.md を確認し、\`file_patch\` で追加・更新してください。
- memory.md に既にある内容は重複させないでください。
- 一時的な雑談、推測、重複、不要な詳細は **入れないでください**。
- 好み、進行中の作業、重要な決定など、長期的に有用なものだけを簡潔に残してください。

完了したら「完了」の一文だけ返答してください。`,
};

function memoryFlushPrompt(lang) {
    return MEMORY_FLUSH_PROMPT[lang] || MEMORY_FLUSH_PROMPT.en;
}

export async function handleNewChat(bot, chatId) {
    const lang = loadUserConfig().language || "en";
    const turnCount = loadChatHistory(chatId).length;
    let memoryFlushed = false;
    let memoryFlushFailed = false;

    if (turnCount >= MIN_TURNS_FOR_MEMORY_FLUSH) {
        const status = new TelegramStatusMessage(bot, chatId, lang);
        try {
            await status.start();
            await sendChatActionSafe(bot, chatId, "typing");

            const result = await runAgent(memoryFlushPrompt(lang), {
                chatId,
                bot,
                onStatusPhase: (phase, detail) => status.setPhase(phase, detail),
            });

            if (result?.error === "agent_error") {
                memoryFlushFailed = true;
                await status.completeError(t("new_chat_memory_error", lang));
            } else {
                await status.completeSuccess();
                memoryFlushed = true;
            }
        } catch (err) {
            console.error("New chat memory flush error:", err?.stack || err);
            await status.completeError(t("new_chat_memory_error", lang));
            memoryFlushFailed = true;
        } finally {
            status.dispose();
        }
    }

    try {
        clearChatHistory(chatId);
    } catch (err) {
        console.error("Clear chat history failed:", err?.stack || err);
    }

    if (memoryFlushFailed) return t("new_chat_memory_error", lang);
    if (memoryFlushed) return t("new_chat_ok_flushed", lang);
    return t("new_chat_ok", lang);
}
