/* ============================================================
   PORTAL SMS — CSFS  |  app.js
   Formularios públicos ASR y RSO — sin autenticación de usuario
   ============================================================ */

const API_BASE  = 'https://thriving-kindness-production-443e.up.railway.app/api';
const CHAT_BASE = 'https://welcoming-trust-production-b45b.up.railway.app';
const ORG_ID    = '0cdba0e3-9586-49f7-8bad-046c6a7d11f0';

// Los endpoints del portal en Atalaya (crear reporte, subir adjuntos y consultar
// seguimiento) son PÚBLICOS: no requieren autenticación. Por eso el portal NO
// almacena ninguna credencial — sería un riesgo de seguridad exponerla en el
// código del cliente (que es visible para cualquiera).
/* ── ESTADO ──────────────────────────────────────────────── */
let selectedPhotos = { asr: [], oma: [] };
let chatState = { open: false, initialized: false };
let chatHistory = [];
let chatFotoPendiente = null;    // foto seleccionada, lista para enviar en el próximo mensaje
let chatFotoParaAdjuntar = null; // última foto ya enviada a AVI, se sube como adjunto cuando se cree el reporte
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

/* ── TEMA (dark / light) ─────────────────────────────────── */
(function initTheme() {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root   = document.documentElement;
  let theme = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);

  function syncIcon() {
    if (!toggle) return;
    toggle.innerHTML = theme === 'dark'
      ? '<i class="ph-bold ph-sun"></i>'
      : '<i class="ph-bold ph-moon"></i>';
  }
  syncIcon();

  if (toggle) {
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      syncIcon();
    });
  }
})();

/* ── NAVEGACIÓN ──────────────────────────────────────────── */
function showSection(id) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function showHome() {
  showSection('home');
}

function copiarId(elementId) {
  const id = document.getElementById(elementId)?.textContent?.trim();
  if (!id || id === '—') return;
  navigator.clipboard.writeText(id).then(() => {
    const prefix = elementId.startsWith('asr') ? 'asr' : 'rso';
    const icon = document.getElementById(`${prefix}-copy-icon`);
    if (icon) {
      icon.className = 'ph-bold ph-check';
      setTimeout(() => { icon.className = 'ph-bold ph-copy'; }, 2000);
    }
  });
}

function verSeguimiento(elementId) {
  const id = document.getElementById(elementId)?.textContent?.trim();
  showTracking();
  if (id && id !== '—') {
    setTimeout(() => {
      const input = document.getElementById('track-id-input');
      if (input) { input.value = id; buscarReporte(); }
    }, 300);
  }
}

function showTracking() {
  showSection('report-tracking');
  document.getElementById('track-id-input').value = '';
  document.getElementById('track-result').innerHTML = '';
  setTimeout(() => document.getElementById('track-id-input').focus(), 200);
}

