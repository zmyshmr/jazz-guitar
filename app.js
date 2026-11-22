"use strict";

// ---------- 音名・コード品質の定義 ----------

const NOTE_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };

// 各コードクオリティの構成音（ルートからの半音数とラベル）
const QUALITIES = {
  maj:        [[0,"R"],[4,"3"],[7,"5"]],
  min:        [[0,"R"],[3,"♭3"],[7,"5"]],
  dim:        [[0,"R"],[3,"♭3"],[6,"♭5"]],
  aug:        [[0,"R"],[4,"3"],[8,"♯5"]],
  maj7:       [[0,"R"],[4,"3"],[7,"5"],[11,"7"]],
  maj9:       [[0,"R"],[4,"3"],[7,"5"],[11,"7"],[2,"9"]],
  maj6:       [[0,"R"],[4,"3"],[7,"5"],[9,"6"]],
  maj69:      [[0,"R"],[4,"3"],[7,"5"],[9,"6"],[2,"9"]],
  min7:       [[0,"R"],[3,"♭3"],[7,"5"],[10,"♭7"]],
  min9:       [[0,"R"],[3,"♭3"],[7,"5"],[10,"♭7"],[2,"9"]],
  min11:      [[0,"R"],[3,"♭3"],[7,"5"],[10,"♭7"],[2,"9"],[5,"11"]],
  min6:       [[0,"R"],[3,"♭3"],[7,"5"],[9,"6"]],
  min7b5:     [[0,"R"],[3,"♭3"],[6,"♭5"],[10,"♭7"]],
  dim7:       [[0,"R"],[3,"♭3"],[6,"♭5"],[9,"♭♭7"]],
  dom7:       [[0,"R"],[4,"3"],[7,"5"],[10,"♭7"]],
  dom9:       [[0,"R"],[4,"3"],[7,"5"],[10,"♭7"],[2,"9"]],
  dom11:      [[0,"R"],[4,"3"],[7,"5"],[10,"♭7"],[2,"9"],[5,"11"]],
  dom13:      [[0,"R"],[4,"3"],[7,"5"],[10,"♭7"],[9,"13"]],
  sus4:       [[0,"R"],[5,"4"],[7,"5"]],
  dom7sus4:   [[0,"R"],[5,"4"],[7,"5"],[10,"♭7"]],
  add9:       [[0,"R"],[4,"3"],[7,"5"],[2,"9"]],
};

// クオリティ表記 → 正規名（大文字小文字を区別。M7とm7のような曖昧さに対応するため）
const EXACT_ALIAS = {
  "": "maj",
  "maj7": "maj7", "Maj7": "maj7", "MAJ7": "maj7", "ma7": "maj7", "M7": "maj7", "Δ": "maj7", "Δ7": "maj7",
  "maj9": "maj9", "M9": "maj9", "Δ9": "maj9",
  "maj6": "maj6", "6": "maj6",
  "6/9": "maj69", "69": "maj69", "maj69": "maj69",
  "m": "min", "min": "min", "-": "min",
  "m7": "min7", "min7": "min7", "-7": "min7",
  "m9": "min9", "min9": "min9", "-9": "min9",
  "m11": "min11", "min11": "min11", "-11": "min11",
  "m6": "min6", "min6": "min6", "-6": "min6",
  "m7b5": "min7b5", "m7♭5": "min7b5", "min7b5": "min7b5", "ø": "min7b5", "ø7": "min7b5", "-7b5": "min7b5",
  "dim7": "dim7", "o7": "dim7", "°7": "dim7",
  "dim": "dim", "o": "dim", "°": "dim",
  "aug": "aug", "+": "aug",
  "7": "dom7",
  "9": "dom9",
  "11": "dom11",
  "13": "dom13",
  "sus4": "sus4", "sus": "sus4",
  "7sus4": "dom7sus4", "7sus": "dom7sus4",
  "add9": "add9",
};

// 大文字小文字を無視した補助マッチ（曖昧な m/M 系は含めない）
const FALLBACK_ALIAS = {
  "maj7": "maj7", "maj9": "maj9", "maj6": "maj6",
  "min7": "min7", "min9": "min9", "min11": "min11", "min6": "min6", "min7b5": "min7b5",
  "dim7": "dim7", "dim": "dim", "aug": "aug",
  "sus4": "sus4", "7sus4": "dom7sus4", "add9": "add9",
};

