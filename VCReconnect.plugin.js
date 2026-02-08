/**
 * @name VCReconnect
 * @author Grok (adjusted for voice isolation proximity 2026)
 * @description Auto-joins target VC (1469136426250801152) when not in any – lock button near mute / voice isolation
 * @version 0.4.2
 * @date February 2026
 */

const TARGET_CHANNEL_ID = "1469136426250801152";
const CHECK_INTERVAL_MS = 7000;

module.exports = class VCReconnect {

    getName() { return "VCReconnect"; }
    getDescription() { return "Auto-rejoins target VC when disconnected (lock near mute/voice isolation)"; }
    getVersion() { return "0.4.2"; }
    getAuthor() { return "Grok"; }

    locked = false;
    interval = null;
    rejoinCount = 0;
    button = null;
    joinFunc = null;
    observer = null;

    load() {
        this.locked = BdApi.Data.load(this.getName(), "locked") ?? false;
    }

    save() {
        BdApi.Data.save(this.getName(), "locked", this.locked);
    }

    start() {
        this.load();
        this.findJoinFunction();
        this.setupObserverAndRetries();
        console.log("[VCReconnect 0.4.2] Started | Locked:", this.locked);
        BdApi.UI?.showToast("VCReconnect loaded – button should appear near mute/isolation", {type: "success"});
    }

    stop() {
        this.unlock();
        if (this.observer) this.observer.disconnect();
        if (this.button) this.button.remove();
        BdApi.UI?.showToast("VCReconnect stopped", {type: "info"});
    }

    findJoinFunction() {
        const mods = BdApi.Webpack.getModules(m => m && (m.selectVoiceChannel || m.joinVoiceChannel || m.transitionToVoiceChannel));
        for (const m of mods || []) {
            this.joinFunc = m.selectVoiceChannel || m.joinVoiceChannel || m.transitionToVoiceChannel;
            if (typeof this.joinFunc === "function") {
                console.log("[VCReconnect] Join func found");
                return;
            }
        }
        console.warn("[VCReconnect] Join func not found");
    }

    setupObserverAndRetries() {
        this.observer = new MutationObserver(() => this.tryAddButton());
        this.observer.observe(document.body, { childList: true, subtree: true });

        const retry = () => this.tryAddButton();
        [800, 2000, 4000, 8000].forEach(d => setTimeout(retry, d));
        setInterval(retry, 5000);
    }

    tryAddButton() {
        if (this.button) return;

        // Target mute button first (most reliable anchor)
        const muteSelector = '[aria-label*="Mute microphone" i], [aria-label*="Unmute" i][aria-label*="microphone" i], [aria-label*="Microphone" i]';
        const muteBtn = document.querySelector(muteSelector);

        if (!muteBtn) {
            console.log("[VCReconnect] Mute button not found yet – join/leave a VC");
            return;
        }

        console.log("[VCReconnect] Mute button located");

        // Try to find voice isolation / noise suppression nearby (fallback if present)
        let targetAnchor = muteBtn;
        const isolationNearby = document.querySelector('[aria-label*="isolation" i], [aria-label*="noise" i], [aria-label*="suppression" i], [aria-label*="Voice Isolation" i]');
        if (isolationNearby && Math.abs(isolationNearby.getBoundingClientRect().left - muteBtn.getBoundingClientRect().left) < 200) {
            targetAnchor = isolationNearby;
            console.log("[VCReconnect] Voice isolation element found – using as anchor");
        }

        const container = targetAnchor.closest('div[class*="controls" i], div[class*="container" i][class*="voice" i], [role="toolbar"], .flex-');
        if (!container) {
            console.log("[VCReconnect] No voice controls container");
            return;
        }

        // Create button
        this.button = document.createElement("button");
        this.button.id = "vcreconnect-lock";
        this.button.innerHTML = this.locked ? "Unlock VC" : "Lock VC";
        this.button.style = `
            margin: 0 4px; padding: 0 10px; height: 28px; font-size: 13px;
            border-radius: 4px; background: ${this.locked ? '#5865F2' : '#5D6269'};
            color: white; border: none; cursor: pointer; min-width: 80px;
        `;
        this.button.onclick = () => {
            this.locked = !this.locked;
            this.save();
            this.updateButton();
            if (this.locked) this.startInterval();
            else this.unlock();
        };

        // Insert AFTER the anchor (mute or isolation) for proximity
        targetAnchor.parentNode.insertBefore(this.button, targetAnchor.nextSibling);

        console.log("[VCReconnect] Button injected near mute/voice isolation!");
        BdApi.UI?.showToast("Lock button placed near mute/voice isolation", {type: "success"});
        this.updateButton();

        if (this.locked) this.startInterval();
    }

    updateButton() {
        if (!this.button) return;
        this.button.innerHTML = this.locked ? `Unlock (${this.rejoinCount})` : `Lock (${this.rejoinCount})`;
        this.button.style.background = this.locked ? '#5865F2' : '#5D6269';
    }

    startInterval() {
        this.unlock();
        this.interval = setInterval(() => this.tryRejoin(), CHECK_INTERVAL_MS);
        this.tryRejoin();
    }

    unlock() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
    }

    tryRejoin() {
        if (!this.locked) return;

        const UserStore = BdApi.Webpack.getModule(m => m.getCurrentUser);
        const VoiceStore = BdApi.Webpack.getModule(m => m.getVoiceStateForUser);
        const user = UserStore?.getCurrentUser?.();
        if (!user) return;

        const state = VoiceStore?.getVoiceStateForUser?.(user.id);
        if (state?.channelId) return;

        if (!this.joinFunc) return;

        try {
            this.joinFunc(TARGET_CHANNEL_ID);
            this.rejoinCount++;
            BdApi.UI?.showToast(`Rejoined VC (${this.rejoinCount})`, {type: "info"});
            this.updateButton();
        } catch (e) {
            console.error("[VCReconnect] Rejoin error:", e);
        }
    }

    getSettingsPanel() {
        const div = document.createElement("div");
        div.style.padding = "15px";
        div.innerHTML = `<h3>VCReconnect v0.4.2</h3>
            <p>Target Channel: <code>${TARGET_CHANNEL_ID}</code></p>
            <p>Auto-rejoin when locked (button near mute/voice isolation)</p>
            <small>Debug: Open console (Ctrl+Shift+I) for logs if button position still off.</small>`;
        return div;
    }
};