/* ── SEGURIDAD: escape de HTML ───────────────────────────── */
// Defensa en profundidad: escapa cualquier valor antes de interpolarlo en
// innerHTML, incluso si en teoría ya viene saneado desde el backend.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function buscarReporte() {
  const idInput  = document.getElementById('track-id-input');
  const resultEl = document.getElementById('track-result');
  const id = idInput.value.trim();

  if (!id) {
    resultEl.innerHTML = '<p class="track-error"><i class="ph-bold ph-warning-circle"></i> Por favor ingresa el número de reporte.</p>';
    return;
  }

  resultEl.innerHTML = '<p class="track-loading"><i class="ph-bold ph-circle-notch"></i> Buscando...</p>';

  const ESTADO_LABEL = {
    NUEVO:         'Nuevo — pendiente de revisión',
    EN_ANALISIS:   'En análisis por el equipo SMS',
    EVALUADO:      'Evaluado',
    EN_MITIGACION: 'En proceso de mitigación',
    CERRADO:       'Cerrado',
  };
  const ESTADO_CLASS = {
    NUEVO:         'track-estado-nuevo',
    EN_ANALISIS:   'track-estado-analisis',
    EVALUADO:      'track-estado-evaluado',
    EN_MITIGACION: 'track-estado-mitigacion',
    CERRADO:       'track-estado-cerrado',
  };

  try {
    const res = await fetch(`${API_BASE}/reportes/${encodeURIComponent(id)}/seguimiento`);

    if (res.status === 404) {
      resultEl.innerHTML = `<div class="track-not-found">
        <i class="ph-bold ph-warning-circle"></i>
        <p>No encontramos ningún reporte con ese número. Verifica que lo hayas copiado correctamente.</p>
      </div>`;
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const d = await res.json();
    const fechaEvento = d.fechaEvento ? new Date(d.fechaEvento).toLocaleDateString('es-CO') : 'No especificada';
    const creadoEn   = d.creadoEn    ? new Date(d.creadoEn).toLocaleDateString('es-CO')    : '';

    resultEl.innerHTML = `
      <div class="track-result-card">
        <div class="track-result-header">
          <div class="track-result-tipo">${escapeHtml(d.tipo)}</div>
          <div class="track-estado-badge ${ESTADO_CLASS[d.estado] ?? ''}">${escapeHtml(ESTADO_LABEL[d.estado] ?? d.estado)}</div>
        </div>
        <div class="track-result-grid">
          <div class="track-field">
            <span class="track-field-label">Número de reporte</span>
            <span class="track-field-value track-id-mono">${escapeHtml(d.id)}</span>
          </div>
          ${d.area ? `<div class="track-field">
            <span class="track-field-label">Área</span>
            <span class="track-field-value">${escapeHtml(d.area)}</span>
          </div>` : ''}
          <div class="track-field">
            <span class="track-field-label">Fecha del evento</span>
            <span class="track-field-value">${fechaEvento}</span>
          </div>
          <div class="track-field">
            <span class="track-field-label">Fecha de registro</span>
            <span class="track-field-value">${creadoEn}</span>
          </div>
          ${d.aeropuertoIcao ? `<div class="track-field">
            <span class="track-field-label">Aeropuerto</span>
            <span class="track-field-value">${escapeHtml(d.aeropuertoIcao)}</span>
          </div>` : ''}
        </div>
        <p class="track-result-note">Para consultas sobre tu reporte, contacta al equipo de seguridad: <a href="mailto:sms@csfs.aero">sms@csfs.aero</a></p>
      </div>`;
  } catch (e) {
    resultEl.innerHTML = `<div class="track-error">
      <i class="ph-bold ph-warning"></i>
      No pudimos consultar tu reporte. Verifica tu conexión e intenta de nuevo.
    </div>`;
  }
}

function showForm(type) {
  resetForm(type);
  showSection(`form-${type}`);
}

function resetForm(type) {
  const isASR       = type === 'handling';
  const formId      = isASR ? 'asr-form'      : 'rso-form';
  const successId   = isASR ? 'asr-success'   : 'rso-success';
  const submitBarId = isASR ? 'asr-submitbar' : 'rso-submitbar';
  const photoType   = isASR ? 'asr'           : 'oma';
  const fechaId     = isASR ? 'asr-fecha'     : 'rso-fecha';

  const form = document.getElementById(formId);
  if (form) form.reset();

  selectedPhotos[photoType] = [];
  const grid = document.getElementById(`${photoType}-preview-grid`);
  if (grid) grid.innerHTML = '';

  const success = document.getElementById(successId);
  if (success) success.classList.remove('show');
  const bar = document.getElementById(submitBarId);
  if (bar) bar.style.display = '';
  const btn = form ? form.querySelector('.btn-submit') : null;
  if (btn) { btn.classList.remove('loading'); btn.disabled = false; }

  const today = new Date().toISOString().split('T')[0];
  const fechaEl = document.getElementById(fechaId);
  if (fechaEl) fechaEl.value = today;
}

