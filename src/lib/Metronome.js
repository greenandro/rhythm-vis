/**
 * Metronome
 *
 * @example
 * const m = new Metronome();
 * m.start(120, 4);
 */
class Metronome {

    // Config
    #beepDuration = 0.05;
    #lookAheadTime = 0.5;
    #scheduleTimeout = 100;
    // State
    #isPlaying = false;
    // Stores the timeout
    #timerID = null;
    #bpm = null;
    #accent = 4;
    #startTimeStamp = null;
    // Stores the number of the current beat (for accents)
    #beatCount = null;
    // Stores the beeps left to play (when using rhythm from MusicPiece)
    #rhythm = null;
    #audioCtx = new AudioContext();
    // Callback
    #onClick = null;

    /**
     * @returns {number} bpm
     */
    get bpm() { return this.#bpm; }

    /**
     * @returns {number} beat count
     */
    get beatCount() { return this.#beatCount; }

    /**
     * @param {function} callback callback
     */
    onClick(callback) {
        this.#onClick = callback
    }

    /**
     * Starts the metronome with a given tempo in bpm
     *
     * @param {number} bpm tempo in bpm
     * @param {number} [accent=4] accent every nth beat by changing pitch
     */
    start(bpm, accent = 4) {
        if (!bpm || Number.isNaN(+bpm)) {
            console.error(`[Metronome] Invalid bpm ${bpm}`);
            return;
        }
        if (!accent || Number.isNaN(+accent)) {
            console.error(`[Metronome] Invalid accent ${accent}`);
            return;
        }
        console.log(`Metronome @ ${bpm}bpm, accent every ${accent}. beat`);
        if (this.#audioCtx.state === 'suspended') {
            this.#audioCtx.resume();
        }
        this.#bpm = +bpm;
        this.#accent = +accent;
        this.#isPlaying = true;
        // Reset state
        this.#beatCount = -1;
        this.#startTimeStamp = this.#audioCtx.currentTime;
        this._scheduler();
    }

    /**
     * Stops the metronome
     */
    stop() {
        console.log('[Metronome] stopped');
        clearTimeout(this.#timerID);
        this.#isPlaying = false;
    }

    /**
     * Starts the metronome is it not running and stops it if it is
     *
     * @param {number} bpm tempo in bpm, last used bpm will be used as fallback
     * @param {number} [accent=4] accent every nth beat by changing pitch
     */
    toggle(bpm, accent = 4) {
        if (this.#isPlaying) {
            this.stop();
        } else {
            if (bpm === undefined) {
                bpm = this.#bpm;
            }
            this.start(bpm, accent);
        }
    }

    /**
     * Plays a single peep.
     */
    peep() {
        if (this.#audioCtx.state === 'suspended') {
            this.#audioCtx.resume();
        }
        const osc = this.#audioCtx.createOscillator();
        osc.connect(this.#audioCtx.destination);
        osc.frequency.value = 220;
        osc.start(this.#audioCtx.currentTime);
        osc.stop(this.#audioCtx.currentTime + this.#beepDuration);
    }

    /**
     * Scheduler runs every scheduleTimeout milliseconds to schedule notes
     * for the coming lookahead time in seconds.
     *
     * @private
     */
    _scheduler = () => {
        // Beat properties
        const accentNote = this.#accent;
        const secondsPerBeat = 60 / this.#bpm;
        let nextNotetime = this.#startTimeStamp + this.#beatCount * secondsPerBeat;
        // Only schedule beats until the lookahead is reached
        while (nextNotetime < this.#audioCtx.currentTime + this.#lookAheadTime) {
            nextNotetime += secondsPerBeat;
            // Accent on every n-th note starting with the 0th
            const isAccent = this.#beatCount % accentNote === accentNote - 1 || this.#beatCount === -1;
            const frequency = isAccent ? 330 : 220;
            this._playSound(nextNotetime, frequency);
            this.#beatCount++;
        }
        // Plan next scheduler run
        this.#timerID = setTimeout(this._scheduler, this.#scheduleTimeout);
    };

    /**
     * Scheduler runs every scheduleTimeout milliseconds to schedule notes
     * for the coming lookahead time in seconds.
     *
     * @private
     */
    _schedulerForRhythmTrack = () => {
        const scheduleEndTime = this.#audioCtx.currentTime + this.#lookAheadTime;
        // Schedule beeps
        while (this.#rhythm.length > 0) {
            const nextNoteTime = this.#startTimeStamp + this.#rhythm[0].time;
            // Only schedule until the lookahead is reached
            if (nextNoteTime > scheduleEndTime) {
                break;
            }
            // Play beep
            const beep = this.#rhythm.shift();
            const frequency = beep.accent ? 330 : 220;
            this._playSound(nextNoteTime, frequency);
        }
        if (this.#rhythm.length > 0) {
            // Plan next scheduler run
            this.#timerID = setTimeout(this._schedulerForRhythmTrack, this.#scheduleTimeout);
        }
    };

    /**
     * Play a sounds via AudioContext and an oscillator.
     *
     * @private
     * @param {number} time  AudioContext time in seconds
     * @param {number} frequency frequency in Hz
     */
    _playSound(time, frequency) {
        this.#onClick(time)
        const osc = this.#audioCtx.createOscillator();
        osc.connect(this.#audioCtx.destination);
        osc.frequency.value = frequency;
        osc.start(time);
        osc.stop(time + this.#beepDuration);
    }
}

export default Metronome;
