/**
 * @name VCReconnect
 * @author Grok (heavily fixed for 2026 Discord)
 * @description Auto-joins target VC (1469136426250801152) when not in any VC – toggle with lock button near mute/deafen
 * @version 0.4.1
 * @date February 2026
 */

const TARGET_CHANNEL_ID = "1469136426250801152";
const CHECK_INTERVAL_MS = 7000;

module.exports = class VCReconnect {

    getName() { return "VCReconnect"; }
    getDescription() { return "Auto-rejoins target VC when disconnected (lock button near mute/deafen)"; }
    getVersion() { return "0.4.1"; }
    getAuthor() { return "Grok (fixed)"; }

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
        console.log("[VCReconnect 0.4.1] Started | Locked:", this.locked, "| Join func:", !!this.joinFunc);
        BdApi.UI?.showToast("VCReconnect loaded – check console (Ctrl+Shift+I)", {type: "success"});
    }

    stop() {
        this.unlock();
        if (this.observer) this.observer.disconnect();
        if (this.button) this.button.remove();
        BdApi.UI?.showToast("VCReconnect stopped", {type: "info"});
    }

    findJoinFunction() {
        const mods = BdApi.Webpack.getModules(m => m && (m.selectVoiceChannel || m.joinVoiceChannel || m.transitionToVoiceChannel || m.connectToVoiceChannel || m.selectVoice || m.join));
        for (const m of mods || []) {
            this.joinFunc = m.selectVoiceChannel || m.joinVoiceChannel || m.transitionToVoiceChannel || m.connectToVoiceChannel || m.selectVoice || m.join;
            if (typeof this.joinFunc === "function") {
                console.log("[VCReconnect] Join func found:", this.joinFunc.name || "anonymous");
                return;
            }
        }
        console.warn("[VCReconnect] No joinVoice func found – auto-join disabled until reload/fix");
    }

    setupObserverAndRetries() {
        this.observer = new MutationObserver(() => this.tryAddButton());
        this.observer.observe(document.body, { childList: true, subtree: true, attributes: true });

        // Retries – Discord can be slow to render bottom bar
        const retry = () => this.tryAddButton();
        [500, 1500, 3000, 6000, 10000].forEach(delay => setTimeout(retry, delay));
        setInterval(retry, 4000); // Ongoing watch
    }

    tryAddButton() {
        if (this.button) return;

        // Stable 2025–2026 selectors: aria-label on mute/deafen buttons
        const muteAria = '[aria-label*="Mute microphone" i], [aria-label*="Unmute microphone" i], [aria-label*="Mute" i][aria-label*="microphone" i]';
        const deafenAria = '[aria-label*="Deafen" i], [aria-label*="Undeafen" i], [aria-label*="Speakers" i]';
        const controlBtns = document.querySelectorAll(`${muteAria}, ${deafenAria}`);

        if (!controlBtns.length) {
            console.log("[VCReconnect] Mute/Deafen controls not visible yet – join/leave VC to trigger");
            return;
        }

        console.log("[VCReconnect] Found voice controls:", controlBtns.length, "elements");

        const container = controlBtns[0].closest('div[class*="container" i], div[class*="controls" i], div[role="toolbar" i], section, footer, [class*="userArea" i], [class*="voiceUser" i]');
        if (!container) {
            console.warn("[VCReconnect] No suitable parent container found for button");
            return;
        }

        this.button = document.createElement("button");
        this.button.id = "vcreconnect-lock";
        this.button.innerHTML = this.locked ? "🔓 Unlock" : "🔒 Lock";
        this.button.style = "margin: 0 6px; padding: 4px 10px; height: 28px; font-size: 13px; border-radius: 4px; background: " + (this.locked ? "#5865F2" : "#5D6269") + "; color: white; border: none; cursor: pointer;";
        this.button.onclick = () => {
            this.locked = !this.locked;
            this.save();
            this.updateButton();
            if (this.locked) this.startInterval();
            else this.unlock();
            console.log("[VCReconnect] Toggled lock:", this.locked);
        };

        // Insert after mute or deafen
        const insertAfter = controlBtns[controlBtns.length - 1];
        insertAfter.parentNode.insertBefore(this.button, insertAfter.nextSibling);

        console.log("[VCReconnect] Lock button ADDED successfully!");
        BdApi.UI?.showToast("Lock button added near mute/deafen", {type: "success"});
        this.updateButton();

        if (this.locked) this.startInterval();
    }

    updateButton() {
        if (!this.button) return;
        this.button.innerHTML = this.locked ? `🔓 Unlock (${this.rejoinCount})` : `🔒 Lock (${this.rejoinCount})`;
        this.button.style.background = this.locked ? "#5865F2" : "#5D6269";
    }

    startInterval() {
        this.unlock(); // clear old
        this.interval = setInterval(() => this.tryRejoin(), CHECK_INTERVAL_MS);
        this.tryRejoin(); // immediate
    }

    unlock() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
    }

    tryRejoin() {
        if (!this.locked) return;

        const UserStore = BdApi.Webpack.getModule(m => m.getCurrentUser);
        const VoiceStore = BdApi.Webpack.getModule(m => m.getVoiceStateForUser || m.getSelfVoiceState);
        const user = UserStore?.getCurrentUser?.();
        if (!user) return;

        const state = VoiceStore?.getVoiceStateForUser?.(user.id) || VoiceStore?.getSelfVoiceState?.();
        if (state?.channelId) return; // Already in VC

        if (!this.joinFunc) {
            console.warn("[VCReconnect] No join func – can't rejoin");
            return;
        }

        try {
            this.joinFunc(TARGET_CHANNEL_ID);
            this.rejoinCount++;
            console.log("[VCReconnect] Rejoin attempt #" + this.rejoinCount);
            BdApi.UI?.showToast(`Rejoining VC... (${this.rejoinCount})`, {type: "info"});
            this.updateButton();
        } catch (e) {
            console.error("[VCReconnect] Rejoin failed:", e);
        }
    }

    getSettingsPanel() {
        const div = document.createElement("div");
        div.style.padding = "15px";
        div.innerHTML = `<h3>VCReconnect (v0.4.1)</h3>
            <p>Target: <code>${TARGET_CHANNEL_ID}</code></p>
            <p>Locked: ${this.locked ? 'YES (auto-rejoin active)' : 'NO'}</p>
            <p>Use the lock button near mute/deafen (appear after join/leave VC).</p>
            <small>Console (Ctrl+Shift+I) has debug info if issues.</small>`;
        return div;
    }
};
