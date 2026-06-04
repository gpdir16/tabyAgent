import fs from "node:fs";
import path from "node:path";
import { InlineKeyboard } from "grammy";
import { USER_DIR } from "./paths.js";
import { loadUserConfig, saveUserConfig } from "./config-loader.js";
import { claimOwnerIfNone, hasOwner, isApproved, issuePendingCode } from "./auth.js";
import { t } from "./i18n.js";
import { fetchProviderModels, providerFromWizardState, partitionModelsForPicker, buildVendorPickerItems, MODELS_PER_PAGE } from "./llm/models.js";

const STATE_PATH = path.join(USER_DIR, "temp", "onboarding.json");

const PROVIDERS = {
    openai: { id: "default", label: "OpenAI" },
    openrouter: { id: "openrouter", label: "OpenRouter" },
    synthetic: { id: "synthetic", label: "Synthetic" },
    custom: { id: "default", custom: true, label: "Custom URL" },
};

function emptyState(chatId) {
    return {
        step: "language",
        data: {},
        adminChatId: String(chatId),
        activeMessageId: null,
    };
}

function loadState() {
    if (!fs.existsSync(STATE_PATH)) return null;
    const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    if (!("activeMessageId" in state)) state.activeMessageId = null;
    return state;
}

function saveState(state) {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function clearState() {
    try {
        fs.unlinkSync(STATE_PATH);
    } catch {
        // ignore
    }
}

async function deleteMessageSafe(bot, chatId, messageId) {
    if (!messageId) return;
    try {
        await bot.api.deleteMessage(chatId, messageId);
    } catch {
        // ignore
    }
}

async function clearActivePrompt(bot, chatId, state) {
    await deleteMessageSafe(bot, chatId, state.activeMessageId);
    state.activeMessageId = null;
    saveState(state);
}

/** Remove the current step message and show exactly one new prompt. */
async function replaceStep(bot, chatId, state, text, keyboard) {
    await clearActivePrompt(bot, chatId, state);
    const opts = keyboard ? { reply_markup: keyboard } : {};
    const msg = await bot.api.sendMessage(chatId, text, opts);
    state.activeMessageId = msg.message_id;
    saveState(state);
    return msg;
}

export function isConfigReady() {
    const config = loadUserConfig();
    return Boolean(config.telegram?.botToken?.trim() && config.provider?.apiKey?.trim() && config.provider?.model?.trim());
}

export function bootstrapBotTokenFromEnv() {
    const fromEnv = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!fromEnv) return false;
    const config = loadUserConfig();
    if (!config.telegram) config.telegram = {};
    if (!config.telegram.botToken) {
        config.telegram.botToken = fromEnv;
        saveUserConfig(config);
    }
    return true;
}

export function hasBotToken() {
    return Boolean(loadUserConfig().telegram?.botToken?.trim());
}

export function isWizardActive(chatId) {
    const state = loadState();
    return Boolean(state?.adminChatId === String(chatId) && state?.step);
}

function applyConfig(partial) {
    const config = loadUserConfig();
    if (!config.telegram) config.telegram = {};
    if (!config.provider) config.provider = { id: "default" };

    if (partial.language) config.language = partial.language;
    if (partial.providerId) config.provider.id = partial.providerId;
    if (partial.baseURL !== undefined) {
        if (partial.baseURL) config.provider.baseURL = partial.baseURL;
        else delete config.provider.baseURL;
    }
    if (partial.providerKey === "openai" || partial.providerKey === "synthetic" || partial.providerKey === "openrouter") {
        delete config.provider.baseURL;
    }
    if (partial.apiKey) config.provider.apiKey = partial.apiKey;
    if (partial.model) config.provider.model = partial.model;

    saveUserConfig(config);
}

