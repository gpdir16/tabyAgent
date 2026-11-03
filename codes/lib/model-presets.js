// 모델 프리셋: 프로바이더(로그인이나 키를 담은 프로필), 모델, 추론 깊이, OpenRouter 고정을 한 묶음으로 저장해 둔다.
// tabyAgent는 프리셋 편집 화면이 없다. 설정 파일에 프리셋이 있으면 읽어서 쓰고, 없으면 지금 프로바이더·모델로 만든 첫 프리셋을 쓴다.
// config.modelPresets = [{ uid, name, named?, profile, model, thinkingLevel, openRouterPin?, autoModelCandidates?, contextTriggerPercent? }]
// contextTriggerPercent: 이 프리셋에서 컨텍스트가 몇 % 차면 압축할지. 없으면 기본값(context.js의 getCompressTriggerTokens)을 쓴다.
// config.defaultModelPreset = uid. 고르지 않으면 첫 프리셋을 기본으로 쓴다.
// 프리셋이 없던 설정은 지금 프로바이더와 모델로 만든 첫 프리셋이 있는 것으로 읽는다(저장은 다음 변경 때 한다).
const INITIAL_PRESET_UID = "initial";

function legacyPin(config, model) {
    const pins = config.provider?.openRouterPins;
    if (pins && typeof pins === "object" && pins[model]) return String(pins[model]);
    return String(config.provider?.openRouterProvider || "");
}

// 프리셋이 없을 때 지금 설정(config.provider, config.thinkingLevel)으로 만든 첫 프리셋.
function initialPreset(config) {
    let model = String(config.provider?.model || "").trim();
    // 예전 GitHub Copilot 설정은 자동 모드가 따로 켜져 있었다(기본으로 켜짐). 이제는 모델 "auto"다.
    if (config.provider?.id === "github-copilot" && config.provider.autoMode !== false) model = "auto";
    const preset = {
        uid: INITIAL_PRESET_UID,
        name: "",
        profile: config.activeProviderProfile || "",
        model,
        thinkingLevel: String(config.thinkingLevel || ""),
    };
    const pin = model ? legacyPin(config, model) : "";
    if (pin) preset.openRouterPin = pin;
    if (Array.isArray(config.provider?.autoModelCandidates)) preset.autoModelCandidates = config.provider.autoModelCandidates.map(String);
    return preset;
}

// 읽기 전용 목록. 저장된 것이 없으면 첫 프리셋 하나.
export function presetsOf(config) {
    const list = Array.isArray(config?.modelPresets) ? config.modelPresets.filter((p) => p && typeof p === "object" && p.uid) : [];
    return list.length ? list : [initialPreset(config || {})];
}

export function defaultPreset(config) {
    const list = presetsOf(config);
    return list.find((p) => p.uid === config?.defaultModelPreset) || list[0];
}

// uid의 프리셋. 없거나 비었으면 기본 프리셋.
export function findPreset(config, uid = "") {
    if (uid) {
        const found = presetsOf(config).find((p) => p.uid === uid);
        if (found) return found;
    }
    return defaultPreset(config);
}