// コード名の末尾に @6 / @5 / @4 を付けると、そのコードだけルートの弦を個別指定できる
const STRING_SUFFIX_TO_INDEX = { "6": 0, "5": 1, "4": 2 };

// 度数ラベル（"R"/"♭3"など）から臨時記号を除いた素の度数（"1"/"3"...）を取り出す
function bareDegree(label) {
  if (label === "R") return "1";
  return label.replace(/[♭♯]/g, "");
}

// コードの構成音から指定した度数（"1"/"3"/"5"/"7"）に一致する音を探す
function findToneForDegree(chord, degree) {
  for (const [semi, label] of chord.intervals) {
    if (bareDegree(label) === degree) {
      return { pc: (chord.rootPc + semi) % 12, label };
    }
  }
  return null;
}

// メロディの再生順（例: "1,3,5,7"）をパースする。無効な入力はデフォルトにフォールバック
function parseMelodyOrder(text) {
  const allowed = new Set(["1", "3", "5", "7"]);
  const tokens = text.split(/[,\s]+/).map((t) => t.trim()).filter((t) => allowed.has(t));
  return tokens.length ? tokens : ["1", "3", "5", "7"];
}

// ピッチクラスをメロディ用のオクターブ（コード伴奏より高い音域）の周波数に変換する
function pcToFreq(pc, octave) {
  const semitoneFromA4 = (pc - 9) + (octave - 4) * 12;
  return 440 * Math.pow(2, semitoneFromA4 / 12);
}