function texts(lang) {
    const t = {
        en: {
            welcome: "tabyAgent setup — choose your language:",
            provider: "Choose LLM provider:",
            baseURL: "Send your API base URL (e.g. https://api.example.com/v1)",
            apiKey: "Send your API key.",
            modelVendorPick: "Choose a provider ({from}-{to} / {total}) · no slash = pick model directly",
            modelVariantPick: "Choose a model under “{prefix}” ({from}-{to} / {total})",
            modelLoading: "Loading models from your provider…",
            modelFetchFailed: "Could not load the model list. Send the model name manually.",
            modelManual: "Send the model name.",
            prevPage: "◀ Prev",
            nextPage: "Next ▶",
            modelBack: "◀ Providers",
            done: "✓ Setup complete. Send a message anytime. Use /config to change settings.",
            invalid: "Invalid input. Tap a button or send /config to restart.",
            busy: "Setup is in progress in another chat.",
            restart: "Setup restarted — choose your language:",
            manual: "Enter manually",
            cancel: "Cancel setup",
        },
        ko: {
            welcome: "tabyAgent 설정 — 언어를 선택하세요:",
            provider: "LLM 제공자를 선택하세요:",
            baseURL: "API base URL을 보내주세요 (예: https://api.example.com/v1)",
            apiKey: "API 키를 보내주세요.",
            modelVendorPick: "제공자(앞부분) 선택 ({from}-{to} / {total}) · / 없으면 바로 선택",
            modelVariantPick: "「{prefix}」 모델 선택 ({from}-{to} / {total})",
            modelLoading: "제공자에서 모델 목록을 불러오는 중…",
            modelFetchFailed: "모델 목록을 가져오지 못했습니다. 모델 이름을 직접 보내주세요.",
            modelManual: "모델 이름을 보내주세요.",
            prevPage: "◀ 이전",
            nextPage: "다음 ▶",
            modelBack: "◀ 제공자",
            done: "✓ 설정 완료. 메시지를 보내세요. /config 로 다시 설정할 수 있습니다.",
            invalid: "잘못된 입력입니다. 버튼을 누르거나 /config 로 다시 시작하세요.",
            busy: "다른 채팅에서 설정 중입니다.",
            restart: "설정을 다시 시작합니다 — 언어를 선택하세요:",
            manual: "직접 입력",
            cancel: "설정 취소",
        },
        ja: {
            welcome: "tabyAgent 設定 — 言語を選んでください:",
            provider: "LLM プロバイダを選んでください:",
            baseURL: "API base URL を送信 (例: https://api.example.com/v1)",
            apiKey: "API キーを送信してください。",
            modelVendorPick: "プロバイダ（前半）を選択 ({from}-{to} / {total}) · / なしはそのまま選択",
            modelVariantPick: "「{prefix}」のモデル ({from}-{to} / {total})",
            modelLoading: "プロバイダからモデル一覧を取得中…",
            modelFetchFailed: "モデル一覧を取得できませんでした。モデル名を手入力してください。",
            modelManual: "モデル名を送信してください。",
            prevPage: "◀ 前へ",
            nextPage: "次へ ▶",
            modelBack: "◀ プロバイダ",
            done: "✓ 設定完了。/config で再設定できます。",
            invalid: "無効な入力です。ボタンを押すか /config で最初から。",
            busy: "別のチャットで設定中です。",
            restart: "設定を再開 — 言語を選んでください:",
            manual: "手入力",
            cancel: "キャンセル",
        },
    };
    return t[lang] || t.en;
}

function uiLang(state) {
    return state.data.language || "en";
}

function languageKeyboard(lang) {
    const msg = texts(lang);
    return new InlineKeyboard()
        .text("English", "cfg:lang:en")
        .row()
        .text("한국어", "cfg:lang:ko")
        .row()
        .text("日本語", "cfg:lang:ja")
        .row()
        .text(msg.cancel, "cfg:cancel");
}

function providerKeyboard(lang) {
    const msg = texts(lang);
    return new InlineKeyboard()
        .text("OpenAI", "cfg:prov:openai")
        .row()
        .text("OpenRouter", "cfg:prov:openrouter")
        .row()
        .text("Synthetic", "cfg:prov:synthetic")
        .row()
        .text("Custom API URL", "cfg:prov:custom")
        .row()
        .text(msg.cancel, "cfg:cancel");
}

function pageRange(total, page) {
    const from = total ? page * MODELS_PER_PAGE + 1 : 0;
    const to = Math.min((page + 1) * MODELS_PER_PAGE, total);
    return { from, to, total };
}

