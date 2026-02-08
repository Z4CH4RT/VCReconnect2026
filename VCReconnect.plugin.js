/**
 * @name AutoJoinVCToggle
 * @author Grok
 * @description Press L to toggle auto-join to voice channel 1469136426250801152 when not in any VC. Shows toast on toggle.
 * @version 0.1.0
 * @date February 2026
 */

const TARGET_CHANNEL_ID = "1469136426250801152";
const CHECK_INTERVAL_MS = 7000; // 7 seconds

module.exports = class AutoJoinVCToggle {

    getName() { return "AutoJoinVCToggle"; }
    getDescription() { return "Press L to toggle auto-join to specific VC when disconnected"; }
    getVersion() { return "0.1.0"; }
    getAuthor() { return "Grok"; }

    locked = false;
    interval = null;
    rejoinCount = 0;
    joinFunc = null;
    keyListener = null;

    load() {
        this.locked = BdApi.Data.load(this.getName(), "locked") ?? false;
    }

    save() {
        BdApi.Data.save(this.getName(), "locked", this.locked);
    }

    start() {
        this.load();
        this.findJoinFunction();
        this.addKeyListener();
        if (this.locked) this.startInterval();
        console.log("[AutoJoinVCToggle] Loaded | Locked:", this.locked);
        this.showToast(`Auto-join ${this.locked ? "ENABLED" : "disabled"} (press L to toggle)`, {type: this.locked ? "success" : "info"});
    }

    stop() {
        this.unlock();
        if (this.keyListener) {
            document.removeEventListener("keydown", this.keyListener);
        }
        this.showToast("AutoJoinVCToggle stopped", {type: "info"});
    }

    showToast(message, options = {type: "info"}) {
        try {
            if (BdApi.UI?.showToast) {
                BdApi.UI.showToast(message, options);
            } else if (BdApi.showToast) {
                BdApi.showToast(message, options);
            } else {
                console.log(`[Toast] ${message}`);
            }
        } catch (e) {
            console.log(`[Toast fallback] ${message}`);
        }
    }

    addKeyListener() {
        this.keyListener = (e) => {
            if (e.key.toLowerCase() === "l" && !e.repeat) {  // !e.repeat prevents holding key spam
                // Optional: require Ctrl or Alt if you want to avoid accidental presses
                // if (!e.ctrlKey) return;

                this.locked = !this.locked;
                this.save();
                this.showToast(this.locked ? "Channel locked 🔒" : "Channel unlocked 🔓", 
                    {type: this.locked ? "success" : "warning"});
                
                if (this.locked) {
                    this.startInterval();
                } else {
                    this.unlock();
                }
                
                console.log("[AutoJoinVCToggle] Toggled locked:", this.locked);
                e.preventDefault(); // optional: stop 'l' from typing in chat
            }
        };

        document.addEventListener("keydown", this.keyListener);
    }

    findJoinFunction() {
        const possible = BdApi.Webpack.getModule(m => 
            m?.selectVoiceChannel || m?.joinVoiceChannel || m?.transitionToVoiceChannel || m?.connectToVoiceChannel
        );

        if (possible) {
            this.joinFunc = possible.selectVoiceChannel || possible.joinVoiceChannel || 
                            possible.transitionToVoiceChannel || possible.connectToVoiceChannel;
            console.log("[AutoJoinVCToggle] Join function found");
        } else {
            console.warn("[AutoJoinVCToggle] No join function found – reload Discord if auto-join fails");
        }
    }

    startInterval() {
        this.unlock(); // clear old if any
        this.interval = setInterval(() => this.tryRejoin(), CHECK_INTERVAL_MS);
        this.tryRejoin(); // check right away
    }

    unlock() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    tryRejoin() {
        if (!this.locked) return;

        const UserStore = BdApi.Webpack.getModule(m => m.getCurrentUser);
        const VoiceStore = BdApi.Webpack.getModule(m => m.getVoiceStateForUser);
        const user = UserStore?.getCurrentUser?.();
        if (!user) return;

        const state = VoiceStore?.getVoiceStateForUser?.(user.id);
        if (state?.channelId) return; // already in a voice channel

        if (!this.joinFunc) {
            console.warn("[AutoJoinVCToggle] Join function missing");
            return;
        }

        try {
            this.joinFunc(TARGET_CHANNEL_ID);
            this.rejoinCount++;
            this.showToast(`Rejoined locked VC (${this.rejoinCount})`, {type: "info"});
            console.log("[AutoJoinVCToggle] Rejoined #" + this.rejoinCount);
        } catch (err) {
            console.error("[AutoJoinVCToggle] Join failed:", err);
        }
    }

    getSettingsPanel() {
        const div = document.createElement("div");
        div.style.padding = "15px";
        div.innerHTML = `
            <h3>AutoJoinVCToggle</h3>
            <p>Key: <strong>L</strong> to toggle auto-join to channel <code>${TARGET_CHANNEL_ID}</code></p>
            <p>Current state: ${this.locked ? '🔒 Locked (auto-rejoin active)' : '🔓 Unlocked'}</p>
            <p>Checks every ~7 seconds when locked. Keep the server visible.</p>
            <small>Toast notifications appear on toggle and rejoin.</small>
        `;
        return div;
    }
};