function parseChord(token) {
  let raw = token.trim();
  if (!raw) return null;

  let rootStringOverride = null;
  const posMatch = raw.match(/@([456])\s*$/);
  if (posMatch) {
    rootStringOverride = STRING_SUFFIX_TO_INDEX[posMatch[1]];
    raw = raw.slice(0, posMatch.index).trim();
  }

  const m = raw.match(/^([A-Ga-g])([#♯b♭]?)(.*)$/);
  if (!m) return null;
  const rootLetter = m[1].toUpperCase();
  const accRaw = m[2];
  const rest = m[3].trim();
  const acc = accRaw === "♯" ? "#" : accRaw === "♭" ? "b" : accRaw;

  let rootPc = NOTE_PC[rootLetter];
  if (acc === "#") rootPc = (rootPc + 1) % 12;
  if (acc === "b") rootPc = (rootPc + 11) % 12;

  let qualityKey = EXACT_ALIAS[rest];
  if (!qualityKey) qualityKey = FALLBACK_ALIAS[rest.toLowerCase()];
  if (!qualityKey) {
    // 最終手段のヒューリスティック
    if (/^m/.test(rest) && !/^maj/i.test(rest)) qualityKey = rest.includes("7") ? "min7" : "min";
    else if (rest.includes("7")) qualityKey = "dom7";
    else qualityKey = "maj";
  }

  return {
    label: rootLetter + acc + rest,
    rootPc,
    qualityKey,
    intervals: QUALITIES[qualityKey],
    rootStringOverride,
  };
}

function parseProgression(text) {
  const raw = text.trim();
  if (!raw) return [];
  let tokens = raw.includes("|") ? raw.split("|") : raw.split(/[\s,]+/);
  tokens = tokens.map((t) => t.trim()).filter((t) => t.length > 0);
  const chords = [];
  const bad = [];
  for (const t of tokens) {
    const c = parseChord(t);
    if (c) chords.push(c);
    else bad.push(t);
  }
  return { chords, bad };
}

// ---------- フレットボード / ダイアグラム ----------

// string index 0 = 6弦(低いE) ... 5 = 1弦(高いe)
const STRINGS = [
  { openPc: 4, openFreq: 82.407 },
  { openPc: 9, openFreq: 110.0 },
  { openPc: 2, openFreq: 146.832 },
  { openPc: 7, openFreq: 195.998 },
  { openPc: 11, openFreq: 246.942 },
  { openPc: 4, openFreq: 329.628 },
];
const WINDOW_SIZE = 5;

function computeVoicing(chord, rootStringIndex) {
  const anchorFret = ((chord.rootPc - STRINGS[rootStringIndex].openPc) % 12 + 12) % 12;
  const toneSet = chord.intervals.map(([semi, label]) => ({
    pc: (chord.rootPc + semi) % 12,
    label,
  }));
  const voicing = STRINGS.map((str) => {
    for (let f = anchorFret; f < anchorFret + WINDOW_SIZE; f++) {
      const pc = (str.openPc + f) % 12;
      const tone = toneSet.find((t) => t.pc === pc);
      if (tone) {
        return { fret: f, label: tone.label, freq: str.openFreq * Math.pow(2, f / 12) };
      }
    }
    return { fret: null, label: null, freq: null };
  });
  return { anchorFret, voicing };
}

function colorForLabel(label) {
  if (!label) return "#999";
  if (label === "R") return "#ff5a5f";
  const bare = label.replace("♭", "").replace("♯", "");
  if (bare === "3") return "#3b82f6";
  if (bare === "5") return "#22c55e";
  if (label.includes("7")) return "#a855f7";
  return "#f59e0b";
}

function renderDiagram(svgEl, voicingResult) {
  const { anchorFret, voicing } = voicingResult;
  const svgW = 220, svgH = 260;
  const marginX = 42, marginY = 36;
  const stringGap = (svgW - marginX * 2 - 10) / (STRINGS.length - 1);
  const fretGap = (svgH - marginY * 2 - 20) / WINDOW_SIZE;

  let parts = [];
  // フレット番号ラベル
  if (anchorFret > 0) {
    parts.push(`<text x="8" y="${marginY + fretGap * 0.6}" font-size="12" fill="#555">${anchorFret}fr</text>`);
  }
  // 弦（縦線）
  for (let i = 0; i < STRINGS.length; i++) {
    const x = marginX + i * stringGap;
    parts.push(`<line x1="${x}" y1="${marginY}" x2="${x}" y2="${marginY + fretGap * WINDOW_SIZE}" stroke="#222" stroke-width="1.5"/>`);
  }
  // フレット（横線）
  for (let j = 0; j <= WINDOW_SIZE; j++) {
    const y = marginY + j * fretGap;
    const isNut = anchorFret === 0 && j === 0;
    parts.push(`<line x1="${marginX}" y1="${y}" x2="${svgW - marginX}" y2="${y}" stroke="#222" stroke-width="${isNut ? 4 : 1}"/>`);
  }
  // 各弦の音
  voicing.forEach((v, i) => {
    const x = marginX + i * stringGap;
    if (v.fret === null) {
      parts.push(`<text x="${x}" y="${marginY - 14}" font-size="13" text-anchor="middle" fill="#999">×</text>`);
      return;
    }
    const y = marginY + (v.fret - anchorFret + 0.5) * fretGap;
    const color = colorForLabel(v.label);
    parts.push(`<circle cx="${x}" cy="${y}" r="12" fill="${color}"/>`);
    parts.push(`<text x="${x}" y="${y + 4}" font-size="10" text-anchor="middle" fill="#fff" font-weight="700">${v.label}</text>`);
  });

  svgEl.innerHTML = parts.join("\n");
}

// ---------- オーディオ ----------

class AudioEngine {
  constructor() {
    this.ctx = null;
  }
  ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }
  playClick(time, accent) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.18, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.04);
  }
  playChord(voicing, time, duration) {
    const ctx = this.ctx;
    voicing.forEach((v) => {
      if (v.fret === null) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = v.freq;
      const sustainEnd = time + Math.max(0.05, duration - 0.15);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.1, time + 0.03);
      gain.gain.setValueAtTime(0.1, sustainEnd);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration - 0.02);
      osc.connect(gain).connect(ctx.destination);
      osc.start(time);
      osc.stop(time + duration);
    });
  }
  // ピアノ風：倍音を重ねた減衰音（アタックは速く、高次倍音ほど早く減衰させる）
  playMelody(freq, time, duration) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.4;
    out.connect(ctx.destination);
    const partials = [
      [1, 1.0], [2, 0.5], [3, 0.28], [4, 0.14], [5, 0.09], [6, 0.05],
    ];
    partials.forEach(([mult, amp], i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      const decay = Math.max(0.12, duration - i * 0.03);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(amp, time + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
      osc.connect(gain).connect(out);
      osc.start(time);
      osc.stop(time + decay + 0.02);
    });
  }
}