function vendorPickerItems(state) {
    const partition = {
        flat: state.data.modelPartition?.flat || [],
        prefixes: state.data.modelPartition?.prefixes || [],
        byPrefix: new Map(Object.entries(state.data.modelPartition?.byPrefix || {})),
    };
    return buildVendorPickerItems(partition);
}

function variantPickerItems(state) {
    const prefix = state.data.selectedModelPrefix;
    const list = state.data.modelPartition?.byPrefix?.[prefix] || [];
    return list;
}

function vendorCaption(lang, state) {
    const msg = texts(lang);
    const items = vendorPickerItems(state);
    const page = state.data.modelPage || 0;
    const { from, to, total } = pageRange(items.length, page);
    return msg.modelVendorPick.replace("{from}", String(from)).replace("{to}", String(to)).replace("{total}", String(total));
}

function variantCaption(lang, state) {
    const msg = texts(lang);
    const items = variantPickerItems(state);
    const page = state.data.modelPage || 0;
    const { from, to, total } = pageRange(items.length, page);
    return msg.modelVariantPick
        .replace("{prefix}", state.data.selectedModelPrefix || "")
        .replace("{from}", String(from))
        .replace("{to}", String(to))
        .replace("{total}", String(total));
}

function trimLabel(label, max = 36) {
    if (label.length <= max) return label;
    return `${label.slice(0, max - 1)}…`;
}

function addPager(kb, msg, page, total, pageCallbackPrefix) {
    const hasPrev = page > 0;
    const hasNext = (page + 1) * MODELS_PER_PAGE < total;
    if (hasPrev || hasNext) {
        if (hasPrev) kb.text(msg.prevPage, `${pageCallbackPrefix}:${page - 1}`);
        if (hasNext) kb.text(msg.nextPage, `${pageCallbackPrefix}:${page + 1}`);
        kb.row();
    }
}

function vendorKeyboard(state) {
    const lang = uiLang(state);
    const msg = texts(lang);
    const items = vendorPickerItems(state);
    const page = state.data.modelPage || 0;
    const start = page * MODELS_PER_PAGE;
    const slice = items.slice(start, start + MODELS_PER_PAGE);

    const kb = new InlineKeyboard();
    for (let i = 0; i < slice.length; i++) {
        const globalIdx = start + i;
        const item = slice[i];
        if (item.type === "prefix") {
            const count = state.data.modelPartition?.byPrefix?.[item.prefix]?.length || 0;
            kb.text(trimLabel(`${item.prefix} (${count})`), `cfg:mvidx:${globalIdx}`).row();
        } else {
            kb.text(trimLabel(item.model.label), `cfg:mvidx:${globalIdx}`).row();
        }
    }

    addPager(kb, msg, page, items.length, "cfg:mvpage");
    kb.text(msg.manual, "cfg:model:__manual__").row().text(msg.cancel, "cfg:cancel");
    return kb;
}

function variantKeyboard(state) {
    const lang = uiLang(state);
    const msg = texts(lang);
    const items = variantPickerItems(state);
    const page = state.data.modelPage || 0;
    const start = page * MODELS_PER_PAGE;
    const slice = items.slice(start, start + MODELS_PER_PAGE);

    const kb = new InlineKeyboard();
    for (let i = 0; i < slice.length; i++) {
        const globalIdx = start + i;
        const label = slice[i].suffix || slice[i].label;
        kb.text(trimLabel(label), `cfg:mdidx:${globalIdx}`).row();
    }

    addPager(kb, msg, page, items.length, "cfg:mdpage");
    kb.text(msg.modelBack, "cfg:modelback").row();
    kb.text(msg.manual, "cfg:model:__manual__").row().text(msg.cancel, "cfg:cancel");
    return kb;
}

async function showVendorStep(bot, chatId, state) {
    const lang = uiLang(state);
    state.step = "model_vendor";
    state.data.selectedModelPrefix = null;
    state.data.modelPage = state.data.modelPage || 0;
    saveState(state);
    await replaceStep(bot, chatId, state, vendorCaption(lang, state), vendorKeyboard(state));
}