/* ── CARGA INICIAL ───────────────────────────────────────── */
window.addEventListener('load', () => {
  try {
    new QRCode(document.getElementById('qr-container'), {
      text: window.location.href,
      width: 180,
      height: 180,
      colorDark: '#1e40af',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
  } catch (e) {
    console.warn('QR code error:', e);
  }

  showHome();
  showChatWidget();
});

/* ── QR DOWNLOAD ─────────────────────────────────────────── */
function downloadQR() {
  const canvas = document.querySelector('#qr-container canvas');
  if (!canvas) {
    alert('El QR aún se está generando. Por favor espera un momento.');
    return;
  }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'QR-SMS-CSFS-Reportes-Seguridad.png';
  a.click();
}

/* ── UTILIDADES DE FORMULARIO ────────────────────────────── */
function collectForm(formId) {
  const data = {};
  new FormData(document.getElementById(formId)).forEach((value, key) => {
    data[key] = data[key] ? `${data[key]} | ${value}` : value;
  });
  return data;
}

/* ── BUILDERS DE TEXTO PARA API ──────────────────────────── */
function buildASRBody(d) {
  return `AVIATION SAFETY REPORT (ASR) — CSFS SMS
=========================================
REPORTANTE:       ${d.nombre            || '—'}
CARGO:            ${d.cargo             || '—'}
FECHA:            ${d.fecha             || '—'}
CORREO:           ${d.mail              || '—'}
ASR No:           ${d.asr_num           || 'Por asignar'}
CONFIDENCIAL:     ${d.confidencial      || 'No'}

--- DESCRIPCIÓN DEL EVENTO / IMAGEN DE PELIGRO ---
${d.descripcion || '—'}

--- SUGERENCIAS PREVENTIVAS ---
${d.sugerencias || '—'}

--- ANÁLISIS DEL RIESGO ---
Peligro Genérico:        ${d.peligro_generico      || '—'}
Peligro Característico:  ${d.peligro_caracteristico || '—'}
Consecuencia:            ${d.consecuencia           || '—'}
Riesgo:                  ${d.riesgo                 || '—'}
Defensas Propuestas:     ${d.defensas               || '—'}

--
Enviado desde el Portal SMS · CSFS`;
}

function buildRSOBody(d) {
  return `REPORTE DE SEGURIDAD OPERACIONAL (RSO) — FT-GSMS-001
=====================================================
NOMBRE:       ${d.nombre      || '—'}
CARGO:        ${d.cargo       || '—'}
CONTACTO:     ${d.contacto    || '—'}
CONFIDENCIAL: ${d.confidencial || 'No'}

--- DATOS DEL EVENTO ---
Aeropuerto:    ${d.aeropuerto    || '—'}
Fecha:         ${d.fecha         || '—'}
Hora:          ${d.hora          || '—'}
Tipo aeronave: ${d.tipo_aeronave || '—'}
Matrícula:     ${d.matricula     || '—'}
No. Vuelo:     ${d.num_vuelo     || '—'}
Posición:      ${d.posicion      || '—'}
Retraso (hrs): ${d.retraso       || '0'}
Cancelado:     ${d.cancelado     ? 'Sí' : 'No'}

--- TIPO DE EVENTO ---
${d.evento || '—'}

--- DESCRIPCIÓN BREVE ---
${d.descripcion || '—'}

--- CAUSA APARENTE ---
${d.causa || '—'}

--- VÍCTIMAS ---
Fatalidades Pasajeros: ${d.fat_pasajeros || '0'}
Heridos Pasajeros:     ${d.her_pasajeros || '0'}
Fatalidades Empleados: ${d.fat_empleados || '0'}
Heridos Empleados:     ${d.her_empleados || '0'}
Otros:                 ${d.otros         || '0'}
Sin víctimas:          ${d.ninguno       ? 'Sí' : 'No'}

--- PERSONAL INVOLUCRADO ---
Persona 1: ${d.pers1_nombre || '—'} | ${d.pers1_cargo || '—'} | ${d.pers1_id || '—'} | ${d.pers1_cia || '—'}
Persona 2: ${d.pers2_nombre || '—'} | ${d.pers2_cargo || '—'} | ${d.pers2_id || '—'} | ${d.pers2_cia || '—'}

--- CONDICIONES AMBIENTALES ---
Clima:        ${d.clima       || '—'}
Área Rampa:   ${d.rampa       || '—'}
Visibilidad:  ${d.visibilidad || '—'}
Iluminación:  ${d.iluminacion || '—'}

--- DESCRIPCIÓN DETALLADA ---
${d.detalle || '—'}

--- TERCEROS NOTIFICADOS ---
${d.terceros || '—'}

--
Enviado desde el Portal SMS · CSFS`;
}

/* ── FOTOS ───────────────────────────────────────────────── */
function onPhotoSelect(files, type) {
  const MAX = 10;
  const newFiles = Array.from(files).filter(f =>
    f.type.startsWith('image/') || f.type.startsWith('video/')
  );
  if (!newFiles.length) return;

  selectedPhotos[type] = [...selectedPhotos[type], ...newFiles].slice(0, MAX);
  renderPhotoPreviews(type);

  const input = document.getElementById(`${type}-photo-input`);
  if (input) input.value = '';
}

function renderPhotoPreviews(type) {
  const grid = document.getElementById(`${type}-preview-grid`);
  if (!grid) return;
  grid.innerHTML = '';

  selectedPhotos[type].forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    const item = document.createElement('div');
    item.className = 'photo-preview-item';

    const mediaEl = isVideo
      ? `<video src="${url}" class="preview-video" muted playsinline
           onmouseenter="this.play()" onmouseleave="this.pause();this.currentTime=0"></video>
         <span class="preview-video-badge"><i class="ph-bold ph-video-camera"></i></span>`
      : `<img src="${url}" alt="Foto ${idx + 1}" onload="URL.revokeObjectURL(this.src)">`;

    item.innerHTML = `
      ${mediaEl}
      <button type="button" class="photo-remove-btn" onclick="removePhoto('${type}',${idx})" aria-label="Eliminar">
        <i class="ph-bold ph-x"></i>
      </button>
      <div class="photo-name">${escapeHtml(file.name.length > 18 ? file.name.slice(0,15)+'...' : file.name)}</div>
    `;
    grid.appendChild(item);
  });
}