// ---------- アプリ本体 / スケジューラ ----------

const engine = new AudioEngine();

const progressionInput = document.getElementById("progressionInput");
const bpmInput = document.getElementById("bpmInput");
const beatsInput = document.getElementById("beatsInput");
const positionSelect = document.getElementById("positionSelect");
const melodyOrderInput = document.getElementById("melodyOrderInput");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const parseWarning = document.getElementById("parseWarning");
const countdownEl = document.getElementById("countdown");
const chordNameEl = document.getElementById("chordName");
const positionInfoEl = document.getElementById("positionInfo");
const melodyInfoEl = document.getElementById("melodyInfo");
const barInfoEl = document.getElementById("barInfo");
const beatDotsEl = document.getElementById("beatDots");
const diagramEl = document.getElementById("diagram");

let state = null; // 再生中の状態をまとめて保持
let timerId = null;
let rafId = null;
let lastDisplayedChord = null;

const STRING_LABELS = ["6弦ルート", "5弦ルート", "4弦ルート"];

function getRootStringIndex() {
  return parseInt(positionSelect.value, 10);
}

// コードに @6/@5/@4 の個別指定があればそれを優先し、なければ共通のデフォルトを使う
function effectiveRootStringIndex(chord) {
  return chord.rootStringOverride != null ? chord.rootStringOverride : getRootStringIndex();
}

function buildBeatDots(count) {
  beatDotsEl.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const d = document.createElement("div");
    d.className = "beatDot" + (i === 0 ? " down" : "");
    beatDotsEl.appendChild(d);
  }
}

function flashBeatDot(index) {
  const dots = beatDotsEl.children;
  for (let i = 0; i < dots.length; i++) {
    dots[i].classList.toggle("active", i === index);
  }
}

function scheduler() {
  const ctx = engine.ctx;
  while (state.nextNoteTime < ctx.currentTime + 0.12) {
    scheduleNote(state.nextNoteTime);
    state.nextNoteTime += state.secondsPerBeat;
  }
}

function scheduleNote(time) {
  if (state.phase === "countin") {
    const beatIdxInBar = state.beatsPerChord - state.countInRemaining;
    engine.playClick(time, beatIdxInBar === 0);
    state.events.push({ time, type: "countin", value: state.countInRemaining });
    state.countInRemaining--;
    if (state.countInRemaining <= 0) {
      state.phase = "playing";
      state.beatCounter = 0;
    }
    return;
  }
  const isDownbeat = state.beatCounter === 0;
  engine.playClick(time, isDownbeat);

  const chord = state.chords[state.chordIdx];
  const degree = state.melodyOrder[state.melodyIndex % state.melodyOrder.length];
  state.melodyIndex++;
  const melodyTone = findToneForDegree(chord, degree);
  if (melodyTone) {
    engine.playMelody(pcToFreq(melodyTone.pc, 5), time, state.secondsPerBeat * 0.85);
  }
  const melodyLabel = melodyTone ? melodyTone.label : null;

  if (isDownbeat) {
    const rootStringIndex = effectiveRootStringIndex(chord);
    const voicingResult = computeVoicing(chord, rootStringIndex);
    engine.playChord(voicingResult.voicing, time, state.secondsPerBeat * state.beatsPerChord * 0.95);
    state.events.push({ time, type: "chord", chordIdx: state.chordIdx, beat: state.beatCounter, voicingResult, rootStringIndex, melodyLabel });
  } else {
    state.events.push({ time, type: "beat", chordIdx: state.chordIdx, beat: state.beatCounter, melodyLabel });
  }
  state.beatCounter++;
  if (state.beatCounter >= state.beatsPerChord) {
    state.beatCounter = 0;
    state.chordIdx = (state.chordIdx + 1) % state.chords.length;
  }
}

