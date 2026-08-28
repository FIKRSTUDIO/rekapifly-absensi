const CONFIG = window.APP_CONFIG || {};

const state = {
  token: null,
  sheetId: null,
  sheets: [],
  selectedSheet: null,
  selectedSheetGid: null,
  classSections: [],
  selectedClass: null,
  selectedDate: null,
  mode: 'single',
  ocrRecords: [],
  matchResult: [],
  file: null,
};

const $ = id => document.getElementById(id);
const screenLogin    = $('screenLogin');
const screenApp      = $('screenApp');
const btnLogin       = $('btnLogin');
const btnLogout      = $('btnLogout');
const userAvatar     = $('userAvatar');
const userName       = $('userName');
const sheetUrlInput  = $('sheetUrl');
const btnLoadSheet   = $('btnLoadSheet');
const sheetTabsWrap  = $('sheetTabsWrap');
const sheetTabsEl    = $('sheetTabs');
const tab1Label      = $('tab1Label');
const classSearch    = $('classSearch');
const classChipsEl   = $('classChips');
const classLabel     = $('classLabel');
const dateColumnsEl  = $('dateColumns');
const dropzone       = $('dropzone');
const fileInput      = $('fileInput');
const dropzoneEmpty  = $('dropzoneEmpty');
const previewWrap    = $('previewWrap');
const previewImg     = $('previewImg');
const fileNameEl     = $('fileName');
const clearFileBtn   = $('clearFile');
const confirmMeta    = $('confirmMeta');
const confirmBody    = $('confirmBody');
const unmatchedWrap  = $('unmatchedWrap');
const unmatchedList  = $('unmatchedList');
const sendStatus     = $('sendStatus');
const loadingOverlay = $('loadingOverlay');
const overlayMsg     = $('overlayMsg');

const btn1Next = $('btn1Next');
const btn2Back = $('btn2Back'); const btn2Next = $('btn2Next');
const btn3Back = $('btn3Back'); const btn3Next = $('btn3Next');
const btnAllDates = $('btnAllDates');
const btn4Back = $('btn4Back'); const btn4Next = $('btn4Next');
const btn5Back = $('btn5Back'); const btn5Send = $('btn5Send');

let tokenClient;

function initGSI() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (resp) => {
      if (resp.error) { alert('Login gagal: ' + resp.error); return; }
      state.token = resp.access_token;
      fetchUserInfo();
    }
  });
}

btnLogin.addEventListener('click', () => {
  if (!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.includes('GANTI')) {
    alert('GOOGLE_CLIENT_ID belum diisi di file app.js!'); return;
  }
  tokenClient.requestAccessToken();
});

btnLogout.addEventListener('click', () => {
  google.accounts.oauth2.revoke(state.token, () => {});
  state.token = null;
  screenApp.classList.remove('active');
  screenLogin.classList.add('active');
  resetAll();
});

async function fetchUserInfo() {
  try {
    const res = await gFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    userAvatar.src = res.picture || '';
    userName.textContent = res.given_name || res.name || 'Pengguna';
  } catch { userName.textContent = 'Pengguna'; }
  screenLogin.classList.remove('active');
  screenApp.classList.add('active');
  sheetUrlInput.value = localStorage.getItem('absensi_sheetUrl') || '';
}

async function gFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + state.token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error?.message) || 'Request gagal (' + res.status + ')');
  }
  return res.json();
}

function loading(on, msg = 'Memuat…') {
  overlayMsg.textContent = msg;
  loadingOverlay.classList.toggle('hidden', !on);
}

function showPanel(n) {
  [1,2,3,4,5].forEach(i => {
    $('panel' + i).classList.toggle('hidden', i !== n);
    const navItem = document.querySelector('[data-step="' + i + '"]');
    navItem.classList.toggle('active', i === n);
    if (i < n) navItem.classList.add('done');
    else if (i > n) navItem.classList.remove('done');
  });
}

