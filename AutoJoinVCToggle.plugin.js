/**
 * @name AutoJoinVCBotSyndicateServer
 * @author Zac Hartgrove
 * @description Press L to toggle auto-join. Tries main VC, falls back to secondary if it fails.
 * @version 0.2.0
 * @date 2026-02
 */

const MAIN_CHANNEL_ID = "1469136426250801152";
const FALLBACK_CHANNEL_ID = "1459856756816613548";
const CHECK_INTERVAL_MS = 7000;

module.exports = class AutoJoinVCToggle {

    getName() { return "AutoJoinVCToggle"; }
    getDescription() { return "Press L to toggle auto-join to main VC (with fallback to secondary)"; }
    getVersion() { return "0.2.0"; }
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
        console.log("[AutoJoinVCToggle v0.2.0] Loaded | Locked:", this.locked, "| Join func:", !!this.joinFunc);
        this.showToast(`Auto-join ${this.locked ? "ENABLED" : "disabled"} (L to toggle)`, {type: this.locked ? "success" : "info"});
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
                
                console.log("[AutoJoinVCToggle] Locked:", this.locked);
                // e.preventDefault(); // uncomment if you don't want 'l' to type in chat
            }
        };
        document.addEventListener("keydown", this.keyListener);
    }

    findJoinFunction() {
        const finders = [
            m => m?.selectVoiceChannel,
            m => m?.joinVoiceChannel,
            m => m?.transitionToVoiceChannel,
            m => m?.connectToVoiceChannel,
            m => m?.selectVoice,
            m => m?.joinChannel,
            m => m?.default?.selectVoiceChannel,
            m => m?.default?.joinVoiceChannel,
            m => Object.values(m).find(v => typeof v === 'function' && v.toString().includes('channelId') && v.toString().includes('voice'))
        ];

        for (const finder of finders) {
            const mod = BdApi.Webpack.getModule(finder);
            if (mod) {
                this.joinFunc = 
                    mod.selectVoiceChannel || mod.joinVoiceChannel || mod.transitionToVoiceChannel ||
                    mod.connectToVoiceChannel || mod.selectVoice || mod.joinChannel ||
                    mod.default?.selectVoiceChannel || mod.default?.joinVoiceChannel ||
                    (typeof finder(mod) === 'function' ? finder(mod) : null);
                
                if (typeof this.joinFunc === 'function') {
                    console.log("[AutoJoinVCToggle] Join function found");
                    return;
                }
            }
        }
        console.warn("[AutoJoinVCToggle] No join function found");
    }

    startInterval() {
        this.unlock();
        this.interval = setInterval(() => this.tryRejoin(), CHECK_INTERVAL_MS);
        this.tryRejoin(); // immediate check
    }

    unlock() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    async tryRejoin() {
        if (!this.locked) return;

        const UserStore = BdApi.Webpack.getModule(m => m.getCurrentUser);
        const VoiceStore = BdApi.Webpack.getModule(m => m.getVoiceStateForUser);
        const user = UserStore?.getCurrentUser?.();
        if (!user) return;

        const state = VoiceStore?.getVoiceStateForUser?.(user.id);
        if (state?.channelId) return; // already in a vc

        if (!this.joinFunc) {
            console.warn("[AutoJoinVCToggle] No join function available");
            return;
        }

        try {
            // Try main channel first
            this.joinFunc(MAIN_CHANNEL_ID);
            this.rejoinCount++;
            this.showToast(`Joined main VC (${this.rejoinCount})`, {type: "success"});
            console.log("[AutoJoinVCToggle] Joined main channel");
            return;
        } catch (err) {
            console.warn("[AutoJoinVCToggle] Failed to join main channel:", err.message || err);
        }

        // Fallback to secondary channel
        try {
            this.joinFunc(FALLBACK_CHANNEL_ID);
            this.rejoinCount++;
            this.showToast(`Main failed → Joined fallback VC (${this.rejoinCount})`, {type: "warning"});
            console.log("[AutoJoinVCToggle] Joined fallback channel");
        } catch (err) {
            console.error("[AutoJoinVCToggle] Also failed fallback:", err.message || err);
            this.showToast("Failed to join both channels", {type: "error"});
        }
    }

    getSettingsPanel() {
        const div = document.createElement("div");
        div.style.padding = "15px";
        div.innerHTML = `
            <h3>AutoJoinVCToggle v0.2.0</h3>
            <p>Key: <strong>L</strong> to toggle</p>
            <p>Main target: <code>${MAIN_CHANNEL_ID}</code></p>
            <p>Fallback: <code>${FALLBACK_CHANNEL_ID}</code></p>
            <p>Status: ${this.locked ? '🔒 Locked (active)' : '🔓 Unlocked'}</p>
        `;
        return div;
    }
};