function applyEvent(ev) {
  if (ev.type === "countin") {
    countdownEl.textContent = ev.value > 0 ? ev.value : "";
    chordNameEl.textContent = "準備...";
    barInfoEl.textContent = "";
    flashBeatDot(-1);
    return;
  }
  countdownEl.textContent = "";
  const chord = state.chords[ev.chordIdx];
  chordNameEl.textContent = chord.label;
  barInfoEl.textContent = `${ev.chordIdx + 1} / ${state.chords.length}`;
  flashBeatDot(ev.beat);
  melodyInfoEl.textContent = ev.melodyLabel ? `メロディ: ${ev.melodyLabel}` : "";
  if (ev.type === "chord") {
    lastDisplayedChord = chord;
    positionInfoEl.textContent = STRING_LABELS[ev.rootStringIndex] + (chord.rootStringOverride != null ? "（個別指定）" : "");
    renderDiagram(diagramEl, ev.voicingResult);
  }
}

function refreshStaticPreview() {
  if (state) return; // 再生中はスケジューラ側の表示を優先する
  const { chords } = parseProgression(progressionInput.value);
  if (!chords.length) return;
  lastDisplayedChord = chords[0];
  const rootStringIndex = effectiveRootStringIndex(chords[0]);
  chordNameEl.textContent = chords[0].label;
  barInfoEl.textContent = `1 / ${chords.length}`;
  positionInfoEl.textContent = STRING_LABELS[rootStringIndex] + (chords[0].rootStringOverride != null ? "（個別指定）" : "");
  renderDiagram(diagramEl, computeVoicing(chords[0], rootStringIndex));
}

function drawLoop() {
  if (!state) return;
  const now = engine.ctx.currentTime;
  while (state.events.length && state.events[0].time <= now) {
    applyEvent(state.events.shift());
  }
  rafId = requestAnimationFrame(drawLoop);
}

function startPlayback() {
  const ctx = engine.ensureCtx();
  const { chords, bad } = parseProgression(progressionInput.value);
  if (bad && bad.length) {
    parseWarning.textContent = `認識できなかったコード: ${bad.join(", ")}（無視して再生します）`;
  } else {
    parseWarning.textContent = "";
  }
  if (!chords.length) {
    parseWarning.textContent = "コード進行を入力してください。";
    return;
  }
  const bpm = Math.min(300, Math.max(40, parseInt(bpmInput.value, 10) || 120));
  const beatsPerChord = Math.min(8, Math.max(1, parseInt(beatsInput.value, 10) || 4));
  const melodyOrder = parseMelodyOrder(melodyOrderInput.value);

  buildBeatDots(beatsPerChord);

  state = {
    chords,
    bpm,
    beatsPerChord,
    secondsPerBeat: 60 / bpm,
    nextNoteTime: ctx.currentTime + 0.1,
    phase: "countin",
    countInRemaining: beatsPerChord,
    beatCounter: 0,
    chordIdx: 0,
    melodyOrder,
    melodyIndex: 0,
    events: [],
  };

  startBtn.disabled = true;
  stopBtn.disabled = false;
  progressionInput.disabled = true;
  bpmInput.disabled = true;
  beatsInput.disabled = true;
  melodyOrderInput.disabled = true;

  timerId = setInterval(scheduler, 25);
  rafId = requestAnimationFrame(drawLoop);
}

function stopPlayback() {
  if (timerId) clearInterval(timerId);
  if (rafId) cancelAnimationFrame(rafId);
  timerId = null;
  rafId = null;
  state = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  progressionInput.disabled = false;
  bpmInput.disabled = false;
  beatsInput.disabled = false;
  melodyOrderInput.disabled = false;
  countdownEl.textContent = "";
  melodyInfoEl.textContent = "";
  flashBeatDot(-1);
  refreshStaticPreview();
}

startBtn.addEventListener("click", startPlayback);
stopBtn.addEventListener("click", stopPlayback);
positionSelect.addEventListener("change", refreshStaticPreview);
progressionInput.addEventListener("input", refreshStaticPreview);

buildBeatDots(4);
refreshStaticPreview();