async function showVariantStep(bot, chatId, state) {
    const lang = uiLang(state);
    state.step = "model_variant";
    state.data.modelPage = 0;
    saveState(state);
    await replaceStep(bot, chatId, state, variantCaption(lang, state), variantKeyboard(state));
}

export function resetOnboarding(chatId) {
    saveState(emptyState(chatId));
}

export function getWelcomeMessage() {
    return texts("en").welcome;
}

export async function openConfigWizard(ctx, bot) {
    const chatId = String(ctx.chat.id);
    const prev = loadState();
    if (prev?.activeMessageId) {
        await deleteMessageSafe(bot, chatId, prev.activeMessageId);
    }
    resetOnboarding(chatId);
    const state = loadState();

    const lang = isConfigReady() ? loadUserConfig().language || "en" : "en";
    const intro = isConfigReady() ? texts(lang).restart : texts(lang).welcome;
    await replaceStep(bot, chatId, state, intro, languageKeyboard(lang));
}

async function finishWizard(bot, chatId, state, { userMessageId } = {}) {
    if (hasOwner() && !isApproved(chatId)) {
        const lang = state.data.language || "en";
        await clearActivePrompt(bot, chatId, state);
        await deleteMessageSafe(bot, chatId, userMessageId);
        clearState();
        await bot.api.sendMessage(chatId, t("auth_denied_command", lang));
        return;
    }

    applyConfig({
        language: state.data.language,
        providerId: state.data.providerId,
        providerKey: state.data.providerKey,
        baseURL: state.data.baseURL,
        apiKey: state.data.apiKey,
        model: state.data.model,
    });

    const doneText = texts(state.data.language).done;
    await clearActivePrompt(bot, chatId, state);
    await deleteMessageSafe(bot, chatId, userMessageId);
    clearState();
    if (!isApproved(chatId)) {
        claimOwnerIfNone(chatId);
    }
    await bot.api.sendMessage(chatId, doneText);
}

async function sendModelStep(bot, chatId, state) {
    const lang = uiLang(state);
    state.step = "model_loading";
    saveState(state);
    await replaceStep(bot, chatId, state, texts(lang).modelLoading);

    try {
        const provider = providerFromWizardState(state);
        const models = await fetchProviderModels(provider, { useCache: false });
        if (!models.length) {
            state.step = "model_manual";
            saveState(state);
            await replaceStep(bot, chatId, state, texts(lang).modelManual);
            return;
        }
        const partition = partitionModelsForPicker(models);
        state.data.availableModels = models;
        state.data.modelPartition = {
            flat: partition.flat,
            prefixes: partition.prefixes,
            byPrefix: Object.fromEntries(partition.byPrefix),
        };
        state.data.modelPage = 0;
        saveState(state);
        await showVendorStep(bot, chatId, state);
    } catch (err) {
        console.warn("fetchProviderModels failed:", err.message || err);
        state.step = "model_manual";
        saveState(state);
        await replaceStep(bot, chatId, state, texts(lang).modelFetchFailed);
    }
}

function assertWizardChat(ctx, state) {
    const chatId = String(ctx.chat?.id || ctx.callbackQuery?.message?.chat.id);
    if (state.adminChatId && state.adminChatId !== chatId) {
        return { ok: false, chatId, lang: uiLang(state) };
    }
    if (!state.adminChatId) {
        state.adminChatId = chatId;
        saveState(state);
    }
    return { ok: true, chatId, lang: uiLang(state) };
}

async function dismissCallbackPrompt(ctx, bot, chatId, state) {
    const promptId = ctx.callbackQuery?.message?.message_id;
    if (promptId && state.activeMessageId === promptId) {
        state.activeMessageId = null;
        saveState(state);
    }
    await deleteMessageSafe(bot, chatId, promptId);
}