function parseSheetId(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function normName(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function nameSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function findBestMatch(ocrName, pool) {
  const normOcr = normName(ocrName);
  let best = null, bestScore = 0;
  pool.forEach(row => {
    const normRow = normName(row.nama);
    let score;
    if (normRow === normOcr) score = 1;
    else if (normRow.includes(normOcr) || normOcr.includes(normRow)) score = 0.9;
    else score = nameSimilarity(normOcr, normRow);
    if (score > bestScore) { bestScore = score; best = row; }
  });
  return bestScore >= 0.72 ? best : null;
}

function isSkippedStatus(status) {
  const s = (status || '').trim().toLowerCase();
  return s === '' || s === 'hadir' || s === 'h';
}

function statusToCode(status) {
  const s = (status || '').trim().toLowerCase();
  const map = {
    sakit: 'S', s: 'S',
    izin: 'I', i: 'I',
    dispen: 'D', dispensasi: 'D', d: 'D',
    alpa: 'T', 'tanpa keterangan': 'T', tanpaketerangan: 'T', t: 'T', a: 'T'
  };
  if (map[s]) return map[s];
  return (status || '').trim().toUpperCase();
}

function resetAll() {
  Object.assign(state, {
    sheetId: null, sheets: [], selectedSheet: null, selectedSheetGid: null,
    classSections: [], selectedClass: null, selectedDate: null, mode: 'single',
    ocrRecords: [], matchResult: [], file: null
  });
  sheetTabsWrap.classList.add('hidden');
  sheetTabsEl.innerHTML = ''; classChipsEl.innerHTML = ''; dateColumnsEl.innerHTML = '';
  dropzoneEmpty.classList.remove('hidden'); previewWrap.classList.add('hidden');
  btn1Next.disabled = true; btn2Next.disabled = true;
  btn3Next.disabled = true; btn4Next.disabled = true;
  showPanel(1);
}

sheetUrlInput.addEventListener('input', () =>
  localStorage.setItem('absensi_sheetUrl', sheetUrlInput.value.trim())
);

btnLoadSheet.addEventListener('click', async () => {
  const url = sheetUrlInput.value.trim();
  const id = parseSheetId(url);
  if (!id) { alert('URL spreadsheet tidak valid.\nFormat: https://docs.google.com/spreadsheets/d/...'); return; }

  loading(true, 'Membaca daftar tab dari Sheets…');
  try {
    const data = await gFetch(
      'https://sheets.googleapis.com/v4/spreadsheets/' + id + '?fields=sheets.properties'
    );
    state.sheetId = id;
    state.sheets = data.sheets.map(s => ({ title: s.properties.title, sheetId: s.properties.sheetId }));
    renderSheetTabs();
    sheetTabsWrap.classList.remove('hidden');
  } catch (e) {
    alert('Gagal membaca spreadsheet: ' + e.message + '\nPastikan kamu punya akses ke spreadsheet ini.');
  } finally { loading(false); }
});

function renderSheetTabs() {
  sheetTabsEl.innerHTML = '';
  state.sheets.forEach(s => {
    const chip = document.createElement('button');
    chip.className = 'tab-chip';
    chip.textContent = s.title;
    chip.addEventListener('click', () => {
      document.querySelectorAll('#sheetTabs .tab-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      state.selectedSheet = s.title;
      state.selectedSheetGid = s.sheetId;
      btn1Next.disabled = false;
    });
    sheetTabsEl.appendChild(chip);
  });
}

const CLASS_MARKER_RE = /^[A-Za-z0-9]{1,6}-\d{1,3}$/;

const SKIP_TEXT_RE = /tangerang|wali\s*kelas|absensi\s*siswa|bulan\s*:|^ket$|^no$|^nis$/i;

btn1Next.addEventListener('click', async () => {
  loading(true, 'Membaca seluruh isi tab ' + state.selectedSheet + '…');
  try {
    const range = encodeURIComponent(state.selectedSheet + '!A1:AZ2000');
    const data = await gFetch(
      'https://sheets.googleapis.com/v4/spreadsheets/' + state.sheetId + '/values/' + range
    );
    const grid = data.values || [];

    const markers = [];
    grid.forEach((row, r) => {
      row.forEach((cell) => {
        const v = (cell || '').toString().trim();
        if (CLASS_MARKER_RE.test(v)) markers.push({ name: v, row: r });
      });
    });

    if (markers.length === 0) {
      alert('Tidak ditemukan penanda kelas (contoh: "XI-1") di tab ini.\nPastikan ada baris berisi kode kelas seperti itu.');
      loading(false); return;
    }

    const sections = [];
    markers.forEach((m, idx) => {
      const blockStart = m.row;
      const blockEnd = (idx + 1 < markers.length) ? markers[idx + 1].row - 1 : grid.length - 1;

      let headerRowIdx = null;
      for (let r = blockStart + 1; r <= blockEnd; r++) {
        const row = grid[r] || [];
        if (row.some(cell => normName(cell).includes('nama'))) { headerRowIdx = r; break; }
      }
      if (headerRowIdx === null) return;

      const headerRow = grid[headerRowIdx] || [];
      let namaColIdx = headerRow.findIndex(cell => normName(cell).includes('nama'));
      if (namaColIdx < 0) namaColIdx = 2;

      const dateColMap = {};
      let lastHeaderRow = headerRowIdx;
      for (let r = headerRowIdx; r <= Math.min(headerRowIdx + 3, blockEnd); r++) {
        const row = grid[r] || [];
        let foundAny = false;
        row.forEach((cell, c) => {
          if (c <= namaColIdx) return;
          const raw = (cell || '').toString().trim();
          const dayMatch = raw.match(/^0*([1-9]|[12]\d|3[01])\.?$/);
          if (dayMatch) {
            dateColMap[parseInt(dayMatch[1], 10)] = c;
            foundAny = true;
          }
        });
        if (foundAny) lastHeaderRow = r;
      }

      const rows = [];
      for (let r = lastHeaderRow + 1; r <= blockEnd; r++) {
        const row = grid[r] || [];
        const nama = (row[namaColIdx] || '').toString().trim();
        if (!nama) continue;
        if (SKIP_TEXT_RE.test(nama)) continue;
        if (CLASS_MARKER_RE.test(nama)) continue;
        rows.push({ rowIndex: r + 1, nama });
      }

      sections.push({
        name: m.name,
        headerRow: headerRowIdx + 1,
        namaColIdx,
        dateColMap,
        rows,
        blockEndRow: blockEnd + 1
      });
    });

    if (sections.length === 0) {
      alert('Penanda kelas ditemukan, tapi tidak ada header "Nama" yang cocok di bawahnya.\nCek format tabel di sheet.');
      loading(false); return;
    }

    state.classSections = sections;
    tab1Label.textContent = state.selectedSheet;
    renderClassChips(sections);
    showPanel(2);
  } catch (e) {
    alert('Gagal membaca isi tab: ' + e.message);
  } finally { loading(false); }
});

function renderClassChips(sections) {
  classChipsEl.innerHTML = '';
  sections.forEach(sec => {
    const chip = document.createElement('button');
    chip.className = 'tab-chip';
    chip.textContent = sec.name + ' (' + sec.rows.length + ' siswa)';
    chip.dataset.name = sec.name.toLowerCase();
    chip.addEventListener('click', () => {
      document.querySelectorAll('#classChips .tab-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      state.selectedClass = sec;
      btn2Next.disabled = false;
    });
    classChipsEl.appendChild(chip);
  });
}

classSearch.addEventListener('input', () => {
  const q = classSearch.value.toLowerCase().trim();
  document.querySelectorAll('#classChips .tab-chip').forEach(chip => {
    chip.classList.toggle('dimmed', q && !chip.dataset.name.includes(q));
  });
});

btn2Back.addEventListener('click', () => showPanel(1));
btn2Next.addEventListener('click', () => {
  classLabel.textContent = state.selectedClass.name;
  renderDateColumns();
  showPanel(3);
});

function renderDateColumns() {
  dateColumnsEl.innerHTML = '';
  state.mode = 'single';
  const days = Object.keys(state.selectedClass.dateColMap).map(Number).sort((a, b) => a - b);

  if (days.length === 0) {
    dateColumnsEl.innerHTML = '<p style="color:var(--ink-3);font-size:13px">Tidak ada kolom tanggal ditemukan di header blok kelas ini.</p>';
    return;
  }

  days.forEach(day => {
    const chip = document.createElement('button');
    chip.className = 'tab-chip';
    chip.textContent = 'Tanggal ' + day;
    chip.addEventListener('click', () => {
      document.querySelectorAll('#dateColumns .tab-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      state.mode = 'single';
      state.selectedDate = { day, colIndex: state.selectedClass.dateColMap[day] };
      btn3Next.disabled = false;
    });
    dateColumnsEl.appendChild(chip);
  });
}

btnAllDates.addEventListener('click', () => {
  document.querySelectorAll('#dateColumns .tab-chip').forEach(c => c.classList.remove('selected'));
  state.mode = 'multi';
  state.selectedDate = null;
  showPanel(4);
});

btn3Back.addEventListener('click', () => showPanel(2));
btn3Next.addEventListener('click', () => showPanel(4));

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
clearFileBtn.addEventListener('click', e => {
  e.stopPropagation();
  state.file = null; fileInput.value = '';
  previewWrap.classList.add('hidden'); dropzoneEmpty.classList.remove('hidden');
  btn4Next.disabled = true;
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) { alert('File harus berupa gambar.'); return; }
  state.file = file;
  const reader = new FileReader();
  reader.onload = e => {
    previewImg.src = e.target.result;
    fileNameEl.textContent = file.name + ' — ' + (file.size / 1024).toFixed(0) + ' KB';
    dropzoneEmpty.classList.add('hidden'); previewWrap.classList.remove('hidden');
    btn4Next.disabled = false;
  };
  reader.readAsDataURL(file);
}

btn4Back.addEventListener('click', () => showPanel(3));
btn4Next.addEventListener('click', async () => {
  if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY.includes('GANTI')) {
    alert('Kunci pembacaan foto belum diisi di file app.js!'); return;
  }
  loading(true, 'Mengompres foto…');
  try {
    const { base64, mimeType } = await compressImage(state.file);
    loading(true, state.mode === 'multi'
      ? 'Membaca semua tanggal…'
      : 'Membaca foto…');
    state.ocrRecords = await extractAttendance(base64, mimeType);
    if (!state.ocrRecords.length) {
      alert('Tidak ditemukan data absensi di foto. Coba foto yang lebih jelas.');
      loading(false); return;
    }
    buildMatchResult();
    renderConfirm();
    showPanel(5);
  } catch (e) {
    alert('Gagal membaca foto: ' + e.message);
  } finally { loading(false); }
});

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function compressImage(file, maxDimension = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) { height = Math.round(height * (maxDimension / width)); width = maxDimension; }
        else { width = Math.round(width * (maxDimension / height)); height = maxDimension; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Gagal mengompres gambar')); return; }
        const r2 = new FileReader();
        r2.onload = () => resolve({ base64: r2.result.split(',')[1], mimeType: 'image/jpeg', blob });
        r2.onerror = reject;
        r2.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractAttendance(base64Image, mimeType) {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    CONFIG.GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(CONFIG.GEMINI_API_KEY);

  const isMulti = state.mode === 'multi';

  const prompt = isMulti
    ? ('Kamu membaca foto kertas absensi bulanan siswa. Ada banyak kolom tanggal (1-31) yang masing-masing ' +
       'berisi tanda kehadiran per siswa: centang/ceklis/tally = Hadir, huruf S/tulisan sakit = Sakit, ' +
       'huruf I/tulisan izin = Izin, huruf D/tulisan dispen = Dispen, huruf T atau A = Alpa (tanpa keterangan). ' +
       'Untuk SETIAP kolom tanggal yang SUDAH TERISI tanda pada SETIAP baris siswa, buat satu entri objek JSON ' +
       'berisi: "nama" (nama siswa persis seperti di foto), "tanggal" (angka hari sesuai header kolom), ' +
       'dan "status" (salah satu: Hadir/Sakit/Izin/Dispen/Alpa). ' +
       'LEWATI kolom tanggal yang benar-benar kosong tanpa tanda apapun (biasanya tanggal yang belum berjalan) — ' +
       'jangan buat entri untuk itu. Kembalikan HANYA array JSON, tanpa penjelasan tambahan.')
    : ('Kamu membaca foto kertas absensi kehadiran siswa. Fokus HANYA pada kolom tanggal ' +
       'nomor ' + state.selectedDate.day + ' (kolom bertuliskan angka "' + state.selectedDate.day + '" di baris header tanggal). ' +
       'Setiap baris berisi nama siswa dan tanda kehadiran di kolom tersebut: ' +
       'centang/ceklis/tally = hadir, huruf S/tulisan sakit = Sakit, huruf I/tulisan izin = Izin, ' +
       'huruf D/tulisan dispen = Dispen, huruf T atau A/kosong tanpa tanda = Alpa (tanpa keterangan). ' +
       'Ekstrak setiap baris menjadi objek JSON dengan field: ' +
       '"nama" (nama siswa, wajib, tulis persis seperti di foto) dan ' +
       '"status": WAJIB isi salah satu dari 5 kategori (jangan biarkan kosong): ' +
       '"Hadir", "Sakit", "Izin", "Dispen", atau "Alpa". ' +
       'Kembalikan HANYA array JSON dari semua baris yang terbaca, tanpa penjelasan tambahan.');

  const itemSchema = isMulti
    ? {
        type: 'OBJECT',
        properties: {
          nama: { type: 'STRING' },
          tanggal: { type: 'INTEGER' },
          status: { type: 'STRING' }
        },
        required: ['nama', 'tanggal', 'status']
      }
    : {
        type: 'OBJECT',
        properties: { nama: { type: 'STRING' }, status: { type: 'STRING' } },
        required: ['nama']
      };

  const body = {
    contents: [{ parts: [
      { text: prompt },
      { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Image } }
    ]}],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: itemSchema
      }
    }
  };

  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Pembacaan foto gagal (' + res.status + '): ' + txt.slice(0, 300));
  }
  const data = await res.json();
  if (data.promptFeedback?.blockReason) throw new Error('Pembacaan foto diblokir: ' + data.promptFeedback.blockReason);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Tidak ada hasil pembacaan foto.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Gagal parse hasil Gemini. Coba foto yang lebih jelas.'); }
  if (!Array.isArray(parsed)) parsed = [parsed];
  return parsed.filter(r => r?.nama);
}

function buildMatchResult() {
  const pool = state.selectedClass.rows;
  state.matchResult = state.ocrRecords.map(ocr => {
    const found = findBestMatch(ocr.nama, pool);
    const entry = {
      ocrNama: ocr.nama,
      status: ocr.status || '',
      rowIndex: found ? found.rowIndex : null,
      sheetNama: found ? found.nama : null,
    };
    if (state.mode === 'multi') entry.tanggal = ocr.tanggal;
    return entry;
  });
}

function renderConfirm() {
  const isMulti = state.mode === 'multi';

  confirmMeta.innerHTML = isMulti
    ? ('<strong>' + state.selectedClass.name + '</strong> — Semua tanggal — ' +
       state.ocrRecords.length + ' entri terbaca dari foto')
    : ('<strong>' + state.selectedClass.name + '</strong> — Tanggal ' +
       '<strong>' + state.selectedDate.day + '</strong> — ' +
       state.ocrRecords.length + ' siswa terbaca dari foto');

  const theadRow = document.querySelector('#confirmThead tr');
  theadRow.innerHTML = isMulti
    ? '<th>Tanggal</th><th>Nama di Sheet</th><th>Status</th><th>Cocok?</th>'
    : '<th>Nama di Sheet</th><th>Status</th><th>Cocok?</th>';

  confirmBody.innerHTML = '';
  sendStatus.classList.add('hidden');
  btn5Send.disabled = false;
  btn5Send.textContent = 'Kirim ke Sheets';

  const unmatchedSet = new Set();

  state.matchResult.forEach((m, i) => {
    const tr = document.createElement('tr');

    if (isMulti) {
      const tdDate = document.createElement('td');
      tdDate.textContent = m.tanggal;
      tr.appendChild(tdDate);
    }

    const tdSheet = document.createElement('td');
    if (m.sheetNama) {
      tdSheet.textContent = m.sheetNama;
    } else {
      tdSheet.innerHTML = '<span style="color:var(--ink-3);font-style:italic">' + m.ocrNama + '</span>';
      unmatchedSet.add(m.ocrNama);
    }

    const tdStatus = document.createElement('td');
    const input = document.createElement('input');
    input.className = 'status-input';
    input.value = m.status;

    const writeHint = document.createElement('div');
    writeHint.className = 'write-hint';

    function updateHint() {
      const skip = isSkippedStatus(input.value);
      writeHint.textContent = skip ? 'Dilewati (dianggap hadir)' : 'Akan ditulis: "' + statusToCode(input.value) + '"';
      writeHint.classList.toggle('skip', skip);
    }
    updateHint();

    input.addEventListener('input', e => {
      state.matchResult[i].status = e.target.value;
      updateHint();
    });
    tdStatus.appendChild(input);
    tdStatus.appendChild(writeHint);

    const tdBadge = document.createElement('td');
    tdBadge.innerHTML = m.sheetNama
      ? '<span class="badge badge-ok">✓ Cocok</span>'
      : '<span class="badge badge-new">+ Baru</span>';

    tr.appendChild(tdSheet); tr.appendChild(tdStatus); tr.appendChild(tdBadge);
    confirmBody.appendChild(tr);
  });

  const unmatched = Array.from(unmatchedSet);
  if (unmatched.length > 0) {
    unmatchedList.innerHTML = unmatched.map(n => '<span class="unmatched-chip">' + n + '</span>').join('');
    unmatchedWrap.classList.remove('hidden');
  } else {
    unmatchedWrap.classList.add('hidden');
  }
}

btn5Back.addEventListener('click', () => showPanel(4));

btn5Send.addEventListener('click', async () => {
  loading(true, 'Menulis data ke Google Sheets…');
  sendStatus.classList.add('hidden');

  try {
    if (state.mode === 'multi') {
      await sendMultiDate();
    } else {
      await sendSingleDate();
    }
    btn5Send.disabled = true;
    btn5Send.textContent = 'Sudah terkirim ✓';
  } catch (e) {
    sendStatus.textContent = '✗ Gagal: ' + e.message;
    sendStatus.className = 'send-status err';
    sendStatus.classList.remove('hidden');
  } finally { loading(false); }
});

async function sendSingleDate() {
  const colLetter = colIndexToLetter(state.selectedDate.colIndex);
  const updates = [];
  const newNames = [];

  state.matchResult.forEach(m => {
    if (isSkippedStatus(m.status)) return;
    const code = statusToCode(m.status);
    if (m.rowIndex) {
      updates.push({ range: state.selectedSheet + '!' + colLetter + m.rowIndex, values: [[code]] });
    } else {
      newNames.push({ nama: m.ocrNama, code });
    }
  });

  if (updates.length > 0) {
    await gFetch(
      'https://sheets.googleapis.com/v4/spreadsheets/' + state.sheetId + '/values:batchUpdate',
      { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }) }
    );
  }
  if (newNames.length > 0) {
    await insertNewRows(newNames.map(n => ({ nama: n.nama, entries: [{ colIndex: state.selectedDate.colIndex, code: n.code }] })));
  }

  const skippedCount = state.matchResult.filter(m => isSkippedStatus(m.status)).length;
  sendStatus.textContent = '✓ Berhasil mengisi ' + updates.length + ' baris' +
    (newNames.length ? ' dan menyisipkan ' + newNames.length + ' baris baru di kelas ' + state.selectedClass.name : '') +
    (skippedCount ? '. ' + skippedCount + ' siswa dilewati karena dianggap hadir.' : '.');
  sendStatus.className = 'send-status ok';
  sendStatus.classList.remove('hidden');
}

