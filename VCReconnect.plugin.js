/**
 * @name VCReconnect
 * @author KevDaDev (updated & fixed by Grok - v0.3.4)
 * @description Auto-rejoins specified VC when not in any (lock to enable)
 * @version 0.3.4
 */

const defaultSettings = {
    channelId: "1469136426250801152",
    username: "",
    checkIntervalMs: 8000
};

module.exports = class VCReconnect {

    settings = { ...defaultSettings };
    interval = null;
    isLocked = false;
    rejoinCount = 0;
    observer = null;
    button = null;
    injectionInterval = null;
    joinVoiceFunc = null;

    getName() { return "VCReconnect"; }
    getDescription() { return "Auto-rejoins chosen VC when disconnected."; }
    getVersion() { return "0.3.4"; }
    getAuthor() { return "KevDaDev (updated)"; }

    showToast(msg, opts = {}) {
        try {
            (BdApi.UI?.showToast ?? BdApi.showToast ?? console.log.bind(console, "[VCReconnect]"))(msg, opts);
        } catch {}
    }

    start() {
        this.settings = { ...defaultSettings, ...BdApi.Data.load(this.getName(), "settings") };
        this.findJoinFunction();
        this.setupInjection();
        this.showToast(`VCReconnect v0.3.4 loaded – Join func: ${this.joinVoiceFunc ? 'Found' : 'Missing'}`, 
            {type: this.joinVoiceFunc ? "success" : "error"});
        console.log("[VCReconnect] Started. Join function status:", this.joinVoiceFunc ? "FOUND" : "MISSING");
    }

    findJoinFunction() {
        const possibleFinders = [
            m => m?.selectVoiceChannel,
            m => m?.joinVoiceChannel,
            m => m?.transitionToVoiceChannel,
            m => m?.connectToVoiceChannel,
            m => m?.default?.prototype?.join,
            m => typeof m?.selectVoice === 'function' || typeof m?.join === 'function'
        ];

        for (const finder of possibleFinders) {
            const mod = BdApi.Webpack.getModule(finder);
            if (mod) {
                this.joinVoiceFunc = mod.selectVoiceChannel || mod.joinVoiceChannel || mod.transitionToVoiceChannel || 
                                     mod.connectToVoiceChannel || mod.default?.prototype?.join || mod.selectVoice || mod.join;
                if (typeof this.joinVoiceFunc === 'function') {
                    console.log("[VCReconnect] Join function found:", this.joinVoiceFunc.name || 'anonymous');
                    return;
                }
            }
        }
        console.warn("[VCReconnect] No voice join function found after exhaustive search");
    }

    // ... (rest of the code remains the same as v0.3.3: setupInjection, tryInjectButton, removeButton, updateButton, lock, unlock, startInterval, checkAndRejoin, getSettingsPanel)

    checkAndRejoin() {
        if (!this.isLocked) return;

        const VoiceStore = BdApi.Webpack.getModule(m => m.getVoiceStateForUser || m.getSelfVoiceState);
        const UserStore = BdApi.Webpack.getModule(m => m.getCurrentUser);

        const user = UserStore?.getCurrentUser?.();
        if (!user) return;

        const state = VoiceStore?.getVoiceStateForUser?.(user.id) || VoiceStore?.getSelfVoiceState?.();
        if (state?.channelId) return; // Already in VC

        if (!this.joinVoiceFunc) {
            console.warn("[VCReconnect] Join function still missing");
            this.showToast("Join API still missing – check console / reload Discord", {type: "error"});
            return;
        }

        try {
            this.joinVoiceFunc(this.settings.channelId);  // Call whatever we found
            this.rejoinCount++;
            this.showToast(`Rejoined VC (${this.rejoinCount})`, {type: "info"});
            this.updateButton();
        } catch (e) {
            console.error("[VCReconnect] Join attempt failed:", e);
            this.showToast("Join failed – see console", {type: "error"});
        }
    }

    // Include the full setupInjection / tryInjectButton / etc. from previous v0.3.3 version here
    // (To save space, I'm not repeating the identical parts – copy them over from your current file)

    // ... end of class
};