export async function handleConfigWizardCallback(ctx, bot) {
    const data = ctx.callbackQuery.data;
    let state = loadState() || emptyState(ctx.chat.id);

    const access = assertWizardChat(ctx, state);
    if (!access.ok) {
        await ctx.answerCallbackQuery({ text: texts(access.lang).busy, show_alert: true });
        return;
    }
    const { chatId } = access;

    if (data === "cfg:cancel") {
        await ctx.answerCallbackQuery();
        await dismissCallbackPrompt(ctx, bot, chatId, state);
        clearState();
        return;
    }

    if (data.startsWith("cfg:lang:")) {
        const language = data.slice("cfg:lang:".length);
        if (!["en", "ko", "ja"].includes(language)) {
            await ctx.answerCallbackQuery();
            return;
        }
        await ctx.answerCallbackQuery();
        await dismissCallbackPrompt(ctx, bot, chatId, state);

        state.data.language = language;
        state.step = "provider";
        saveState(state);
        applyConfig({ language });
        await replaceStep(bot, chatId, state, texts(language).provider, providerKeyboard(language));
        return;
    }

    if (data.startsWith("cfg:prov:")) {
        const providerKey = data.slice("cfg:prov:".length);
        const provider = PROVIDERS[providerKey];
        if (!provider) {
            await ctx.answerCallbackQuery();
            return;
        }
        await ctx.answerCallbackQuery();
        await dismissCallbackPrompt(ctx, bot, chatId, state);

        state.data.providerKey = providerKey;
        state.data.providerId = provider.id;
        saveState(state);
        applyConfig({ providerId: provider.id, providerKey });

        const lang = uiLang(state);
        if (provider.custom) {
            state.step = "base_url";
            saveState(state);
            await replaceStep(bot, chatId, state, texts(lang).baseURL);
        } else {
            state.step = "api_key";
            saveState(state);
            await replaceStep(bot, chatId, state, texts(lang).apiKey);
        }
        return;
    }

    if (data === "cfg:modelback") {
        await ctx.answerCallbackQuery();
        await dismissCallbackPrompt(ctx, bot, chatId, state);
        state.data.modelPage = 0;
        await showVendorStep(bot, chatId, state);
        return;
    }

    if (data.startsWith("cfg:mvpage:")) {
        const page = Number.parseInt(data.slice("cfg:mvpage:".length), 10);
        if (!Number.isFinite(page) || page < 0) {
            await ctx.answerCallbackQuery();
            return;
        }
        await ctx.answerCallbackQuery();
        await dismissCallbackPrompt(ctx, bot, chatId, state);
        state.data.modelPage = page;
        const lang = uiLang(state);
        await replaceStep(bot, chatId, state, vendorCaption(lang, state), vendorKeyboard(state));
        return;
    }

    if (data.startsWith("cfg:mdpage:")) {
        const page = Number.parseInt(data.slice("cfg:mdpage:".length), 10);
        if (!Number.isFinite(page) || page < 0) {
            await ctx.answerCallbackQuery();
            return;
        }
        await ctx.answerCallbackQuery();
        await dismissCallbackPrompt(ctx, bot, chatId, state);
        state.data.modelPage = page;
        const lang = uiLang(state);
        await replaceStep(bot, chatId, state, variantCaption(lang, state), variantKeyboard(state));
        return;
    }

    if (data.startsWith("cfg:mvidx:")) {
        const idx = Number.parseInt(data.slice("cfg:mvidx:".length), 10);
        const item = vendorPickerItems(state)[idx];
        if (!item) {
            await ctx.answerCallbackQuery();
            return;
        }
        await ctx.answerCallbackQuery();
        await dismissCallbackPrompt(ctx, bot, chatId, state);

        if (item.type === "flat") {
            state.data.model = item.model.id;
            await finishWizard(bot, chatId, state);
            return;
        }

        state.data.selectedModelPrefix = item.prefix;
        await showVariantStep(bot, chatId, state);
        return;
    }

    if (data.startsWith("cfg:mdidx:")) {
        const idx = Number.parseInt(data.slice("cfg:mdidx:".length), 10);
        const picked = variantPickerItems(state)[idx];
        if (!picked) {
            await ctx.answerCallbackQuery();
            return;
        }
        await ctx.answerCallbackQuery();
        await dismissCallbackPrompt(ctx, bot, chatId, state);
        state.data.model = picked.id;
        await finishWizard(bot, chatId, state);
        return;
    }

    if (data.startsWith("cfg:model:")) {
        const raw = data.slice("cfg:model:".length);
        await ctx.answerCallbackQuery();
        await dismissCallbackPrompt(ctx, bot, chatId, state);

        if (raw === "__manual__") {
            state.step = "model_manual";
            saveState(state);
            await replaceStep(bot, chatId, state, texts(uiLang(state)).modelManual);
            return;
        }
    }
}

