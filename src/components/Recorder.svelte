<script>
  import { recordAudio } from 'musicvis-lib';
  import { Temporal } from '@js-temporal/polyfill';
  import { onMount, onDestroy } from 'svelte';
  import Metronome from '../lib/Metronome.js';
  import AudioPlayer from './AudioPlayer.svelte';
  import SheetMusic from './SheetMusic.svelte';
  import PianoRoll from './PianoRoll.svelte';
  import { WebMidi } from 'webmidi';
  import * as d3 from 'd3';
  import { downloadBlob, downloadTextFile } from '../lib/download.js';

  export let dataDirectoryHandle = null;

  let width;
  // Recorders
  let isRecording = false;
  let recordingStartTime;
  let recordingStopTime;
  let noteOns = [];
  let noteOffs = [];
  const onEnabled = () => {
    console.log(`MIDI enabled`);
    for (const input of WebMidi.inputs) {
      input.addListener('noteon', (e) => noteOns.push(e));
      input.addListener('noteoff', (e) => noteOffs.push(e));
    }
  };
  let audioRecorder;
  // Settings
  let exercise = localStorage.getItem('exercise') ?? '';
  let person = localStorage.getItem('person') ?? '';
  let bpm = +(localStorage.getItem('bpm') ?? 120);
  let beep = +(localStorage.getItem('beep') ?? 1);
  let accent = +(localStorage.getItem('accent') ?? 1);
  // Data
  let audio;
  let notes;
  let metronomeClicks = [];
  let metronomeAccents = [];
  // let metronomeClicksStartTime;
  let pcm;
  // Metronome
  let metroDiv;
  let metro = new Metronome();
  metro.onClick((time, isAccent) => {
    // metronomeClicksStartTime = WebMidi.time;
    metronomeClicks.push(time);
    if (isAccent) {
      metronomeAccents.push(time);
    }
  });

  const exercises = [
    // Run preprocessing/exercise-summary.py for a list
    'drum_snare_eighths-to-eighth-triplets',
    'drum_snare_eighths-to-quarter-quintuplets',
    'guitar_a-minor-pentatonic_eighths',
    'guitar_a-minor_eighths',
    'guitar_chords-f7_halfs',
    'guitar_chords-fm7_halfs',
    'guitar_e-string_quarters',
    'guitar_e-string_quarters-to-eighths',
    'guitar_powerchords_quarter-to-eighths-with-rest',
    'guitar_single-notes_eighths-to-eighth-triplets',
    'piano_c-major_eighths',
  ];

  onMount(async () => {
    // enable MIDI and audio access
    try {
      audioRecorder = await recordAudio();
    } catch (e) {
      console.error('Cannot enable audio recording');
      console.error(e);
    }
    try {
      await WebMidi.enable();
      onEnabled();
    } catch (e) {
      console.error('Cannot enable MIDI recording');
      console.error(e);
    }
  });

  const start = () => {
    isRecording = true;
    audio = null;
    noteOns = [];
    noteOffs = [];
    notes = null;
    audioRecorder.start();
    metro.start(bpm / beep, accent);
    metronomeClicks = [];
    recordingStartTime = performance.now();
    console.log('start', recordingStartTime);
  };

  const stop = async () => {
    console.log('stop');
    metro.stop();
    recordingStopTime = performance.now();
    audio = await audioRecorder.stop();
    const noteOffMap = d3.group(
      noteOffs,
      (d) => d.port.id,
      (d) => d.message.channel,
      (d) => d.note.number
    );

    // metronome clicks
    const firstClick = metronomeClicks.length > 0 ? metronomeClicks[0] : 0;
    console.log(firstClick);

    metronomeClicks = metronomeClicks.map((d) => d - firstClick);
    metronomeAccents = metronomeAccents.map((d) => d - firstClick);

    // notes
    notes = noteOns.map((noteOn) => {
      // get end by closest-in-time noteOff event
      const noteOffCandidates =
        noteOffMap
          .get(noteOn.port.id)
          ?.get(noteOn.message.channel)
          ?.get(noteOn.note.number) ?? [];
      let noteOff = noteOffCandidates.filter(
        (d) => d.timestamp >= noteOn.timestamp
      );
      const end =
        noteOff.length === 0 ? recordingStopTime : noteOff[0].timestamp;
      const startInSeconds = (noteOn.timestamp - recordingStartTime) / 1000;
      const endInSeconds = (end - recordingStartTime) / 1000;
      return {
        port: noteOn.port.name,
        channel: noteOn.message.channel,
        pitch: noteOn.note.number,
        name: noteOn.note.identifier,
        start: startInSeconds,
        end: endInSeconds,
        duration: endInSeconds - startInSeconds,
        velocity: noteOn.note.attack,
      };
    });
    console.log('notes', notes);
    console.log('metronome clicks', metronomeClicks);
    isRecording = false;
  };

  const download = () => {
    const pers = person.split(/\s+/).join('-');
    const now = Temporal.Now.plainDateTimeISO().toJSON();
    const date = now.substring(0, 10).replace(':', '-');
    const name = `${exercise}_${bpm}-bpm_${beep}-click_${pers}_${date}`;
    downloadTextFile(document, JSON.stringify(notes), `${name}.rec.json`);
    downloadTextFile(
      document,
      JSON.stringify(metronomeClicks),
      `${name}.clicks.json`
    );
    downloadTextFile(
      document,
      JSON.stringify(metronomeAccents),
      `${name}.accents.json`
    );
    downloadBlob(document, audio, name);
    // Use file system API
  };

  onDestroy(() => {
    // remove MIDI listeners to avoid duplicate calls and improve performance
    for (const input of WebMidi.inputs) {
      input.removeListener();
    }
  });