async function sendMultiDate() {
  const updates = [];
  const newNameMap = new Map();
  let skippedCount = 0;

  state.matchResult.forEach(m => {
    if (isSkippedStatus(m.status)) { skippedCount++; return; }
    const colIndex = state.selectedClass.dateColMap[m.tanggal];
    if (colIndex === undefined) return;
    const code = statusToCode(m.status);
    if (m.rowIndex) {
      updates.push({ range: state.selectedSheet + '!' + colIndexToLetter(colIndex) + m.rowIndex, values: [[code]] });
    } else {
      if (!newNameMap.has(m.ocrNama)) newNameMap.set(m.ocrNama, []);
      newNameMap.get(m.ocrNama).push({ colIndex, code });
    }
  });

  if (updates.length > 0) {
    await gFetch(
      'https://sheets.googleapis.com/v4/spreadsheets/' + state.sheetId + '/values:batchUpdate',
      { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }) }
    );
  }

  const newNames = Array.from(newNameMap.entries()).map(([nama, entries]) => ({ nama, entries }));
  if (newNames.length > 0) {
    await insertNewRows(newNames);
  }

  sendStatus.textContent = '✓ Berhasil mengisi ' + updates.length + ' sel' +
    (newNames.length ? ' dan menyisipkan ' + newNames.length + ' siswa baru di kelas ' + state.selectedClass.name : '') +
    (skippedCount ? '. ' + skippedCount + ' entri dilewati karena dianggap hadir.' : '.');
  sendStatus.className = 'send-status ok';
  sendStatus.classList.remove('hidden');
}

