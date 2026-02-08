/**
 * @name VCReconnect
 * @author KevDaDev (updated & fixed by Grok)
 * @description Automatically rejoins a specified voice channel when you're not in any VC (lock to enable)
 * @version 0.3.2
 * @website https://example.com
 * @source https://example.com
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

    getName() { return "VCReconnect"; }
    getDescription() { return "Auto-rejoins your chosen VC when disconnected / not in voice."; }
    getVersion() { return "0.3.2"; }
    getAuthor() { return "KevDaDev (updated)"; }

    showToast(message, options = {}) {
        try {
            if (BdApi?.UI?.showToast) return BdApi.UI.showToast(message, options);
            if (BdApi?.showToast) return BdApi.showToast(message, options);
            console.log(`[VCReconnect] ${message}`);
        } catch(e) {
            console.log(`[VCReconnect] ${message}`);
        }
    }

    start() {
        this.settings = { ...defaultSettings, ...BdApi.Data.load(this.getName(), "settings") };
        this.setupButtonObserver();
        this.showToast("VCReconnect loaded – watching for user panel", {type: "success"});
        console.log("[VCReconnect] Started. Open a voice channel/server to see Lock button.");
    }

    stop() {
        this.unlock();
        if (this.observer) this.observer.disconnect();
        this.removeButton();
        this.showToast("VCReconnect stopped", {type: "info"});
    }

    // 🔥 NEW: Robust button injection with MutationObserver
    setupButtonObserver() {
        const selectors = [
            '[class*="userPanel"]',           // Main user panel
            '[class*="voiceStatus"]',         // Voice status area
            'section[aria-label*="Account"]', // Account section
            '[class*="container-"][class*="userPopout"]', // Popout wrappers
            '.container-1giJp5',              // Legacy fallback
            '[data-list-id="voice-users"] ~ *', // Near voice user list
            'div[role="toolbar"] button:last-of-type' // Mute/deafen toolbar
        ];

        this.observer = new MutationObserver(() => {
            this.injectButton();
        });

        // Start observing common root containers
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });

        // Immediate injection attempt
        setTimeout(() => this.injectButton(), 1000);
        // Retry every 3s for 30s (handles slow loads)
        const retries = setInterval(() => {
            this.injectButton();
            if (this.button) clearInterval(retries);
        }, 3000);
        setTimeout(() => clearInterval(retries), 30000);
    }

    injectButton() {
        if (this.button) return; // Already have one

        // Find any user/voice control panel
        const panel = Array.from(document.querySelectorAll([
            '[class*="userPanel"]',
            '[class*="voiceStatus"]',
            'section[aria-label*="Account"]',
            '.container-1giJp5',
            '[class*="layout-"] > [class*="button-"]'
        ].join(','))).find(p => 
            p.querySelector('[class*="muteButton"], [class*="deafenButton"], [aria-label*="Microphone"], [aria-label*="Speakers"]')
        );

        if (!panel) {
            console.log("[VCReconnect] No user panel found yet...");
            return;
        }

        console.log("[VCReconnect] Found panel:", panel);

        // Remove any existing
        this.removeButton();

        // Create button
        this.button = document.createElement("button");
        this.button.id = "vcreconnect-lock-btn";
        this.button.className = [
            "button-56b2cF", "button-3bW-PT", "buttonColor-3i1Yze", 
            "colorBrand-3pXr91", "sizeMedium-1MuvfX", "grow-1vLImu",
            "button-3bW-PT"  // 2026 classes – adjust if needed
        ].join(" ");
        this.button.style.cssText = `
            margin-left: 8px; min-width: 85px; height: 32px; 
            font-size: 14px; border-radius: 4px;
        `;
        this.button.innerHTML = this.isLocked ? "🔓 Unlock VC" : "🔒 Lock VC";
        this.button.title = "VCReconnect: Toggle auto-rejoin";

        this.button.onclick = (e) => {
            e.stopPropagation();
            if (this.isLocked) this.unlock();
            else this.lock();
            this.updateButton();
        };

        // Insert after mute/deafen buttons
        const insertAfter = panel.querySelector('[class*="mute"], [class*="deafen"], [aria-label*="Microphone"], button:last-of-type');
        if (insertAfter) {
            insertAfter.parentNode.insertBefore(this.button, insertAfter.nextSibling);
        } else {
            panel.appendChild(this.button);
        }

        this.updateButton();
        console.log("[VCReconnect] Lock button injected!");
        this.showToast("Lock VC button added (near mute/deafen)", {type: "success"});
    }

    removeButton() {
        const oldBtn = document.getElementById("vcreconnect-lock-btn");
        if (oldBtn) oldBtn.remove();
        this.button = null;
    }

    updateButton() {
        if (!this.button) return;
        this.button.innerHTML = this.isLocked 
            ? `🔓 Unlock (${this.rejoinCount})` 
            : `🔒 Lock VC (${this.rejoinCount})`;
        this.button.style.opacity = this.isLocked ? "1" : "0.8";
        this.button.style.backgroundColor = this.isLocked ? "#59A6FF" : "";
    }

    lock() {
        if (!this.settings.channelId?.trim()) {
            this.showToast("❌ Set Channel ID in plugin settings first!", {type: "error"});
            return;
        }
        this.isLocked = true;
        this.rejoinCount = 0;
        this.startInterval();
        this.showToast(`✅ Locked to VC ${this.settings.channelId.slice(-4)} – auto-rejoin ON`, {type: "success"});
        this.updateButton();
    }

    unlock() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isLocked = false;
        this.showToast("🔓 Unlocked – auto-rejoin OFF", {type: "info"});
        this.updateButton();
    }

    startInterval() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.checkAndRejoin(), this.settings.checkIntervalMs);
    }

    checkAndRejoin() {
        if (!this.isLocked) return;

        // Get voice state modules (more robust finders)
        const VoiceModule = BdApi.Webpack.getModule(m => m.getVoiceStateForUser && m.getSelfVoiceState);
        const UserModule = BdApi.Webpack.getModule(m => m.getCurrentUser);
        
        if (!VoiceModule || !UserModule) {
            console.warn("[VCReconnect] Missing voice/user modules");
            return;
        }

        const currentUser = UserModule.getCurrentUser();
        const myVoiceState = VoiceModule.getVoiceStateForUser ? 
            VoiceModule.getVoiceStateForUser(currentUser.id) : 
            VoiceModule.getSelfVoiceState?.();

        if (myVoiceState?.channelId) {
            return; // Already in VC
        }

        // Join VC
        const ChannelModule = BdApi.Webpack.getModule(m => m.selectVoiceChannel || m.joinVoiceChannel);
        const joinFunc = ChannelModule?.selectVoiceChannel || ChannelModule?.transitionToVoiceChannel;
        
        if (!joinFunc) {
            this.showToast("⚠️ Discord API changed – update plugin", {type: "error"});
            console.error("[VCReconnect] No join function found");
            return;
        }

        try {
            joinFunc(this.settings.channelId);
            this.rejoinCount++;
            this.showToast(`🔄 Rejoined VC #${this.rejoinCount}`, {type: "info"});
            this.updateButton();
        } catch(e) {
            console.error("[VCReconnect] Join failed:", e);
        }
    }

    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.padding = "16px; font-family: Whitney, sans-serif;";
        panel.innerHTML = `
            <div style="margin-bottom: 20px;">
                <h3 style="color: #fff; margin: 0 0 12px 0;">🔒 VCReconnect Settings</h3>
                <label style="color: #dcddde; font-size: 14px;">Target Voice Channel ID</label><br>
                <input id="chId" value="${this.settings.channelId}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #40444a; background: #36393f; color: #dcddde;">
                
                <label style="color: #dcddde; font-size: 14px; margin-top: 12px; display: block;">Your Username (optional)</label><br>
                <input id="usr" value="${this.settings.username}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #40444a; background: #36393f; color: #dcddde;">
                
                <label style="color: #dcddde; font-size: 14px; margin-top: 12px; display: block;">Check Interval (ms) <small>(min 3000)</small></label><br>
                <input id="int" type="number" value="${this.settings.checkIntervalMs}" min="3000" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #40444a; background: #36393f; color: #dcddde;">
            </div>
            <div style="font-size: 12px; color: #72767d; border-top: 1px solid #40444a; padding-top: 12px;">
                💡 <strong>Usage:</strong> Set Channel ID → Save → Join any VC → Lock button appears near Mute/Deafen → Click to enable auto-rejoin.<br>
                Target: <code>${this.settings.channelId.slice(-6)}</code> | Status: ${this.isLocked ? '🟢 LOCKED' : '🔴 UNLOCKED'}
            </div>
        `;

        // Event listeners
        panel.querySelector("#chId").oninput = e => {
            this.settings.channelId = e.target.value.trim();
            BdApi.Data.save(this.getName(), "settings", this.settings);
        };
        panel.querySelector("#usr").oninput = e => {
            this.settings.username = e.target.value.trim();
            BdApi.Data.save(this.getName(), "settings", this.settings);
        };
        panel.querySelector("#int").oninput = e => {
            this.settings.checkIntervalMs = Math.max(3000, parseInt(e.target.value) || 8000);
            BdApi.Data.save(this.getName(), "settings", this.settings);
            if (this.isLocked) this.startInterval();
        };

        return panel;
    }
};
