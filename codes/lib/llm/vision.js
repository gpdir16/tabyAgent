import fs from "node:fs";
import { loadAgentConfig } from "../config-loader.js";
import { sanitizeTextForLlm } from "./sanitize-messages.js";

const IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

export function isVisionImageMime(mimeType) {
    return IMAGE_MIMES.has(String(mimeType || "").toLowerCase());
}

export function isVisionImageAttachment(attachment) {
    return Boolean(attachment?.path && isVisionImageMime(attachment.mimeType));
}

function maxImageBytes() {
    return loadAgentConfig().visionMaxImageBytes ?? 5_000_000;
}

/**
 * OpenAI Chat Completions multimodal user content (text + image_url).
 * Returns a string when vision is off or file is not a supported image.
 */
export function buildUserMessageContent(text, { visionEnabled = false, attachment = null } = {}) {
    const safeText = sanitizeTextForLlm(String(text || ""));

    if (!visionEnabled || !isVisionImageAttachment(attachment)) {
        return safeText;
    }

    const stat = fs.statSync(attachment.path);
    if (stat.size > maxImageBytes()) {
        return `${safeText}\n\n[Image not attached: file exceeds vision size limit (${stat.size} bytes).]`;
    }

    const buf = fs.readFileSync(attachment.path);
    const mime = attachment.mimeType.toLowerCase();
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

    return [
        { type: "text", text: safeText },
        {
            type: "image_url",
            image_url: { url: dataUrl, detail: "auto" },
        },
    ];
}

/** Rough token estimate for multimodal user content (footer stats). */
export function estimateContentTokens(content) {
    if (typeof content === "string") {
        return Math.ceil(content.length / 4);
    }
    if (!Array.isArray(content)) return 0;
    let n = 0;
    for (const part of content) {
        if (part.type === "text") n += Math.ceil((part.text || "").length / 4);
        if (part.type === "image_url") n += 1100;
    }
    return n;
}
