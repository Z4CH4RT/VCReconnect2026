/**
 * @name VCReconnect
 * @author KevDaDev (updated & fixed by Grok - v0.3.3)
 * @description Automatically rejoins specified VC when not in any (lock to enable)
 * @version 0.3.3
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

    getName() { return "VCReconnect"; }
    getDescription() { return "Auto-rejoins chosen VC when disconnected."; }
    getVersion() { return "0.3.3"; }
    getAuthor() { return "KevDaDev (updated)"; }

    showToast(msg, opts = {}) {
        try {
            (BdApi.UI?.showToast ?? BdApi.showToast ?? console.log.bind(console, "[VCReconnect Toast]"))(msg, opts);
        } catch {}
    }

    start() {
        this.settings = { ...defaultSettings, ...BdApi.Data.load(this.getName(), "settings") };
        this.setupInjection();
        this.showToast("VCReconnect v0.3.3 loaded – check console for debug", {type: "success"});
        console.log("[VCReconnect] Plugin started. Reload Discord or join/leave VC to trigger button.");
    }

    stop() {
        this.unlock();
        if (this.observer) this.observer.disconnect();
        if (this.injectionInterval) clearInterval(this.injectionInterval);
        this.removeButton();
        this.showToast("VCReconnect stopped", {type: "info"});
    }

    setupInjection() {
        // MutationObserver on body for dynamic inserts
        this.observer = new MutationObserver(() => this.tryInjectButton());
        this.observer.observe(document.body, { childList: true, subtree: true });

        // Periodic retry (every 2s for first 20s, then slower)
        this.injectionInterval = setInterval(() => this.tryInjectButton(), 2000);
        setTimeout(() => {
            if (this.injectionInterval) clearInterval(this.injectionInterval);
        }, 20000);

        // Initial attempts
        setTimeout(() => this.tryInjectButton(), 500);
        setTimeout(() => this.tryInjectButton(), 1500);
    }

    tryInjectButton() {
        if (this.button) return; // Already injected

        // Target common 2025-2026 mute/deafen container selectors
        const possibleContainers = document.querySelectorAll([
            '[class*="voiceControls"]',
            '[class*="withTagAsButton"]',
            '[class*="container"][class*="user"]',
            'section[aria-label*="user" i]',
            '[aria-label*="Mute microphone" i] ~ *',
            '[aria-label*="Deafen" i] ~ *',
            '.buttonContainer-',
            '[role="toolbar"]',
            '[class*="bottomControls-"]',
            '[class*="controls-"] button'
        ].join(', '));

        let targetPanel = null;
        for (const el of possibleContainers) {
            // Look for mute or deafen button nearby (aria-label is stable)
            if (el.querySelector('[aria-label*="Mute"], [aria-label*="Deafen"], [aria-label*="Microphone Muted"]')) {
                targetPanel = el;
                break;
            }
        }

        if (!targetPanel) {
            console.log("[VCReconnect] No suitable panel found yet. Try joining a voice channel.");
            return;
        }

        console.log("[VCReconnect] Found target panel:", targetPanel);

        this.removeButton(); // Clean old if any

        this.button = document.createElement("button");
        this.button.id = "vcreconnect-lock-btn";
        this.button.innerHTML = this.isLocked ? "🔓 Unlock" : "🔒 Lock VC";
        this.button.title = "VCReconnect: Toggle auto-rejoin";
        this.button.style.cssText = `
            margin: 0 4px; padding: 0 8px; height: 24px; line-height: 24px;
            font-size: 13px; border-radius: 3px; cursor: pointer;
            background: ${this.isLocked ? '#5865F2' : '#4F545C'};
            color: white; border: none;
        `;

        this.button.onclick = () => {
            if (this.isLocked) this.unlock();
            else this.lock();
            this.updateButton();
        };

        // Insert near mute/deafen (after last button in toolbar)
        const insertPoint = targetPanel.querySelector('button:last-child') || targetPanel;
        insertPoint.parentNode?.insertBefore(this.button, insertPoint.nextSibling) ||
            insertPoint.appendChild(this.button);

        console.log("[VCReconnect] Button injected successfully!");
        this.showToast("Lock button added near mute/deafen", {type: "success"});
        this.updateButton();
    }

    removeButton() {
        document.getElementById("vcreconnect-lock-btn")?.remove();
        this.button = null;
    }

    updateButton() {
        if (!this.button) return;
        this.button.innerHTML = this.isLocked ? `🔓 Unlock (${this.rejoinCount})` : `🔒 Lock (${this.rejoinCount})`;
        this.button.style.background = this.isLocked ? '#5865F2' : '#4F545C';
    }

    lock() {
        if (!this.settings.channelId.trim()) {
            this.showToast("Set Channel ID first!", {type: "error"});
            return;
        }
        this.isLocked = true;
        this.rejoinCount = 0;
        this.startInterval();
        this.showToast("VC locked – auto-rejoin enabled", {type: "success"});
        this.updateButton();
    }

    unlock() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
        this.isLocked = false;
        this.showToast("VC unlocked", {type: "info"});
        this.updateButton();
    }

    startInterval() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.checkAndRejoin(), this.settings.checkIntervalMs);
    }

    checkAndRejoin() {
        if (!this.isLocked) return;

        const VoiceStore = BdApi.Webpack.getModule(m => m.getVoiceStateForUser || m.getSelfVoiceState);
        const UserStore = BdApi.Webpack.getModule(m => m.getCurrentUser);

        const user = UserStore?.getCurrentUser?.();
        if (!user) return;

        const state = VoiceStore?.getVoiceStateForUser?.(user.id) || VoiceStore?.getSelfVoiceState?.();
        if (state?.channelId) return; // In VC

        const joinModule = BdApi.Webpack.getModule(m => m.selectVoiceChannel);
        if (!joinModule?.selectVoiceChannel) {
            console.warn("[VCReconnect] No selectVoiceChannel found");
            this.showToast("Join API missing – Discord update?", {type: "error"});
            return;
        }

        joinModule.selectVoiceChannel(this.settings.channelId);
        this.rejoinCount++;
        this.showToast(`Rejoined VC (${this.rejoinCount})`, {type: "info"});
        this.updateButton();
    }

    getSettingsPanel() {
        const div = document.createElement("div");
        div.style.padding = "10px";
        div.innerHTML = `
            <h3>VCReconnect Settings (v0.3.3)</h3>
            <label>Channel ID:</label><br>
            <input id="cid" value="${this.settings.channelId}" style="width:100%; margin:8px 0;"><br>
            <label>Username (optional):</label><br>
            <input id="usr" value="${this.settings.username}" style="width:100%; margin:8px 0;"><br>
            <label>Check interval (ms):</label><br>
            <input id="intv" type="number" value="${this.settings.checkIntervalMs}" min="3000" style="width:100%; margin:8px 0;"><br>
            <small>Tip: Join any VC in the server to make the lock button appear near mute/deafen.</small>
        `;

        div.querySelector("#cid").onchange = e => { this.settings.channelId = e.target.value.trim(); BdApi.Data.save(this.getName(), "settings", this.settings); };
        div.querySelector("#usr").onchange = e => { this.settings.username = e.target.value.trim(); BdApi.Data.save(this.getName(), "settings", this.settings); };
        div.querySelector("#intv").onchange = e => {
            this.settings.checkIntervalMs = Math.max(3000, +e.target.value || 8000);
            BdApi.Data.save(this.getName(), "settings", this.settings);
            if (this.isLocked) this.startInterval();
        };

        return div;
    }
};
