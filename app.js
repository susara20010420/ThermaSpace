(() => {
  'use strict';

  const W_TO_BTUH = 3.412141633;
  const W_PER_TR = 3516.85284;
  const AIR_CP_W_PER_LS_K = 1.206;
  const LATENT_W_PER_LS_DW = 3000;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const num = (s, d = 0, root = document) => {
    const el = typeof s === 'string' ? $(s, root) : s;
    const n = Number(el?.value);
    return Number.isFinite(n) ? n : d;
  };
  const text = (s, d = '', root = document) => (typeof s === 'string' ? $(s, root) : s)?.value?.trim() || d;
  const fmt = (n, digits = 2) => Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
  const kw = w => `${fmt(w / 1000, 2)} kW`;
  const clamp0 = n => Math.max(0, Number(n) || 0);
  const escapeHtml = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  const state = {
    databaseLoaded: false,
    db: null,
    results: null,
    currentStep: 1,
    serverInfo: null
  };

  function toast(message, ms = 3200) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), ms);
  }

  async function init() {
    populateHours();
    setupNavigation();
    setupDynamicSections();
    setupEvents();
    createAdjacentSurface('Partition');
    createAdjacentSurface('Ceiling');
    createAdjacentSurface('Floor');
    addWall();
    addWindow();
    addEquipment('Equipment', 500, 0);
    syncAirTemperatures();
    await loadDatabase();
    renderRecentExports();
  }

  function populateHours() {
    const sel = $('#designHour');
    sel.innerHTML = Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}" ${i + 1 === 15 ? 'selected' : ''}>${String(i + 1).padStart(2,'0')}:00</option>`).join('');
  }

  function setupNavigation() {
    $$('.step-link').forEach(btn => btn.addEventListener('click', () => goStep(Number(btn.dataset.step))));
    $$('.next').forEach(btn => btn.addEventListener('click', () => goStep(Number(btn.dataset.next))));
    $$('.prev').forEach(btn => btn.addEventListener('click', () => goStep(Number(btn.dataset.prev))));
  }
  function goStep(step) {
    state.currentStep = Math.min(6, Math.max(1, step));
    $$('.step-panel').forEach(s => s.classList.toggle('active', Number(s.dataset.step) === state.currentStep));
    $$('.step-link').forEach(s => s.classList.toggle('active', Number(s.dataset.step) === state.currentStep));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (state.currentStep === 6 && state.results) renderFinalResults();
  }

  function setupDynamicSections() {
    $('#addWall').addEventListener('click', addWall);
    $('#addWindow').addEventListener('click', addWindow);
    $('#addEquipment').addEventListener('click', () => addEquipment('Equipment', 500, 0));
  }

  function setupEvents() {
    $('#connectGoogle').addEventListener('click', async () => { await loadDatabase(true); });
    $('#showConfig').addEventListener('click', () => { showDataStatus(); $('#configDialog').showModal(); });
    $('#runAnalysisFromStep4').addEventListener('click', () => { if (runAnalysis()) goStep(5); });
    $('#rerunAnalysis').addEventListener('click', runAnalysis);
    $('#downloadCsv').addEventListener('click', downloadHourlyCsv);
    $('#saveToDrive').addEventListener('click', downloadResultWorkbook);
    $('#refreshSavedResults').addEventListener('click', clearRecentExports);
    $('#printReport').addEventListener('click', () => window.print());
    $('#newCalculation').addEventListener('click', () => { goStep(1); toast('Ready for a new calculation. Change the project inputs and recalculate.'); });
    $('#resultFileName').addEventListener('input', e => { $('#saveResultName').value = e.target.value; });

    ['#outdoorDb','#dailyRange','#indoorDb','#designHour','#roofType','#roofU','#roofLength','#roofWidth','#buildingType',
      '#lightWatts','#lightUse','#lightBallast','#lightClfMode','#lightClfManual','#peopleCount','#peopleSensible','#peopleLatent','#peopleClfMode','#peopleClfManual',
      '#infiltrationLs','#infOutC','#infInC','#outW','#inW','#ventilationLs','#ventOutC','#ventInC','#ventOutW','#ventInW','#fanKw','#fanHeatFraction','#ductHeatW','#otherSensibleW','#allowancePct','#applyCltdCorrection']
      .forEach(sel => $(sel)?.addEventListener('input', updateLivePreview));
    $('#indoorDb').addEventListener('input', syncAirTemperatures);
    $('#outdoorDb').addEventListener('input', syncAirTemperatures);
    document.addEventListener('input', e => { if (e.target.closest('.dynamic-item')) updateLivePreview(); });
    document.addEventListener('change', e => { if (e.target.closest('.dynamic-item')) updateLivePreview(); });
  }

  function showDataStatus() {
    const i = state.serverInfo || {};
    const rows = [
      ['Runtime', 'Static GitHub Pages / browser-only'],
      ['Lookup bundle', i.data_file || 'data/thermaspace-db.js'],
      ['Database version', state.db?.version || '—'],
      ['Source workbook', 'data/source/ThermaSpace_CLTD_Database.xlsx'],
      ['Repository', 'https://github.com/susara20010420/ThermaSpace'],
      ['Authentication', 'None required for public calculations']
    ];
    $('#configDetails').innerHTML = rows.map(([k,v]) => `<div class="config-row"><b>${escapeHtml(k)}</b><code>${escapeHtml(v)}</code></div>`).join('');
  }

  function setDbStatus(ok, msg) {
    const el = $('#dbStatus');
    el.className = `status-pill ${ok ? 'good' : 'neutral'}`;
    el.innerHTML = `<i></i>${escapeHtml(msg)}`;
    $('#lookupBadge').textContent = ok ? 'Repository lookup active' : 'Waiting for database';
    $('#lookupBadge').classList.toggle('success', ok);
  }

  async function loadDatabase(showToast = false) {
    setDbStatus(false, 'Loading lookup tables…');
    try {
      const result = window.THERMASPACE_DB;
      if (!result || !result.sheets) {
        throw new Error('Bundled lookup database was not loaded. Check data/thermaspace-db.js.');
      }
      validateDb(result.sheets);
      state.db = normalizeDb(result.sheets);
      state.serverInfo = {
        data_file: 'data/thermaspace-db.js',
        json_file: 'data/thermaspace-db.json',
        source_file: 'data/source/ThermaSpace_CLTD_Database.xlsx'
      };
      state.databaseLoaded = true;
      setDbStatus(true, `Database loaded (${state.db.version})`);
      fillDriveOptions();
      updateLivePreview();
      showDataStatus();
      if (showToast) toast('CLTD/SCL/CLF lookup tables reloaded from the GitHub repository bundle.');
    } catch (err) {
      state.databaseLoaded = false;
      setDbStatus(false, 'Database unavailable');
      console.error(err);
      toast(`Database load failed: ${friendlyError(err)}`, 6000);
    }
  }

  function tableRows(values) {
    if (!values.length) return [];
    const headers = values[0].map(h => String(h).trim());
    return values.slice(1).filter(r => r.some(v => String(v ?? '').trim() !== '')).map(row => {
      const o = {};
      headers.forEach((h, i) => o[h] = row[i] ?? '');
      return o;
    });
  }

  function validateDb(t) {
    const required = ['Config','Roof_Types','Roof_CLTD','Wall_Types','Wall_CLTD','Glass_CLTD','SCL','CLF_Occupancy','CLF_Lighting'];
    const missing = required.filter(s => !t[s]);
    if (missing.length) throw new Error(`Database tabs missing: ${missing.join(', ')}`);
    if (!t.Roof_CLTD.length || !t.Wall_CLTD.length || !t.SCL.length) throw new Error('Database lookup tables are empty.');
  }

  function normalizeDb(t) {
    const cfg = Object.fromEntries(t.Config.map(r => [String(r.key || '').trim(), r.value]));
    const roofTypes = t.Roof_Types.map(r => ({
      code: String(r.roof_type_code || '').trim(),
      name: String(r.roof_type_name || '').trim(),
      defaultU: toNullableNumber(r.default_u_w_m2k),
      notes: String(r.notes || '').trim()
    })).filter(r => r.code);
    const roofCLTD = new Map();
    t.Roof_CLTD.forEach(r => roofCLTD.set(`${String(r.roof_type_code).trim()}|${Number(r.hour)}`, Number(r.cltd_k)));
    const wallTypes = t.Wall_Types.map(r => ({
      code: String(r.wall_type_code || '').trim(),
      name: String(r.wall_type_name || '').trim(),
      profile: String(r.profile_code || '').trim(),
      defaultU: toNullableNumber(r.default_u_w_m2k),
      notes: String(r.notes || '').trim()
    })).filter(r => r.code && r.profile);
    const wallCLTD = new Map();
    t.Wall_CLTD.forEach(r => wallCLTD.set(`${String(r.profile_code).trim()}|${String(r.orientation).trim().toUpperCase()}|${Number(r.hour)}`, Number(r.cltd_k)));
    const glassCLTD = new Map();
    t.Glass_CLTD.forEach(r => glassCLTD.set(Number(r.hour), Number(r.cltd_k)));
    const scl = new Map();
    t.SCL.forEach(r => scl.set(`${String(r.orientation).trim().toUpperCase()}|${Number(r.hour)}`, Number(r.scl_w_m2)));
    const occ = new Map();
    t.CLF_Occupancy.forEach(r => occ.set(`${String(r.building_type).trim().toLowerCase()}|${Number(r.hour)}`, Number(r.clf)));
    const light = new Map();
    t.CLF_Lighting.forEach(r => light.set(`${String(r.building_type).trim().toLowerCase()}|${Number(r.hour)}`, Number(r.clf)));
    return {
      version: String(cfg.database_version || cfg.version || 'unknown'),
      baselineCorrection: Number(cfg.baseline_cltd_correction_k ?? 1.1),
      config: cfg, roofTypes, roofCLTD, wallTypes, wallCLTD, glassCLTD, scl,
      clf: { occupancy: occ, lighting: light }
    };
  }
  function toNullableNumber(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function fillDriveOptions() {
    const roof = $('#roofType');
    roof.innerHTML = state.db.roofTypes.map(r => `<option value="${escapeHtml(r.code)}">${escapeHtml(r.code)} — ${escapeHtml(r.name)}</option>`).join('');
    $$('.wall-type').forEach(fillWallTypeSelect);
    syncPresetUValues();
  }
  function fillWallTypeSelect(sel) {
    const current = sel.value;
    sel.innerHTML = state.db?.wallTypes?.map(r => `<option value="${escapeHtml(r.code)}">${escapeHtml(r.code)} — ${escapeHtml(r.name)}</option>`).join('') || '<option>Loading lookup tables…</option>';
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
  }
  function syncPresetUValues() {
    if (!state.db) return;
    const roofType = state.db.roofTypes.find(r => r.code === $('#roofType').value);
    if (roofType?.defaultU != null) $('#roofU').value = roofType.defaultU;
    $$('.wall-item').forEach(item => {
      const type = state.db.wallTypes.find(r => r.code === $('.wall-type', item).value);
      if (type?.defaultU != null) $('.wall-u', item).value = type.defaultU;
      $('.wall-source', item).textContent = `Lookup profile: ${type?.profile || '—'}`;
    });
  }

  function addWall() {
    const frag = $('#wallTemplate').content.cloneNode(true);
    const item = $('.wall-item', frag);
    $('#walls').appendChild(frag);
    const actual = $('#walls').lastElementChild;
    fillWallTypeSelect($('.wall-type', actual));
    $('.wall-type', actual).addEventListener('change', () => { syncPresetUValues(); updateLivePreview(); });
    $('.remove-item', actual).addEventListener('click', () => { actual.remove(); renumber('.wall-item'); updateLivePreview(); });
    renumber('.wall-item');
    syncPresetUValues();
    updateLivePreview();
  }
  function addWindow() {
    const frag = $('#windowTemplate').content.cloneNode(true);
    $('#windows').appendChild(frag);
    const actual = $('#windows').lastElementChild;
    $('.remove-item', actual).addEventListener('click', () => { actual.remove(); renumber('.window-item'); updateLivePreview(); });
    renumber('.window-item');
    updateLivePreview();
  }
  function createAdjacentSurface(name) {
    const frag = $('#adjacentTemplate').content.cloneNode(true);
    $('.adjacent-name', frag).textContent = name;
    $('#adjacentLoads').appendChild(frag);
  }
  function addEquipment(name = 'Equipment', sensible = 500, latent = 0) {
    const frag = $('#equipmentTemplate').content.cloneNode(true);
    $('#equipment').appendChild(frag);
    const actual = $('#equipment').lastElementChild;
    $('.equip-name', actual).value = name;
    $('.equip-sensible', actual).value = sensible;
    $('.equip-latent', actual).value = latent;
    $('.remove-item', actual).addEventListener('click', () => { actual.remove(); renumber('.equipment-item'); updateLivePreview(); });
    renumber('.equipment-item');
    updateLivePreview();
  }
  function renumber(selector) { $$(selector).forEach((item, i) => $('.item-number', item).textContent = i + 1); }

  function syncAirTemperatures() {
    const out = num('#outdoorDb', 33), indoor = num('#indoorDb', 24);
    ['#infOutC','#ventOutC'].forEach(s => { const e=$(s); if (e) e.value=out; });
    ['#infInC','#ventInC'].forEach(s => { const e=$(s); if (e) e.value=indoor; });
    $$('.adj-in').forEach(e => e.value = indoor);
    updateLivePreview();
  }

  function getDesignCorrection() {
    if (!$('#applyCltdCorrection').checked || !state.db) return 0;
    const tr = num('#indoorDb', 24);
    const tmax = num('#outdoorDb', 33);
    const dr = num('#dailyRange', 8);
    const tm = tmax - dr / 2;
    const newCorrection = (25.5 - tr) + (tm - 29.4);
    return newCorrection - state.db.baselineCorrection;
  }

  function lookupRoof(type, hour) {
    return state.db?.roofCLTD.get(`${type}|${hour}`);
  }
  function lookupWall(typeCode, orientation, hour) {
    const t = state.db?.wallTypes.find(x => x.code === typeCode);
    if (!t) return undefined;
    return state.db.wallCLTD.get(`${t.profile}|${orientation}|${hour}`);
  }
  function lookupScl(orientation, hour) { return state.db?.scl.get(`${orientation}|${hour}`); }
  function lookupGlass(hour) { return state.db?.glassCLTD.get(hour); }
  function lookupClf(kind, buildingType, hour) {
    if (buildingType === 'custom') return 1;
    return state.db?.clf?.[kind]?.get(`${buildingType}|${hour}`) ?? 1;
  }

  function updateLivePreview() {
    const hour = num('#designHour', 15);
    const c = calculateHour(hour, { allowUnloaded: true });
    const roofArea = clamp0(num('#roofLength')) * clamp0(num('#roofWidth'));
    $('#roofAreaOut').textContent = `${fmt(roofArea,2)} m²`;
    $('#roofCltdOut').textContent = c?.detail?.roof?.cltd != null ? `${fmt(c.detail.roof.cltd,2)} K` : '—';
    $('#roofLoadOut').textContent = c?.detail?.roof?.load != null ? kw(c.detail.roof.load) : '—';
    if (!c) return;

    c.detail.walls.forEach((r, i) => {
      const item = $$('.wall-item')[i]; if (!item) return;
      $('.wall-area-out', item).textContent = `${fmt(r.area,2)} m²`;
      $('.wall-cltd-out', item).textContent = r.cltd == null ? '—' : `${fmt(r.cltd,2)} K`;
      $('.wall-load-out', item).textContent = kw(r.load);
      const wt = state.db?.wallTypes.find(x => x.code === r.type);
      $('.wall-source', item).textContent = `Lookup profile: ${wt?.profile || '—'}`;
    });
    c.detail.windows.forEach((r, i) => {
      const item = $$('.window-item')[i]; if (!item) return;
      $('.window-cltd-out', item).textContent = r.cltd == null ? '—' : `${fmt(r.cltd,2)} K`;
      $('.window-scl-out', item).textContent = r.scl == null ? '—' : `${fmt(r.scl,1)} W/m²`;
      $('.window-cond-out', item).textContent = kw(r.conduction);
      $('.window-solar-out', item).textContent = kw(r.solar);
    });
    c.detail.adjacent.forEach((r, i) => { const item = $$('.adjacent-item')[i]; if (item) $('.adj-load-out', item).textContent = kw(r.load); });
    $('#lightLoadOut').textContent = kw(c.components.lighting);
    $('#peopleSensibleOut').textContent = kw(c.components.peopleSensible);
    $('#peopleLatentOut').textContent = kw(c.components.peopleLatent);
    c.detail.equipment.forEach((r,i)=>{const item=$$('.equipment-item')[i]; if(item){$('.equip-sens-out',item).textContent=kw(r.sensible);$('.equip-lat-out',item).textContent=kw(r.latent);}});
    $('#infSensOut').textContent = kw(c.components.infiltrationSensible);
    $('#infLatOut').textContent = kw(c.components.infiltrationLatent);
    $('#ventSensOut').textContent = kw(c.components.ventilationSensible);
    $('#ventLatOut').textContent = kw(c.components.ventilationLatent);
  }

  function calculateHour(hour, { allowUnloaded = false } = {}) {
    if (!state.databaseLoaded) {
      if (!allowUnloaded) toast('Wait for the lookup database to load first.');
      return null;
    }
    const correction = getDesignCorrection();
    const buildingType = text('#buildingType','office');

    const roofType = text('#roofType');
    const roofBaseCltd = lookupRoof(roofType, hour);
    const roofCltd = Number.isFinite(roofBaseCltd) ? roofBaseCltd + correction : null;
    const roofArea = clamp0(num('#roofLength')) * clamp0(num('#roofWidth'));
    const roofLoad = roofCltd == null ? 0 : clamp0(num('#roofU')) * roofArea * roofCltd;

    const wallDetails = $$('.wall-item').map(item => {
      const type = text($('.wall-type', item));
      const orientation = text($('.wall-orientation', item), 'N');
      const area = Math.max(0, clamp0(num($('.wall-length', item))) * clamp0(num($('.wall-height', item))) - clamp0(num($('.wall-openings', item))));
      const base = lookupWall(type, orientation, hour);
      const cltd = Number.isFinite(base) ? base + correction : null;
      const load = cltd == null ? 0 : clamp0(num($('.wall-u', item))) * area * cltd;
      return { type, orientation, area, cltd, load };
    });
    const wallLoad = sum(wallDetails.map(r => r.load));

    const glassBase = lookupGlass(hour);
    const glassCltd = Number.isFinite(glassBase) ? glassBase + correction : null;
    const windowDetails = $$('.window-item').map(item => {
      const orientation = text($('.window-orientation', item), 'N');
      const area = clamp0(num($('.window-area', item)));
      const u = clamp0(num($('.window-u', item)));
      const sc = clamp0(num($('.window-sc', item), 1));
      const scl = lookupScl(orientation, hour);
      const conduction = glassCltd == null ? 0 : u * area * glassCltd;
      const solar = Number.isFinite(scl) ? area * sc * scl : 0;
      return { label: text($('.window-label', item), 'Glazing'), orientation, area, u, sc, cltd: glassCltd, scl, conduction, solar };
    });
    const glassConduction = sum(windowDetails.map(r => r.conduction));
    const solar = sum(windowDetails.map(r => r.solar));

    const adjacent = $$('.adjacent-item').map(item => {
      const name = $('.adjacent-name', item).textContent.trim();
      const load = clamp0(num($('.adj-u', item))) * clamp0(num($('.adj-area', item))) * (num($('.adj-out', item)) - num($('.adj-in', item)));
      return { name, load };
    });
    const adjacentLoad = sum(adjacent.map(r => r.load));

    const lightClf = $('#lightClfMode').value === 'manual' ? clamp0(num('#lightClfManual',1)) : lookupClf('lighting', buildingType, hour);
    const lighting = clamp0(num('#lightWatts')) * clamp0(num('#lightUse',1)) * clamp0(num('#lightBallast',1)) * lightClf;

    const peopleClf = $('#peopleClfMode').value === 'manual' ? clamp0(num('#peopleClfManual',1)) : lookupClf('occupancy', buildingType, hour);
    const peopleSensible = clamp0(num('#peopleCount')) * clamp0(num('#peopleSensible')) * peopleClf;
    const peopleLatent = clamp0(num('#peopleCount')) * clamp0(num('#peopleLatent'));

    const equipment = $$('.equipment-item').map(item => {
      const mode = text($('.equip-clf-mode', item),'none');
      let clf = 1;
      if (mode === 'table') clf = lookupClf('occupancy', buildingType, hour);
      if (mode === 'manual') clf = clamp0(num($('.equip-clf', item),1));
      const use = clamp0(num($('.equip-use', item),1));
      const sensible = clamp0(num($('.equip-sensible', item))) * use * clf;
      const latent = clamp0(num($('.equip-latent', item))) * use;
      return { name: text($('.equip-name', item),'Equipment'), sensible, latent, use, clf };
    });
    const equipmentSensible = sum(equipment.map(r => r.sensible));
    const equipmentLatent = sum(equipment.map(r => r.latent));

    const infiltrationSensible = AIR_CP_W_PER_LS_K * clamp0(num('#infiltrationLs')) * (num('#infOutC') - num('#infInC'));
    const infiltrationLatent = LATENT_W_PER_LS_DW * clamp0(num('#infiltrationLs')) * (num('#outW') - num('#inW'));
    const ventilationSensible = AIR_CP_W_PER_LS_K * clamp0(num('#ventilationLs')) * (num('#ventOutC') - num('#ventInC'));
    const ventilationLatent = LATENT_W_PER_LS_DW * clamp0(num('#ventilationLs')) * (num('#ventOutW') - num('#ventInW'));
    const fanHeat = clamp0(num('#fanKw')) * 1000 * Math.min(1, clamp0(num('#fanHeatFraction',1)));
    const ductHeat = clamp0(num('#ductHeatW'));
    const otherSensible = clamp0(num('#otherSensibleW'));

    const envelopeSensible = roofLoad + wallLoad + glassConduction + adjacentLoad;
    const internalSensible = lighting + peopleSensible + equipmentSensible;
    const airSensible = infiltrationSensible + ventilationSensible + fanHeat + ductHeat + otherSensible;
    const latent = Math.max(0, peopleLatent + equipmentLatent + infiltrationLatent + ventilationLatent);
    const sensibleBeforeAllowance = envelopeSensible + solar + internalSensible + airSensible;
    const allowanceFactor = 1 + clamp0(num('#allowancePct')) / 100;
    const sensible = sensibleBeforeAllowance * allowanceFactor;
    const latentWithAllowance = latent * allowanceFactor;
    const total = Math.max(0, sensible + latentWithAllowance);
    const supplyDelta = num('#indoorDb',24) - num('#supplyAirC',14);
    const supplyAirLs = supplyDelta > 0 ? Math.max(0, sensible / (AIR_CP_W_PER_LS_K * supplyDelta)) : 0;
    const cop = Math.max(.1, num('#cop',3.2));
    const electricalKw = total / 1000 / cop;

    return {
      hour,
      correction,
      components: {
        roof: roofLoad, walls: wallLoad, glassConduction, solar, adjacent: adjacentLoad,
        lighting, peopleSensible, peopleLatent, equipmentSensible, equipmentLatent,
        infiltrationSensible, infiltrationLatent: Math.max(0,infiltrationLatent),
        ventilationSensible, ventilationLatent: Math.max(0,ventilationLatent),
        fanHeat, ductHeat, otherSensible
      },
      groups: { envelope: envelopeSensible, solar, internalSensible, airSensible, latent: latentWithAllowance },
      sensible, latent: latentWithAllowance, total, electricalKw, supplyAirLs,
      detail: { roof: { type: roofType, area: roofArea, cltd: roofCltd, load: roofLoad }, walls: wallDetails, windows: windowDetails, adjacent, equipment, lightClf, peopleClf }
    };
  }

  function sum(values) { return values.reduce((a,b) => a + (Number(b) || 0), 0); }

  function runAnalysis() {
    if (!state.databaseLoaded) { toast('The lookup database is not loaded yet. Click Reload lookup tables.'); return false; }
    const rows = [];
    for (let h = 1; h <= 24; h++) rows.push(calculateHour(h));
    if (rows.some(r => !r)) return false;
    const peak = rows.reduce((a,b) => b.total > a.total ? b : a, rows[0]);
    state.results = {
      rows, peak,
      dailyElectricalKwh: sum(rows.map(r => r.electricalKw)),
      generatedAt: new Date().toISOString(),
      inputs: collectInputs()
    };
    renderAnalysis();
    renderFinalResults();
    toast(`Analysis complete. Peak: ${fmt(peak.total/1000,2)} kW at ${String(peak.hour).padStart(2,'0')}:00.`);
    return true;
  }

  function collectInputs() {
    return {
      project: {
        projectName: text('#projectName'), resultFileName: text('#resultFileName'), projectRef: text('#projectRef'), zoneName: text('#zoneName'),
        location: text('#location'), buildingType: text('#buildingType'), notes: text('#designNotes')
      },
      design: {
        outdoorDbC: num('#outdoorDb'), dailyRangeC: num('#dailyRange'), indoorDbC: num('#indoorDb'), indoorRhPct: num('#indoorRh'),
        supplyAirC: num('#supplyAirC'), cop: num('#cop'), applyCltdCorrection: $('#applyCltdCorrection').checked,
        storedBaselineCorrectionK: state.db?.baselineCorrection ?? null, appliedDeltaCorrectionK: getDesignCorrection()
      },
      roof: { type: text('#roofType'), uWm2K: num('#roofU'), lengthM: num('#roofLength'), widthM: num('#roofWidth') },
      walls: $$('.wall-item').map((item,i)=>({index:i+1,type:text($('.wall-type',item)),orientation:text($('.wall-orientation',item)),uWm2K:num($('.wall-u',item)),lengthM:num($('.wall-length',item)),heightM:num($('.wall-height',item)),openingsAreaM2:num($('.wall-openings',item))})),
      windows: $$('.window-item').map((item,i)=>({index:i+1,label:text($('.window-label',item)),orientation:text($('.window-orientation',item)),areaM2:num($('.window-area',item)),uWm2K:num($('.window-u',item)),shadingCoefficient:num($('.window-sc',item))})),
      adjacent: $$('.adjacent-item').map(item=>({surface:$('.adjacent-name',item).textContent.trim(),uWm2K:num($('.adj-u',item)),areaM2:num($('.adj-area',item)),adjacentTempC:num($('.adj-out',item)),roomTempC:num($('.adj-in',item))})),
      internal: {
        lighting:{watts:num('#lightWatts'),useFactor:num('#lightUse'),ballastFactor:num('#lightBallast'),clfMode:text('#lightClfMode'),manualClf:num('#lightClfManual')},
        people:{count:num('#peopleCount'),sensibleWPerPerson:num('#peopleSensible'),latentWPerPerson:num('#peopleLatent'),clfMode:text('#peopleClfMode'),manualClf:num('#peopleClfManual')},
        equipment: $$('.equipment-item').map((item,i)=>({index:i+1,name:text($('.equip-name',item)),sensibleW:num($('.equip-sensible',item)),latentW:num($('.equip-latent',item)),useFactor:num($('.equip-use',item)),clfMode:text($('.equip-clf-mode',item)),manualClf:num($('.equip-clf',item))}))
      },
      air: {
        infiltration:{ls:num('#infiltrationLs'),outC:num('#infOutC'),inC:num('#infInC'),outW:num('#outW'),inW:num('#inW')},
        ventilation:{ls:num('#ventilationLs'),outC:num('#ventOutC'),inC:num('#ventInC'),outW:num('#ventOutW'),inW:num('#ventInW')},
        fanKw:num('#fanKw'),fanHeatFraction:num('#fanHeatFraction'),ductHeatW:num('#ductHeatW'),otherSensibleW:num('#otherSensibleW'),allowancePct:num('#allowancePct')
      }
    };
  }

  function renderAnalysis() {
    const { rows, peak, dailyElectricalKwh } = state.results;
    $('#analysisPeakKw').textContent = fmt(peak.total/1000,2);
    $('#analysisPeakHour').textContent = `${String(peak.hour).padStart(2,'0')}:00`;
    $('#analysisPeakSensible').textContent = fmt(peak.sensible/1000,2);
    $('#analysisDailyKwh').textContent = fmt(dailyElectricalKwh,1);
    const tbody = $('#hourlyTable tbody');
    tbody.innerHTML = rows.map(r => `<tr class="${r.hour===peak.hour?'peak-row':''}"><td>${String(r.hour).padStart(2,'0')}:00</td><td>${fmt(r.groups.envelope/1000,3)}</td><td>${fmt(r.groups.solar/1000,3)}</td><td>${fmt(r.groups.internalSensible/1000,3)}</td><td>${fmt(r.groups.airSensible/1000,3)}</td><td>${fmt(r.latent/1000,3)}</td><td>${fmt(r.total/1000,3)}</td><td>${fmt(r.electricalKw,3)}</td></tr>`).join('');
    drawChart(rows);
  }

  function drawChart(rows) {
    const canvas = $('#loadChart');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(700, rect.width || 1000), cssH = 340;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr; canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr);
    ctx.clearRect(0,0,cssW,cssH);
    const pad = {l:52,r:18,t:18,b:38};
    const w=cssW-pad.l-pad.r,h=cssH-pad.t-pad.b;
    const maxY=Math.max(1,...rows.flatMap(r=>[r.total,r.sensible,r.groups.solar]))/1000*1.12;
    ctx.font='11px system-ui'; ctx.fillStyle='#71848b'; ctx.strokeStyle='#e3ecea'; ctx.lineWidth=1;
    for(let i=0;i<=5;i++){const y=pad.t+h-(h*i/5);ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(cssW-pad.r,y);ctx.stroke();ctx.fillText(`${fmt(maxY*i/5,1)} kW`,6,y+4)}
    [1,4,7,10,13,16,19,22,24].forEach(hr=>{const x=pad.l+w*((hr-1)/23);ctx.fillText(String(hr).padStart(2,'0'),x-7,cssH-13)});
    const series=[
      {get:r=>r.total/1000,color:'#138a7b',width:3},
      {get:r=>r.sensible/1000,color:'#3b82f6',width:2},
      {get:r=>r.groups.solar/1000,color:'#f59e0b',width:2}
    ];
    series.forEach(s=>{ctx.beginPath();ctx.strokeStyle=s.color;ctx.lineWidth=s.width;rows.forEach((r,i)=>{const x=pad.l+w*(i/23), y=pad.t+h-h*(s.get(r)/maxY);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke()});
  }

  function renderFinalResults() {
    if (!state.results) return;
    const p = state.results.peak;
    $('#resultPeakKw').textContent = fmt(p.total/1000,2);
    $('#resultTR').textContent = fmt(p.total/W_PER_TR,2);
    $('#resultBtuh').textContent = fmt(p.total*W_TO_BTUH,0);
    $('#resultAirflow').textContent = fmt(p.supplyAirLs,0);
    $('#saveResultName').value = text('#resultFileName') || text('#projectName') || 'ThermaSpace Cooling Load Result';
    const rows = [
      ['Roof',p.components.roof],['Walls',p.components.walls],['Glass conduction',p.components.glassConduction],['Window solar',p.components.solar],['Adjacent surfaces',p.components.adjacent],
      ['Lighting',p.components.lighting],['People sensible',p.components.peopleSensible],['Equipment sensible',p.components.equipmentSensible],['Outdoor-air sensible',p.components.infiltrationSensible+p.components.ventilationSensible],
      ['Fan / duct / other',p.components.fanHeat+p.components.ductHeat+p.components.otherSensible],['Latent load',p.latent]
    ];
    const max = Math.max(1,...rows.map(x=>Math.abs(x[1])));
    $('#breakdownBars').innerHTML = rows.map(([name,val])=>`<div class="breakdown-row"><span>${escapeHtml(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,Math.abs(val)/max*100)}%"></div></div><b>${fmt(val/1000,2)} kW</b></div>`).join('');
  }

  function downloadHourlyCsv() {
    if (!state.results) return toast('Run the analysis first.');
    const rows = [['Hour','Envelope_kW','Solar_kW','Internal_Sensible_kW','Air_Sensible_kW','Latent_kW','Total_kW','Electrical_kW']];
    state.results.rows.forEach(r => rows.push([r.hour,r.groups.envelope/1000,r.groups.solar/1000,r.groups.internalSensible/1000,r.groups.airSensible/1000,r.latent/1000,r.total/1000,r.electricalKw]));
    const csv = rows.map(r=>r.map(csvCell).join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`${safeFile(text('#projectName'))}_24h.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
  function safeFile(s){return String(s||'ThermaSpace').replace(/[\\/:*?"<>|]+/g,'_').trim().slice(0,100)}


  function flattenObject(obj, prefix = '', out = []) {
    if (obj == null) return out;
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => flattenObject(v, `${prefix}[${i + 1}]`, out));
    } else if (typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]) => {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') flattenObject(v, p, out);
        else out.push([p, v]);
      });
    } else {
      out.push([prefix, obj]);
    }
    return out;
  }

  function downloadResultWorkbook() {
    if (!state.results) return toast('Run the 24-hour analysis first.');

    const title = text('#saveResultName') || `${text('#projectName','ThermaSpace')} Result`;
    const filename = `${safeFile(title)}.xlsx`;
    const p = state.results.peak;

    if (!window.XLSX) {
      toast('Excel library did not load. Downloading the hourly CSV instead.', 6000);
      downloadHourlyCsv();
      return;
    }

    const wb = XLSX.utils.book_new();

    const summary = [
      ['ThermaSpace Cooling Load Result', ''],
      ['Project', text('#projectName')],
      ['Reference', text('#projectRef')],
      ['Zone / room', text('#zoneName')],
      ['Location', text('#location')],
      ['Building type', text('#buildingType')],
      ['Generated at', state.results.generatedAt],
      ['Peak hour', `${String(p.hour).padStart(2,'0')}:00`],
      ['Peak total cooling load (kW)', p.total / 1000],
      ['Peak sensible load (kW)', p.sensible / 1000],
      ['Peak latent load (kW)', p.latent / 1000],
      ['Refrigeration tons (TR)', p.total / W_PER_TR],
      ['Equivalent capacity (Btu/h)', p.total * W_TO_BTUH],
      ['Supply airflow (L/s)', p.supplyAirLs],
      ['Estimated daily electrical energy (kWh)', state.results.dailyElectricalKwh],
      ['Lookup database version', state.db?.version || 'unknown'],
      ['Lookup source', 'GitHub repository data/thermaspace-db.js']
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

    const inputRows = [['Input path', 'Value'], ...flattenObject(state.results.inputs)];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inputRows), 'Inputs');

    const hourly = [[
      'Hour','Envelope_kW','Solar_kW','Internal_Sensible_kW','Air_Sensible_kW',
      'Sensible_kW','Latent_kW','Total_kW','Electrical_kW','Supply_Air_L_s'
    ]];
    state.results.rows.forEach(r => hourly.push([
      r.hour,
      r.groups.envelope / 1000,
      r.groups.solar / 1000,
      r.groups.internalSensible / 1000,
      r.groups.airSensible / 1000,
      r.sensible / 1000,
      r.latent / 1000,
      r.total / 1000,
      r.electricalKw,
      r.supplyAirLs
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hourly), 'Hourly_Results');

    const breakdown = [
      ['Component','Peak load kW'],
      ['Roof',p.components.roof/1000],
      ['Walls',p.components.walls/1000],
      ['Glass conduction',p.components.glassConduction/1000],
      ['Window solar',p.components.solar/1000],
      ['Adjacent surfaces',p.components.adjacent/1000],
      ['Lighting',p.components.lighting/1000],
      ['People sensible',p.components.peopleSensible/1000],
      ['People latent',p.components.peopleLatent/1000],
      ['Equipment sensible',p.components.equipmentSensible/1000],
      ['Equipment latent',p.components.equipmentLatent/1000],
      ['Infiltration sensible',p.components.infiltrationSensible/1000],
      ['Infiltration latent',p.components.infiltrationLatent/1000],
      ['Ventilation sensible',p.components.ventilationSensible/1000],
      ['Ventilation latent',p.components.ventilationLatent/1000],
      ['Fan heat',p.components.fanHeat/1000],
      ['Duct heat',p.components.ductHeat/1000],
      ['Other sensible',p.components.otherSensible/1000]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(breakdown), 'Peak_Breakdown');

    const source = [
      ['Field','Value'],
      ['Method','CLTD / SCL / CLF'],
      ['Database version',state.db?.version || 'unknown'],
      ['Repository','https://github.com/susara20010420/ThermaSpace'],
      ['Runtime lookup file','data/thermaspace-db.js'],
      ['JSON copy','data/thermaspace-db.json'],
      ['Source workbook','data/source/ThermaSpace_CLTD_Database.xlsx'],
      ['Note','West-wall hour-19 source value is preserved as supplied and should be verified before final engineering validation.']
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(source), 'Data_Source');

    XLSX.writeFile(wb, filename);
    $('#saveResultStatus').className = 'save-status success';
    $('#saveResultStatus').innerHTML = `Downloaded <b>${escapeHtml(filename)}</b><br><small>Upload or save this workbook to Google Drive if required.</small>`;
    recordRecentExport(filename);
    toast('Result Excel workbook downloaded.');
  }

  function recentExports() {
    try { return JSON.parse(localStorage.getItem('thermaspaceRecentExports') || '[]'); }
    catch { return []; }
  }

  function recordRecentExport(filename) {
    const rows = recentExports();
    rows.unshift({ filename, at: new Date().toISOString() });
    localStorage.setItem('thermaspaceRecentExports', JSON.stringify(rows.slice(0, 10)));
    renderRecentExports();
  }

  function renderRecentExports() {
    const rows = recentExports();
    $('#savedResults').innerHTML = rows.length
      ? rows.map(r => `<div class="saved-file"><div><span>${escapeHtml(r.filename)}</span><small>${escapeHtml(new Date(r.at).toLocaleString())}</small></div><b>✓</b></div>`).join('')
      : '<p class="muted">No exported workbooks yet.</p>';
  }

  function clearRecentExports() {
    localStorage.removeItem('thermaspaceRecentExports');
    renderRecentExports();
    toast('Recent export history cleared.');
  }

  function friendlyError(err) {
    return String(err?.message || err || 'Unknown error').slice(0, 400);
  }

  window.addEventListener('resize', () => { if (state.results && state.currentStep === 5) drawChart(state.results.rows); });
  window.addEventListener('DOMContentLoaded', init);
})();