function removePhoto(type, idx) {
  selectedPhotos[type].splice(idx, 1);
  renderPhotoPreviews(type);
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e, type) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = e.dataTransfer?.files;
  if (files) onPhotoSelect(files, type);
}

async function uploadPhotos(reporteId, type) {
  const files = selectedPhotos[type] || [];
  if (!files.length) return;

  for (const file of files) {
    try {
      const formData = new FormData();
      formData.append('archivo', file);
      await fetch(`${API_BASE}/reportes/${reporteId}/adjuntos`, {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      console.warn('Error subiendo foto:', err);
    }
  }
}

/* ── ENVÍO ASR ───────────────────────────────────────────── */
async function submitASR(e) {
  e.preventDefault();

  const data = collectForm('asr-form');
  const btn  = document.querySelector('#asr-form .btn-submit');

  // Honeypot anti-spam: si el campo oculto viene lleno, es un bot.
  // Simulamos un envío exitoso sin llamar a la API, sin delatar el honeypot.
  if (data.website) {
    btn.classList.add('loading');
    btn.disabled = true;
    setTimeout(() => {
      document.getElementById('asr-submitbar').style.display = 'none';
      document.getElementById('asr-success').classList.add('show');
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      selectedPhotos.asr = [];
    }, 600);
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/reportes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizacionId:        ORG_ID,
        tipo:                  'ASR',
        descripcion:           buildASRBody(data),
        ubicacion:             null,
        area:                  'HANDLING',
        fechaEvento:           data.fecha || null,
        nivelConfidencialidad: data.confidencial === 'Sí' ? 'CONFIDENCIAL' : 'PUBLICO',
        emailReportante:       data.mail   || null,
        nombreReportante:      data.nombre || null,
      }),
    });

    if (!res.ok) throw new Error(`Error ${res.status}`);

    const reporte = await res.json();

    if (selectedPhotos.asr.length) {
      await uploadPhotos(reporte.id, 'asr');
    }

    document.getElementById('asr-reporte-id').textContent = reporte.id;
    document.getElementById('asr-submitbar').style.display = 'none';
    document.getElementById('asr-success').classList.add('show');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    selectedPhotos.asr = [];
  } catch (err) {
    alert(`No se pudo enviar el reporte. Por favor intenta de nuevo.\n\nDetalle: ${err.message}`);
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

/* ── ENVÍO RSO ───────────────────────────────────────────── */
async function submitRSO(e) {
  e.preventDefault();

  const data = collectForm('rso-form');
  const btn  = document.querySelector('#rso-form .btn-submit');

  // Honeypot anti-spam: si el campo oculto viene lleno, es un bot.
  // Simulamos un envío exitoso sin llamar a la API, sin delatar el honeypot.
  if (data.website) {
    btn.classList.add('loading');
    btn.disabled = true;
    setTimeout(() => {
      document.getElementById('rso-submitbar').style.display = 'none';
      document.getElementById('rso-success').classList.add('show');
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      selectedPhotos.oma = [];
    }, 600);
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/reportes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizacionId:        ORG_ID,
        tipo:                  'RSO',
        descripcion:           buildRSOBody(data),
        ubicacion:             data.aeropuerto || null,
        area:                  'OMA',
        fechaEvento:           data.fecha || null,
        nivelConfidencialidad: data.confidencial === 'Sí' ? 'CONFIDENCIAL' : 'PUBLICO',
        emailReportante:       data.contacto || null,
        nombreReportante:      data.nombre   || null,
      }),
    });

    if (!res.ok) throw new Error(`Error ${res.status}`);

    const reporte = await res.json();

    if (selectedPhotos.oma.length) {
      await uploadPhotos(reporte.id, 'oma');
    }

    document.getElementById('rso-reporte-id').textContent = reporte.id;
    document.getElementById('rso-submitbar').style.display = 'none';
    document.getElementById('rso-success').classList.add('show');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    selectedPhotos.oma = [];
  } catch (err) {
    alert(`No se pudo enviar el reporte. Por favor intenta de nuevo.\n\nDetalle: ${err.message}`);
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

/* ── CHATBOT ─────────────────────────────────────────────── */
function showChatWidget() {
  const w = document.getElementById('chat-widget');
  if (w) w.style.display = 'flex';
}

function toggleChat() {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;

  chatState.open = !chatState.open;
  panel.classList.toggle('chat-panel-open', chatState.open);

  const openIcon = document.querySelector('.chat-fab-icon-open');
  const closeIcon = document.querySelector('.chat-fab-icon-close');
  if (openIcon) openIcon.style.display = chatState.open ? 'none' : '';
  if (closeIcon) closeIcon.style.display = chatState.open ? '' : 'none';

  if (chatState.open && !chatState.initialized) {
    initChatbot();
  }
}

function initChatbot() {
  chatState.initialized = true;
  chatHistory = [];
  chatFotoPendiente = null;
  chatFotoParaAdjuntar = null;
  quitarFotoChat();
  const greeting = '¡Hola! Soy AVI, tu asistente de reportes de seguridad. Estoy aquí para ayudarte a registrar tu reporte de forma fácil, sin formularios complicados.\n\n¿Qué situación quieres reportar?';
  chatHistory.push({ rol: 'assistant', contenido: greeting });
  appendChatMsg('assistant', greeting);
}

function leerComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Ningún modelo de Groq (incluido el de visión) acepta video como entrada —
// se extrae un fotograma en el navegador y se manda por el mismo canal de
// imagen que ya existe. El video original se conserva aparte (ver
// onFotoChatSelect) para subirlo completo como evidencia real del reporte.
function extraerFrameDeVideoPortal(file) {
  return new Promise((resolve, reject) => {
    const MAX = 1280;
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;
    video.onloadedmetadata = () => {
      // El fotograma exacto en t=0 suele venir en negro en varios codecs
      // antes de que el decoder arranque — se busca un instante después.
      video.currentTime = Number.isFinite(video.duration) ? Math.min(0.1, video.duration / 2) : 0.1;
    };
    video.onseeked = () => {
      let w = video.videoWidth, h = video.videoHeight;
      if (Math.max(w, h) > MAX) {
        const escala = MAX / Math.max(w, h);
        w = Math.round(w * escala);
        h = Math.round(h * escala);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(objectUrl); reject(new Error('No se pudo procesar el video')); return; }
      ctx.drawImage(video, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    video.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('No se pudo leer el video')); };
  });
}

async function onFotoChatSelect(files) {
  const file = files && files[0];
  if (!file) return;
  const esVideo = file.type.startsWith('video/');

  try {
    const dataUrl = esVideo ? await extraerFrameDeVideoPortal(file) : await leerComoDataUrl(file);
    chatFotoPendiente = { file, base64: dataUrl.split(',').pop(), mimeType: esVideo ? 'image/jpeg' : file.type, esVideo };
    const img = document.getElementById('chat-photo-preview-img');
    const wrap = document.getElementById('chat-photo-preview');
    const badge = document.getElementById('chat-photo-video-badge');
    if (img) img.src = dataUrl;
    if (wrap) wrap.style.display = '';
    if (badge) badge.style.display = esVideo ? '' : 'none';
  } catch (err) {
    console.warn('Error procesando adjunto del chat:', err);
    alert(esVideo ? 'No se pudo procesar el video. Intenta con otro archivo.' : 'No se pudo procesar la foto. Intenta con otra.');
  }
}

function quitarFotoChat() {
  chatFotoPendiente = null;
  const wrap = document.getElementById('chat-photo-preview');
  if (wrap) wrap.style.display = 'none';
  const input = document.getElementById('chat-photo-input');
  if (input) input.value = '';
}

async function subirFotoChatComoAdjunto(reporteId, file) {
  try {
    const formData = new FormData();
    formData.append('archivo', file);
    await fetch(`${API_BASE}/reportes/${reporteId}/adjuntos`, { method: 'POST', body: formData });
  } catch (err) {
    console.warn('Error subiendo foto del chat:', err);
  }
}

async function toggleMic() {
  if (isRecording) {
    mediaRecorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      setMicRecording(false);
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      if (blob.size > 0) sendVoiceMsg(blob);
    };
    mediaRecorder.start();
    setMicRecording(true);
  } catch (err) {
    console.warn('Error de micrófono:', err);
    appendChatMsg('assistant', 'No pude acceder al micrófono. Revisa los permisos del navegador o escribe tu mensaje.');
  }
}

