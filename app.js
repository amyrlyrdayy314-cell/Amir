const $ = id => document.getElementById(id);

// Navigation
function openPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === page));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
}
document.querySelectorAll('nav button').forEach(button => button.onclick = () => openPage(button.dataset.page));
document.querySelectorAll('[data-open]').forEach(card => card.onclick = () => openPage(card.dataset.open));

// METRONOME
let bpm = 120, running = false, timer = null, beat = 0, audio;
function updateBpm() { $('bpm').textContent = bpm; $('tempoRange').value = bpm; }
function stopMetronome() {
  running = false; clearTimeout(timer); $('startMetronome').textContent = 'START';
  document.querySelectorAll('.beat-indicator i').forEach(x => x.classList.remove('active'));
}
function tick() {
  if (!running) return;
  if (!audio) audio = new AudioContext();
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.frequency.value = beat === 0 ? 1200 : 800;
  gain.gain.setValueAtTime(.15, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .06);
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.start(); oscillator.stop(audio.currentTime + .07);
  const beats = Number($('signature').value);
  document.querySelectorAll('.beat-indicator i').forEach((x, i) => x.classList.toggle('active', i === beat));
  beat = (beat + 1) % beats;
  timer = setTimeout(tick, 60000 / bpm);
}
$('plus').onclick = () => { bpm = Math.min(300, bpm + 1); updateBpm(); };
$('minus').onclick = () => { bpm = Math.max(20, bpm - 1); updateBpm(); };
$('tempoRange').oninput = e => { bpm = Number(e.target.value); updateBpm(); };
$('startMetronome').onclick = async () => {
  if (running) return stopMetronome();
  audio = audio || new AudioContext(); await audio.resume();
  running = true; beat = 0; $('startMetronome').textContent = 'STOP'; tick();
};
let taps = [];
$('tap').onclick = () => {
  const now = Date.now(); taps.push(now); if (taps.length > 5) taps.shift();
  if (taps.length >= 2) {
    const intervals = taps.slice(1).map((t, i) => t - taps[i]);
    bpm = Math.max(20, Math.min(300, Math.round(60000 / (intervals.reduce((a,b) => a+b,0) / intervals.length))));
    updateBpm();
  }
};

// TUNER
let tunerStream, tunerActive = false, tunerContext, analyser;
function autoCorrelate(buffer, sampleRate) {
  const size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < .01) return -1;
  let bestOffset = -1, bestCorrelation = 0;
  for (let offset = 50; offset < 2000; offset++) {
    let correlation = 0;
    for (let i = 0; i < size - offset; i++) correlation += buffer[i] * buffer[i + offset];
    correlation /= size - offset;
    if (correlation > bestCorrelation) { bestCorrelation = correlation; bestOffset = offset; }
  }
  return bestOffset > 0 ? sampleRate / bestOffset : -1;
}
function tunerLoop() {
  if (!tunerActive) return;
  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);
  const frequency = autoCorrelate(buffer, tunerContext.sampleRate);
  if (frequency > 20 && frequency < 1500) {
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const note = names[(midi + 1200) % 12];
    const target = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = 1200 * Math.log2(frequency / target);
    $('note').textContent = note;
    $('frequency').textContent = frequency.toFixed(2) + ' Hz';
    $('needle').style.transform = `translateX(${Math.max(-90, Math.min(90, cents * 3))}px)`;
    $('tunerStatus').textContent = Math.abs(cents) < 5 ? 'IN TUNE' : cents < 0 ? 'TOO LOW' : 'TOO HIGH';
  }
  requestAnimationFrame(tunerLoop);
}
$('tunerButton').onclick = async () => {
  if (tunerActive) {
    tunerActive = false;
    if (tunerStream) tunerStream.getTracks().forEach(t => t.stop());
    $('tunerButton').textContent = 'START TUNER'; $('tunerStatus').textContent = 'STOPPED';
    return;
  }
  try {
    tunerStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tunerContext = new AudioContext(); analyser = tunerContext.createAnalyser(); analyser.fftSize = 8192;
    const microphone = tunerContext.createMediaStreamSource(tunerStream); microphone.connect(analyser);
    tunerActive = true; $('tunerButton').textContent = 'STOP TUNER'; $('tunerStatus').textContent = 'LISTENING...';
    tunerLoop();
  } catch (error) { $('tunerStatus').textContent = 'MICROPHONE ACCESS REQUIRED'; }
};

// TAB EDITOR
let tab = Array.from({length:6}, () => []);
function renderTab() {
  $('tabLines').innerHTML = '';
  tab.forEach(notes => {
    const row = document.createElement('div'); row.className = 'tab-row';
    notes.forEach(note => { const span = document.createElement('span'); span.textContent = note; row.appendChild(span); });
    $('tabLines').appendChild(row);
  });
}
$('addNote').onclick = () => {
  const string = Number($('stringSelect').value), fret = Number($('fretInput').value);
  if (!Number.isInteger(fret) || fret < 0 || fret > 24) return;
  tab[string].push(fret); renderTab();
};
$('clearTab').onclick = () => {
  tab = Array.from({length:6}, () => []); renderTab(); $('conversionResult').textContent = 'Composition cleared.';
};
const openStrings = [64,59,55,50,45,40];
function tabToNotes() {
  const result = [];
  tab.forEach((notes, string) => notes.forEach(fret => {
    const midi = openStrings[string] + fret;
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    result.push(names[midi % 12] + (Math.floor(midi / 12)-1));
  }));
  $('conversionResult').textContent = result.length ? result.join(' — ') : 'No notes entered.';
}
$('convertTab').onclick = tabToNotes;
$('convertNotation').onclick = () => {
  $('conversionResult').textContent = 'Notation-to-tab conversion requires a note sequence with octave and rhythm information. This feature will be expanded in a later version.';
};

// SAVE
function getSaved() { return JSON.parse(localStorage.getItem('fretSongs') || '[]'); }
function renderSaved() {
  $('savedCompositions').innerHTML = '';
  getSaved().forEach(song => {
    const item = document.createElement('div'); item.className = 'card';
    const title = document.createElement('h2'); title.textContent = song.title;
    const detail = document.createElement('p'); detail.textContent = 'Saved composition';
    const button = document.createElement('button'); button.textContent = 'LOAD';
    button.onclick = () => { tab = song.tab; $('songTitle').value = song.title; renderTab(); };
    item.append(title, detail, button); $('savedCompositions').appendChild(item);
  });
}
$('saveComposition').onclick = () => {
  const songs = getSaved();
  songs.push({ title: $('songTitle').value.trim() || 'Untitled', tab });
  localStorage.setItem('fretSongs', JSON.stringify(songs)); renderSaved();
  $('conversionResult').textContent = 'Composition saved.';
};
renderTab(); renderSaved();
