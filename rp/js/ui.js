window.UIController = {
  init() {
    // Guard against double-initialisation: attaching the event listeners
    // twice would make every toggle fire two handlers and cancel itself out.
    if (this._initialized) return;
    this._initialized = true;

    this.setupTabNavigation();
    this.setupAppMenu();
    this.setupActionButtons();
    this.setupModalListeners();
    this.setupSearchInput();
    this.setupSaveManagement();
    if (window.Cutscene) document.querySelectorAll('[data-cutscene-toggle]').forEach(el => Cutscene.renderToggle(el));
    console.log("UI Controller initialized.");
  },

  // The "…" menu in the header: save, settings, publishing.
  setupAppMenu() {
    const btn = document.getElementById('appMenuBtn');
    const menu = document.getElementById('appMenu');
    if (!btn || !menu) return;
    const close = () => { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.app-menu-wrap')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  },

  // Programmatic tab switch, used when the engine navigates for the user
  // (e.g. clicking a team on the dashboard jumps to its team page).
  activateTab(tabId) {
    const btn = document.querySelector(`.app-tabs [data-tab="${tabId}"]`)
             || document.querySelector(`[data-tab="${tabId}"]`);
    if (btn) btn.click();
  },

  // Marks the tab (and any shortcut to it) active and shows its content.
  showTab(targetTabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === targetTabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === targetTabId));
    const active = document.querySelector(`.app-tabs .tab-btn[data-tab="${targetTabId}"]`);
    const bar = document.querySelector('.app-tabs-inner');
    if (active && bar && bar.scrollWidth > bar.clientWidth) {
      const left = active.offsetLeft - bar.clientWidth / 2 + active.offsetWidth / 2;
      if (bar.scrollTo) bar.scrollTo({ left, behavior: 'smooth' }); else bar.scrollLeft = left;
    }
  },

  setupTabNavigation() {
    const tabButtons = document.querySelectorAll('[data-tab]');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTabId = btn.getAttribute('data-tab');
        if (!targetTabId) return;
        this.showTab(targetTabId);

        // Record the tab in the shared navigation history so the single
        // Back control can return here.
        if (window.SimEngine && !SimEngine._suppressNav && typeof SimEngine.pushNav === 'function') {
          const named = document.querySelector(`.app-tabs .tab-btn[data-tab="${targetTabId}"]`) || btn;
          SimEngine.pushNav({ type: 'tab', key: targetTabId, label: (named.textContent || '').replace(/\s+/g, ' ').trim() || 'previous view' });
        }

        if (window.SimEngine) {
          if (targetTabId === 'awardsTab') SimEngine.updateAwardsTab();
          else if (targetTabId === 'standingsTab') SimEngine.updateStandingsTab();
          else if (targetTabId === 'teamTab') SimEngine.updateTeamTab();
          else if (targetTabId === 'teamStatsTab') SimEngine.updateTeamStatsTab();
          else if (targetTabId === 'recruitsTab') SimEngine.updateRecruitsTab();
          else if (targetTabId === 'historyTab') SimEngine.updateHistoryTab();
          else if (targetTabId === 'recordsTab') SimEngine.updateRecordsTab();
          else if (targetTabId === 'dashTab') SimEngine.updateDashboard();
        }
      });
    });
  },

  setupActionButtons() {
    const simWeekBtn = document.getElementById('simWeekBtn');
    if (simWeekBtn) {
      simWeekBtn.addEventListener('click', async () => {
        if (!window.SimEngine) return;
        if (SimEngine.state.ncaaDone) { SimEngine.openOffseason(); return; }
        // Spinner first, then yield a frame so it actually paints before
        // the simulation blocks the thread.
        SimEngine.showSimSpinner('Simulating…');
        await new Promise(r => setTimeout(r, 30));
        try {
          await SimEngine.simButtonAction();
        } finally {
          await SimEngine.hideSimSpinner();
        }
      });
    }

  },

  setupModalListeners() {
    const closeBtns = document.querySelectorAll('.close-modal, .modal-close, .close-btn');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.SimEngine) {
          SimEngine.closeTeamModal();
          SimEngine.closePlayerModal();
        }
      });
    });

    const teamModal = document.getElementById('teamModal');
    if (teamModal) {
      teamModal.addEventListener('click', (e) => {
        if (e.target === teamModal) SimEngine.closeTeamModal();
      });
    }

    const playerModal = document.getElementById('playerModal');
    if (playerModal) {
      playerModal.addEventListener('click', (e) => {
        if (e.target === playerModal) SimEngine.closePlayerModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (window.SimEngine) {
          SimEngine.closeTeamModal();
          SimEngine.closePlayerModal();
        }
      }
    });
  },

  setupSearchInput() {
    const searchInput = document.getElementById('playerSearchInput') || document.getElementById('tableSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#statsBody tr');

        rows.forEach(row => {
          const text = row.innerText.toLowerCase();
          row.style.display = text.includes(query) ? '' : 'none';
        });
      });
    }
  },

  setupSaveManagement() {
    const exportBtn = document.getElementById('exportSaveBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        if (!window.SimEngine) return;
        const saveData = {
          year: SimEngine.state.year,
          week: SimEngine.state.week,
          phase: SimEngine.state.phase,
          teams: SimEngine.state.teams,
          activePlayers: SimEngine.state.activePlayers,
          recruits: SimEngine.state.recruits
        };

        const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NCAA_RP_Save_${SimEngine.state.year}_Wk${SimEngine.state.week}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    const importInput = document.getElementById('importSaveInput');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const importedData = JSON.parse(event.target.result);
            if (importedData.teams && importedData.activePlayers && window.SimEngine) {
              SimEngine.state.year = importedData.year || 2028;
              SimEngine.state.week = importedData.week || 0;
              SimEngine.state.phase = importedData.phase || 'Preseason';
              SimEngine.state.teams = importedData.teams;
              SimEngine.state.activePlayers = importedData.activePlayers;
              SimEngine.state.recruits = importedData.recruits || [];

              await SimEngine.saveStateToDB();
              SimEngine.syncUI();
              alert("Save file imported successfully!");
            }
          } catch (err) {
            alert("Invalid save file format.");
            console.error(err);
          }
        };
        reader.readAsText(file);
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  UIController.init();
});
