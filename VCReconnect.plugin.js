/**
 * @name VCReconnect
 * @author KevDaDev (updated & fixed by Grok)
 * @description Automatically rejoins a specified voice channel when you're not in any VC (lock to enable)
 * @version 0.3.0
 * @website https://example.com (optional)
 * @source https://example.com (optional)
 */

const defaultSettings = {
    channelId: '',   // ← your target channel ID
    username: '',                       // optional: your username (with discriminator if <2023 style) or display name
    checkIntervalMs: 8000               // 8 seconds – not too aggressive
};

module.exports = class VCReconnect {

    settings = { ...defaultSettings };
    interval = null;
    isLocked = false;
    rejoinCount = 0;

    getName()          { return "VCReconnect"; }
    getDescription()   { return "Auto-rejoins your chosen VC when disconnected / not in voice."; }
    getVersion()       { return "0.3.0"; }
    getAuthor()        { return "KevDaDev (updated)"; }

    start() {
        this.settings = { ...defaultSettings, ...BdApi.Data.load(this.getName(), "settings") };
        this.addLockButton();
        BdApi.showToast("VCReconnect loaded", {type: "success", icon: true});
    }

    stop() {
        this.unlock();
        this.removeLockButton();
        BdApi.showToast("VCReconnect unloaded", {type: "info"});
    }

    addLockButton() {
        // User controls area (mute/deafen panel)
        const waitForPanel = setInterval(() => {
            const panel = document.querySelector('section[aria-label="User area"]') ||
                          document.querySelector('[aria-label="User Controls"]') ||
                          document.querySelector('[class*="container"][class*="withTagAsButton"]');

            if (!panel) return;

            clearInterval(waitForPanel);

            const existing = document.getElementById("vcreconnect-lock-btn");
            if (existing) existing.remove();

            const btn = document.createElement("button");
            btn.id = "vcreconnect-lock-btn";
            btn.className = "button__581d0 buttonColor__7bad9 button_b82d53 colorBrand__27d57 sizeSmall_da7d10 grow__4c8a4";
            btn.style.marginLeft = "8px";
            btn.style.minWidth = "90px";
            btn.innerHTML = this.isLocked ? "Unlock VC" : "Lock VC";

            btn.onclick = () => {
                if (this.isLocked) this.unlock();
                else this.lock();
                this.updateButton();
            };

            const wrapper = document.createElement("div");
            wrapper.style.padding = "4px 8px";
            wrapper.appendChild(btn);

            panel.appendChild(wrapper); // or insertBefore(lastChild) if you prefer left side
            this.updateButton();
        }, 300);
    }

    removeLockButton() {
        const btn = document.getElementById("vcreconnect-lock-btn");
        if (btn) btn.closest("div").remove();
    }

    updateButton() {
        const btn = document.getElementById("vcreconnect-lock-btn");
        if (!btn) return;
        btn.innerHTML = this.isLocked
            ? `Unlock VC (${this.rejoinCount})`
            : `Lock VC (${this.rejoinCount})`;
        btn.classList.toggle("buttonActive_ae686f", this.isLocked); // active style if exists
    }

    lock() {
        if (!this.settings.channelId) {
            BdApi.showToast("Set a Channel ID in settings first!", {type: "error"});
            return;
        }

        this.isLocked = true;
        this.rejoinCount = 0;
        this.startInterval();
        BdApi.showToast("VC locked – will auto-rejoin when not connected", {type: "success"});
        this.updateButton();
    }

    unlock() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isLocked = false;
        BdApi.showToast("VC unlocked", {type: "info"});
        this.updateButton();
    }

    startInterval() {
        if (this.interval) clearInterval(this.interval);

        this.interval = setInterval(() => this.checkAndRejoin(), this.settings.checkIntervalMs);
    }

    checkAndRejoin() {
        if (!this.isLocked) return;

        const VoiceStateStore = BdApi.Webpack.getModule(m => m?.getVoiceStateForUser);
        const currentUser = BdApi.Webpack.getModule(m => m?.getCurrentUser)?.getCurrentUser();
        if (!VoiceStateStore || !currentUser) return;

        const myState = VoiceStateStore.getVoiceStateForUser(currentUser.id);
        if (myState?.channelId) return; // already in a VC → skip

        // Optional: check username if set
        if (this.settings.username) {
            // Could add extra check here if needed – but usually channelId check is enough
        }

        const selectVoiceChannel = BdApi.Webpack.getModule(m => m?.selectVoiceChannel)?.selectVoiceChannel;
        if (!selectVoiceChannel) {
            console.warn("[VCReconnect] selectVoiceChannel not found");
            BdApi.showToast("Cannot join – Discord API changed?", {type: "error"});
            return;
        }

        selectVoiceChannel(this.settings.channelId);
        this.rejoinCount++;
        BdApi.showToast(`Rejoining VC... (${this.rejoinCount})`, {type: "info"});
        this.updateButton();
    }

    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.padding = "10px";

        panel.innerHTML = `
            <h3>VCReconnect Settings</h3>
            <div style="margin:10px 0;">
                <label>Target Voice Channel ID</label><br>
                <input type="text" id="chId" value="${this.settings.channelId}" style="width:100%; margin:6px 0;">
            </div>
            <div style="margin:10px 0;">
                <label>Your Username (optional – helps in rare cases)</label><br>
                <input type="text" id="usr" value="${this.settings.username}" style="width:100%; margin:6px 0;">
            </div>
            <div style="margin:10px 0;">
                <label>Check interval (ms)</label><br>
                <input type="number" id="int" value="${this.settings.checkIntervalMs}" min="3000" step="1000" style="width:100%; margin:6px 0;">
            </div>
            <small style="color:#b9b9b9;">Tip: You must keep the server open/visible.</small>
        `;

        panel.querySelector("#chId").onchange = e => {
            this.settings.channelId = e.target.value.trim();
            BdApi.Data.save(this.getName(), "settings", this.settings);
        };

        panel.querySelector("#usr").onchange = e => {
            this.settings.username = e.target.value.trim();
            BdApi.Data.save(this.getName(), "settings", this.settings);
        };

        panel.querySelector("#int").onchange = e => {
            this.settings.checkIntervalMs = parseInt(e.target.value, 10) || 8000;
            BdApi.Data.save(this.getName(), "settings", this.settings);
            if (this.isLocked) this.startInterval();
        };

        return panel;
    }
};