async function insertNewRows(newNames) {
  const sec = state.selectedClass;
  const insertAt = sec.rows.length
    ? sec.rows[sec.rows.length - 1].rowIndex + 1
    : sec.headerRow + 1;

  await gFetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + state.sheetId + ':batchUpdate',
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          insertDimension: {
            range: {
              sheetId: state.selectedSheetGid,
              dimension: 'ROWS',
              startIndex: insertAt - 1,
              endIndex: insertAt - 1 + newNames.length
            },
            inheritFromBefore: insertAt > sec.headerRow + 1
          }
        }]
      })
    }
  );

  const namaLetter = colIndexToLetter(sec.namaColIdx);
  const updates = [];
  newNames.forEach((r, i) => {
    const rowIdx = insertAt + i;
    updates.push({ range: state.selectedSheet + '!' + namaLetter + rowIdx, values: [[r.nama]] });
    r.entries.forEach(entry => {
      updates.push({ range: state.selectedSheet + '!' + colIndexToLetter(entry.colIndex) + rowIdx, values: [[entry.code]] });
    });
  });

  await gFetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + state.sheetId + '/values:batchUpdate',
    { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }) }
  );
}

function colIndexToLetter(idx) {
  let letter = ''; let n = idx;
  while (n >= 0) { letter = String.fromCharCode((n % 26) + 65) + letter; n = Math.floor(n / 26) - 1; }
  return letter;
}

(function loadGIS() {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true; s.defer = true;
  s.onload = initGSI;
  document.head.appendChild(s);
})();