export async function handleConfigWizardText(ctx, bot) {
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text.trim();
    let state = loadState();

    if (text === "/config") {
        await openConfigWizard(ctx, bot);
        return;
    }

    if (!state) {
        if (!isConfigReady()) {
            if (hasOwner() && !isApproved(chatId)) {
                const lang = loadUserConfig().language || "en";
                const { code, minutes } = issuePendingCode(chatId);
                await ctx.reply(t("auth_pending", lang, { code, minutes }));
                return;
            }
            state = emptyState(chatId);
            saveState(state);
            await replaceStep(bot, chatId, state, texts("en").welcome, languageKeyboard("en"));
        }
        return;
    }

    const access = assertWizardChat(ctx, state);
    if (!access.ok) {
        await ctx.reply(texts(access.lang).busy);
        return;
    }

    const userMessageId = ctx.message.message_id;
    const msg = texts(uiLang(state));

    switch (state.step) {
        case "language": {
            await deleteMessageSafe(bot, chatId, userMessageId);
            await replaceStep(bot, chatId, state, `${msg.invalid}\n\n${msg.welcome}`, languageKeyboard(uiLang(state)));
            return;
        }
        case "provider": {
            await deleteMessageSafe(bot, chatId, userMessageId);
            await replaceStep(bot, chatId, state, msg.provider, providerKeyboard(uiLang(state)));
            return;
        }
        case "base_url": {
            const baseURL = text.replace(/\/$/, "");
            if (!baseURL.startsWith("http")) {
                await deleteMessageSafe(bot, chatId, userMessageId);
                await replaceStep(bot, chatId, state, `${msg.invalid}\n\n${msg.baseURL}`);
                return;
            }
            state.data.baseURL = baseURL;
            state.step = "api_key";
            saveState(state);
            applyConfig({ baseURL });
            await deleteMessageSafe(bot, chatId, userMessageId);
            await replaceStep(bot, chatId, state, msg.apiKey);
            return;
        }
        case "api_key": {
            if (text.length < 8) {
                await deleteMessageSafe(bot, chatId, userMessageId);
                await replaceStep(bot, chatId, state, `${msg.invalid}\n\n${msg.apiKey}`);
                return;
            }
            state.data.apiKey = text;
            applyConfig({ apiKey: text });
            await deleteMessageSafe(bot, chatId, userMessageId);
            await sendModelStep(bot, chatId, state);
            return;
        }
        case "model_loading": {
            await deleteMessageSafe(bot, chatId, userMessageId);
            return;
        }
        case "model_vendor": {
            await deleteMessageSafe(bot, chatId, userMessageId);
            await replaceStep(bot, chatId, state, `${msg.invalid}\n\n${vendorCaption(uiLang(state), state)}`, vendorKeyboard(state));
            return;
        }
        case "model_variant": {
            await deleteMessageSafe(bot, chatId, userMessageId);
            await replaceStep(bot, chatId, state, `${msg.invalid}\n\n${variantCaption(uiLang(state), state)}`, variantKeyboard(state));
            return;
        }
        case "model_manual": {
            if (!text) {
                await deleteMessageSafe(bot, chatId, userMessageId);
                await replaceStep(bot, chatId, state, msg.invalid);
                return;
            }
            state.data.model = text;
            await finishWizard(bot, chatId, state, { userMessageId });
            return;
        }
        default:
            state.step = "language";
            saveState(state);
            await deleteMessageSafe(bot, chatId, userMessageId);
            await replaceStep(bot, chatId, state, texts("en").welcome, languageKeyboard("en"));
    }
}
