/**
 * @name AutoJoinVCToggle
 * @author Grok
 * @description Press L to toggle auto-join to voice channel 1469136426250801152 when not in any VC. Shows toast on toggle.
 * @version 0.1.1
 * @date February 2026 - improved join finder
 */

const TARGET_CHANNEL_ID = "1469136426250801152";
const CHECK_INTERVAL_MS = 7000;

module.exports = class AutoJoinVCToggle {

    getName() { return "AutoJoinVCToggle"; }
    getDescription() { return "Press L to toggle auto-join to specific VC when disconnected"; }
    getVersion() { return "0.1.1"; }
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
        console.log("[AutoJoinVCToggle v0.1.1] Loaded | Locked:", this.locked, "| Join func:", !!this.joinFunc);
        this.showToast(`Auto-join ${this.locked ? "ENABLED" : "disabled"} (press L to toggle)`, {type: this.locked ? "success" : "info"});
    }

    stop() {
        this.unlock();
        if (this.keyListener) document.removeEventListener("keydown", this.keyListener);
        this.showToast("AutoJoinVCToggle stopped", {type: "info"});
    }

    showToast(message, options = {type: "info"}) {
        try {
            (BdApi.UI?.showToast ?? BdApi.showToast ?? console.log.bind(console, "[Toast]"))(message, options);
        } catch {}
    }

    addKeyListener() {
        this.keyListener = (e) => {
            if (e.key.toLowerCase() === "l" && !e.repeat) {
                this.locked = !this.locked;
                this.save();
                this.showToast(this.locked ? "Channel locked 🔒" : "Channel unlocked 🔓", 
                    {type: this.locked ? "success" : "warning"});
                
                if (this.locked) this.startInterval();
                else this.unlock();
                
                console.log("[AutoJoinVCToggle] Locked toggled:", this.locked);
                // e.preventDefault(); // Uncomment if you don't want 'l' to type in chat
            }
        };
        document.addEventListener("keydown", this.keyListener);
    }

    findJoinFunction() {
        // Expanded search for 2026 Discord webpack changes
        const finders = [
            m => m?.selectVoiceChannel,
            m => m?.joinVoiceChannel,
            m => m?.transitionToVoiceChannel,
            m => m?.connectToVoiceChannel,
            m => m?.selectVoice,
            m => m?.joinChannel,
            m => m?.default?.selectVoiceChannel,
            m => m?.default?.joinVoiceChannel,
            m => Object.values(m).find(v => typeof v === 'function' && v.toString().includes('channelId') && v.toString().includes('voice')),
            m => m?.prototype?.joinVoice  // rare prototype case
        ];

        for (const finder of finders) {
            const mod = BdApi.Webpack.getModule(finder);
            if (mod) {
                this.joinFunc = 
                    mod.selectVoiceChannel || mod.joinVoiceChannel || mod.transitionToVoiceChannel ||
                    mod.connectToVoiceChannel || mod.selectVoice || mod.joinChannel ||
                    mod.default?.selectVoiceChannel || mod.default?.joinVoiceChannel ||
                    (typeof finder(m) === 'function' ? finder(m) : null);
                
                if (typeof this.joinFunc === 'function') {
                    console.log("[AutoJoinVCToggle] Join function located:", this.joinFunc.name || "(dynamic)");
                    return;
                }
            }
        }

        console.warn("[AutoJoinVCToggle] Still no join function found after expanded search. Run console tests above and share output.");
    }

    startInterval() {
        this.unlock();
        this.interval = setInterval(() => this.tryRejoin(), CHECK_INTERVAL_MS);
        this.tryRejoin();
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
        if (state?.channelId) return; // already connected

        if (!this.joinFunc) {
            console.warn("[AutoJoinVCToggle] No join function available");
            return;
        }

        try {
            this.joinFunc(TARGET_CHANNEL_ID);
            this.rejoinCount++;
            this.showToast(`Rejoined locked VC (${this.rejoinCount})`, {type: "info"});
            console.log("[AutoJoinVCToggle] Rejoin attempt #" + this.rejoinCount);
        } catch (err) {
            console.error("[AutoJoinVCToggle] Rejoin error:", err.message || err);
        }
    }

    getSettingsPanel() {
        const div = document.createElement("div");
        div.style.padding = "15px";
        div.innerHTML = `
            <h3>AutoJoinVCToggle v0.1.1</h3>
            <p>Key: <strong>L</strong> toggles auto-join to <code>${TARGET_CHANNEL_ID}</code></p>
            <p>State: ${this.locked ? '🔒 Locked (active)' : '🔓 Unlocked'}</p>
            <p>If no auto-join: Check console for "join function" warnings.</p>
        `;
        return div;
    }
};