</script>

<main bind:clientWidth="{width}">
  <h2>Recorder</h2>
  <div>
    Your Name:
    <input
      type="text"
      bind:value="{person}"
      on:input="{(e) => localStorage.setItem('person', e.target.value)}"
      placeholder="Firstname Lastname"
    />
  </div>

  <div>
    <label>
      Exercise:
      <select
        bind:value="{exercise}"
        on:input="{(e) => localStorage.setItem('exercise', e.target.value)}"
      >
        <option value="" disabled>select an exercise</option>
        {#each exercises as ex}
          <option value="{ex}">{ex}</option>
        {/each}
      </select>
    </label>
  </div>

  <SheetMusic exercise="{exercise}" />

  <div bind:this="{metroDiv}" class="metronome">
    Metronome:
    <input
      bind:value="{bpm}"
      on:input="{(e) => localStorage.setItem('bpm', e.target.value)}"
      type="number"
      min="60"
      max="240"
      step="10"
      style="width: 50px"
    />
    bpm, beep on every
    <input
      bind:value="{beep}"
      on:input="{(e) => localStorage.setItem('beep', e.target.value)}"
      type="number"
      min="1"
      max="16"
      step="1"
      style="width: 30px"
    />. beat, accent on every
    <input
      bind:value="{accent}"
      on:input="{(e) => localStorage.setItem('accent', e.target.value)}"
      type="number"
      min="1"
      max="16"
      step="1"
      style="width: 30px"
    />. beep
  </div>

  <div>
    Recording:
    <button on:click="{() => (isRecording ? stop() : start())}">
      {isRecording ? 'stop' : 'start'}
    </button>
  </div>

  <h2>Result</h2>
  <div>
    Saving:
    <button on:click="{download}" disabled="{!audio && !notes}">
      download
    </button>
  </div>

  <div>
    <AudioPlayer
      blob="{audio}"
      width="{width}"
      height="{30}"
      bind:pcm="{pcm}"
    />
    {#if notes?.length > 0 || audio}
      <PianoRoll
        notes="{notes}"
        metronomeClicks="{metronomeClicks}"
        metronomeAccents="{metronomeAccents}"
        width="{width}"
        pcm="{pcm}"
        audioDuration="{(recordingStopTime - recordingStartTime) / 1000}"
      />
    {/if}
  </div>
</main>

<style>
  main {
    padding: 0;
  }

  .metronome {
    background: none;
    border-radius: 5px;
  }
</style>
