// Anti-bot fingerprint patches injected on every new document (CDP).
(() => {
    const define = (obj, key, value) => {
        try {
            Object.defineProperty(obj, key, { get: () => value, configurable: true });
        } catch (_) {}
    };

    // Headless Chrome often lacks window.chrome
    if (!window.chrome) {
        window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
    }

    // Empty plugin list is a common headless tell
    if (navigator.plugins.length === 0) {
        const makePlugin = (name, filename, description) => {
            const plugin = { name, filename, description, length: 1 };
            plugin[0] = { type: "application/pdf", suffixes: "pdf", description };
            return plugin;
        };
        const fakePlugins = [
            makePlugin("Chrome PDF Plugin", "internal-pdf-viewer", "Portable Document Format"),
            makePlugin("Chrome PDF Viewer", "mhjfbmdgcfjbbpaeojofohoefgiehjai", ""),
            makePlugin("Native Client", "internal-nacl-plugin", ""),
        ];
        define(navigator, "plugins", fakePlugins);
        define(navigator, "mimeTypes", [{ type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" }]);
    }

    if (!navigator.languages || navigator.languages.length === 0) {
        define(navigator, "languages", ["en-US", "en"]);
    }

    // WebGL vendor/renderer strings used by bot detectors
    const patchWebGL = (Proto) => {
        if (!Proto || !Proto.prototype) return;
        const original = Proto.prototype.getParameter;
        Proto.prototype.getParameter = function (param) {
            if (param === 37445) return "Intel Inc.";
            if (param === 37446) return "Intel Iris OpenGL Engine";
            return original.apply(this, arguments);
        };
    };
    patchWebGL(WebGLRenderingContext);
    patchWebGL(WebGL2RenderingContext);

    // permissions.query notification quirk in headless
    if (navigator.permissions && navigator.permissions.query) {
        const originalQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (parameters) =>
            parameters && parameters.name === "notifications"
                ? Promise.resolve({ state: Notification.permission, onchange: null })
                : originalQuery(parameters);
    }
})();