function setMicRecording(recording) {
  isRecording = recording;
  const micBtn = document.querySelector('.chat-mic-btn');
  if (micBtn) micBtn.classList.toggle('recording', recording);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',').pop());
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function sendVoiceMsg(blob) {
  const sendBtn = document.querySelector('.chat-send-btn');
  const micBtn = document.querySelector('.chat-mic-btn');
  if (sendBtn) sendBtn.disabled = true;
  if (micBtn) micBtn.disabled = true;

  const typingId = appendChatMsg('assistant', '', true);

  try {
    const audioBase64 = await blobToBase64(blob);
    const res = await fetch(`${CHAT_BASE}/portal/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensajes: chatHistory, orgId: ORG_ID, audioBase64, audioMimeType: blob.type }),
    });

    if (!res.ok) throw new Error(`Error ${res.status}`);

    const data = await res.json();
    removeTyping(typingId);

    if (data.texto_transcrito) {
      chatHistory.push({ rol: 'user', contenido: data.texto_transcrito });
      appendChatMsg('user', data.texto_transcrito);
    }

    const respText = data.texto || 'Hubo un problema procesando tu nota de voz. Por favor intenta de nuevo.';
    chatHistory.push({ rol: 'assistant', contenido: respText });
    appendChatMsg('assistant', respText);

    if (data.documentoCreado?.id) {
      appendReporteCreado(data.documentoCreado.id);
      if (chatFotoParaAdjuntar) {
        subirFotoChatComoAdjunto(data.documentoCreado.id, chatFotoParaAdjuntar);
        chatFotoParaAdjuntar = null;
      }
    }
  } catch (err) {
    removeTyping(typingId);
    const errMsg = 'No pude procesar la nota de voz. Por favor intenta de nuevo o escribe tu mensaje.';
    chatHistory.push({ rol: 'assistant', contenido: errMsg });
    appendChatMsg('assistant', errMsg);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (micBtn) micBtn.disabled = false;
  }
}

async function sendChatMsg() {
  const input = document.getElementById('chat-text-input');
  const sendBtn = document.querySelector('.chat-send-btn');
  const text = input?.value.trim();
  const foto = chatFotoPendiente;
  if (!text && !foto) return;

  input.value = '';
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  const textoMostrado = text || '(Foto adjunta)';
  chatHistory.push({ rol: 'user', contenido: textoMostrado });
  appendChatMsg('user', textoMostrado);
  if (foto) {
    chatFotoParaAdjuntar = foto.file;
    quitarFotoChat();
  }

  const typingId = appendChatMsg('assistant', '', true);

  try {
    const res = await fetch(`${CHAT_BASE}/portal/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mensajes: chatHistory, orgId: ORG_ID,
        ...(foto ? { imagenBase64: foto.base64, mimeType: foto.mimeType } : {}),
      }),
    });

    if (!res.ok) throw new Error(`Error ${res.status}`);

    const data = await res.json();
    removeTyping(typingId);

    const respText = data.texto || 'Hubo un problema procesando tu mensaje. Por favor intenta de nuevo.';
    chatHistory.push({ rol: 'assistant', contenido: respText });
    appendChatMsg('assistant', respText);

    if (data.documentoCreado?.id) {
      appendReporteCreado(data.documentoCreado.id);
      if (chatFotoParaAdjuntar) {
        subirFotoChatComoAdjunto(data.documentoCreado.id, chatFotoParaAdjuntar);
        chatFotoParaAdjuntar = null;
      }
    }
  } catch (err) {
    removeTyping(typingId);
    const errMsg = 'No pude conectarme en este momento. Por favor intenta de nuevo.';
    chatHistory.push({ rol: 'assistant', contenido: errMsg });
    appendChatMsg('assistant', errMsg);
  } finally {
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

// Entrada sutil de cada burbuja del chat: fade + leve desplazamiento vertical,
// orquestado con la Web Animations API nativa (sin dependencias).
function animarEntradaBurbuja(el) {
  if (typeof el.animate !== 'function') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate(
    [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 280, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
  );
}

function appendReporteCreado(reporteId) {
  const list = document.getElementById('chat-messages-list');
  if (!list) return;

  const div = document.createElement('div');
  div.className = 'chat-msg chat-msg-assistant';
  div.innerHTML = `
    <div class="chat-bubble chat-bubble-success">
      <div class="chat-success-title"><i class="ph-bold ph-check-circle"></i> Reporte registrado</div>
      <div class="chat-success-id">${escapeHtml(reporteId)}</div>
      <div class="chat-success-note">Guarda este número para hacer seguimiento de tu reporte con el Coordinador SMS.</div>
    </div>
  `;
  list.appendChild(div);
  animarEntradaBurbuja(div);
  list.scrollTop = list.scrollHeight;
}

let _chatMsgId = 0;
function appendChatMsg(rol, texto, isTyping = false) {
  const list = document.getElementById('chat-messages-list');
  if (!list) return null;

  const id = `cm-${++_chatMsgId}`;
  const div = document.createElement('div');
  div.id = id;
  div.className = `chat-msg chat-msg-${rol}`;

  if (isTyping) {
    div.innerHTML = '<div class="chat-bubble"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
  } else {
    div.innerHTML = `<div class="chat-bubble">${formatChatText(texto)}</div>`;
  }

  list.appendChild(div);
  animarEntradaBurbuja(div);
  list.scrollTop = list.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function formatChatText(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}
