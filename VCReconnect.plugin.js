/**
 * @name AutoJoinVC
 * @author Grok (based on VCReconnect ideas)
 * @description Auto-joins a hard-coded voice channel when you're not in any VC and locked (button near mute/deafen)
 * @version 0.4.0
 * @date 2026-02
 */

const TARGET_CHANNEL_ID = "1469136426250801152";  // ← change here if needed
const CHECK_INTERVAL_MS = 7000;                   // 7 seconds – reasonable

module.exports = class AutoJoinVC {

    getName() { return "AutoJoinVC"; }
    getDescription() { return "Automatically joins target VC when not connected (toggle with lock button)"; }
    getVersion() { return "0.4.0"; }
    getAuthor() { return "Grok"; }

    settings = { locked: false };
    interval = null;
    rejoinCount = 0;
    button = null;
    joinFunc = null;
    observer = null;

    load() {
        this.settings = BdApi.Data.load(this.getName(), "settings") || { locked: false };
    }

    save() {
        BdApi.Data.save(this.getName(), "settings", this.settings);
    }

    start() {
        this.load();
        this.findJoinFunction();
        this.setupButton();
        console.log("[AutoJoinVC] Started | Locked:", this.settings.locked, "| Join func:", !!this.joinFunc);
        BdApi.UI?.showToast?.("AutoJoinVC loaded", {type: "success"}) || console.log("[AutoJoinVC] Loaded");
    }

    stop() {
        this.unlock();
        if (this.observer) this.observer.disconnect();
        if (this.button) this.button.remove();
        BdApi.UI?.showToast?.("AutoJoinVC stopped", {type: "info"}) || console.log("[AutoJoinVC] Stopped");
    }

    findJoinFunction() {
        const candidates = [
            m => m?.selectVoiceChannel,
            m => m?.joinVoiceChannel,
            m => m?.transitionToVoiceChannel,
            m => m?.connectToVoiceChannel,
            m => m?.selectVoice,
            m => m?.join,
            m => m?.default?.prototype?.joinVoice
        ];

        for (const finder of candidates) {
            const mod = BdApi.Webpack.getModule(finder);
            if (mod) {
                this.joinFunc = mod.selectVoiceChannel || mod.joinVoiceChannel || mod.transitionToVoiceChannel ||
                                mod.connectToVoiceChannel || mod.selectVoice || mod.join ||
                                (mod.default?.prototype?.joinVoice?.bind?.(mod.default.prototype));
                if (typeof this.joinFunc === "function") {
                    console.log("[AutoJoinVC] Join function found:", this.joinFunc.name || "(anonymous)");
                    return;
                }
            }
        }
        console.warn("[AutoJoinVC] No voice join function detected – auto-join won't work until Discord update fix");
    }

    setupButton() {
        this.observer = new MutationObserver(() => this.injectButton());
        this.observer.observe(document.body, { childList: true, subtree: true });

        // Aggressive retry
        const tryInject = () => this.injectButton();
        setInterval(tryInject, 2500);
        setTimeout(tryInject, 800);
        setTimeout(tryInject, 2000);
        setTimeout(tryInject, 5000);
    }

    injectButton() {
        if (this.button) return;

        // Find container with mute/deafen buttons (aria-label is most stable)
        const muteBtn = document.querySelector('[aria-label*="Mute"][aria-label*="microphone" i], [aria-label*="Deafen"][aria-label*="speakers" i]');
        if (!muteBtn) {
            console.log("[AutoJoinVC] Mute/Deafen buttons not found yet – try joining/leaving a VC");
            return;
        }

        const container = muteBtn.closest('[class*="container" i], [class*="controls" i], [role="toolbar"], section, div');
        if (!container) return;

        console.log("[AutoJoinVC] Found controls container");

        this.button = document.createElement("button");
        this.button.id = "autojoinvc-lock-btn";
        this.button.innerHTML = this.settings.locked ? "🔓 Unlock" : "🔒 Lock VC";
        this.button.style.cssText = "margin: 0 6px; padding: 0 10px; height: 28px; font-size: 13px; border-radius: 4px; cursor: pointer; background: " + (this.settings.locked ? "#5865F2" : "#4F545C") + "; color: white; border: none;";
        this.button.onclick = () => {
            this.settings.locked = !this.settings.locked;
            this.save();
            this.updateButton();
            if (this.settings.locked) this.startCheck();
            else this.unlock();
            console.log("[AutoJoinVC] Locked:", this.settings.locked);
        };

        muteBtn.parentNode.insertBefore(this.button, muteBtn.nextSibling);
        console.log("[AutoJoinVC] Lock button injected!");
        BdApi.UI?.showToast?.("Lock VC button added near mute", {type: "success"});
        this.updateButton();

        if (this.settings.locked) this.startCheck();
    }

    updateButton() {
        if (!this.button) return;
        this.button.innerHTML = this.settings.locked ? `🔓 Unlock (${this.rejoinCount})` : `🔒 Lock VC (${this.rejoinCount})`;
        this.button.style.background = this.settings.locked ? "#5865F2" : "#4F545C";
    }

    startCheck() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.checkAndJoin(), CHECK_INTERVAL_MS);
        this.checkAndJoin(); // immediate check
    }

    unlock() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    async checkAndJoin() {
        if (!this.settings.locked) return;

        // Get self voice state
        const VoiceState = BdApi.Webpack.getModule(m => m.getVoiceStateForUser || m.getSelfVoiceState);
        const User = BdApi.Webpack.getModule(m => m.getCurrentUser);
        if (!VoiceState || !User) return;

        const currentUser = User.getCurrentUser?.();
        if (!currentUser) return;

        const state = VoiceState.getVoiceStateForUser?.(currentUser.id) || VoiceState.getSelfVoiceState?.();
        if (state?.channelId) return; // already connected somewhere

        if (!this.joinFunc) {
            console.warn("[AutoJoinVC] No join function – can't auto-join");
            return;
        }

        try {
            this.joinFunc(TARGET_CHANNEL_ID);
            this.rejoinCount++;
            console.log("[AutoJoinVC] Attempted join #" + this.rejoinCount);
            BdApi.UI?.showToast?.(`Rejoining VC... (${this.rejoinCount})`, {type: "info"});
            this.updateButton();
        } catch (err) {
            console.error("[AutoJoinVC] Join error:", err);
        }
    }

    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.padding = "15px";
        panel.innerHTML = `
            <h3>AutoJoinVC Settings</h3>
            <p>Target Channel ID: <code>${TARGET_CHANNEL_ID}</code></p>
            <p>Status: ${this.settings.locked ? '🟢 Locked (auto-join ON)' : '🔴 Unlocked'}</p>
            <p>Check every ~${CHECK_INTERVAL_MS/1000}s when locked.</p>
            <small>Use the lock button near mute/deafen to toggle. Keep the server open.</small>
        `;
        return panel;
    }
};
