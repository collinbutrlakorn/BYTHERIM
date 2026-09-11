window.UIController = {
  init() {
    this.setupTabNavigation();
    this.setupMegaMenu();
    this.setupActionButtons();
    this.setupModalListeners();
    this.setupSearchInput();
    this.setupSaveManagement();
    console.log("UI Controller initialized.");
  },

  setupMegaMenu() {
    const triggers = document.querySelectorAll('.mega-menu-trigger');
    triggers.forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const menuName = trigger.getAttribute('data-menu');
        const panel = document.querySelector(`.mega-menu-dropdown[data-menu-panel="${menuName}"]`);
        const isOpen = panel && panel.classList.contains('open');

        document.querySelectorAll('.mega-menu-dropdown').forEach(p => p.classList.remove('open'));
        if (panel && !isOpen) panel.classList.add('open');
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.mega-menu-group')) {
        document.querySelectorAll('.mega-menu-dropdown').forEach(p => p.classList.remove('open'));
      }
    });
  },

  setupTabNavigation() {
    const tabButtons = document.querySelectorAll('[data-tab]');
    
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTabId = btn.getAttribute('data-tab');
        if (!targetTabId) return;

        // Visual un-active all
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Re-activate specific
        btn.classList.add('active');
        const targetContent = document.getElementById(targetTabId);
        if (targetContent) targetContent.classList.add('active');

        // Keep the top-level menu trigger in sync with whichever tab is
        // active, so it's clear which section you're in even after the
        // dropdown closes (this also handles "View Standings ->" style
        // shortcut buttons that live outside any dropdown).
        const parentDropdown = btn.closest('.mega-menu-dropdown');
        document.querySelectorAll('.mega-menu-trigger').forEach(t => t.classList.remove('active'));
        if (parentDropdown) {
          const menuName = parentDropdown.getAttribute('data-menu-panel');
          const trigger = document.querySelector(`.mega-menu-trigger[data-menu="${menuName}"]`);
          if (trigger) trigger.classList.add('active');
          parentDropdown.classList.remove('open');
        } else {
          // A shortcut button (e.g. "View Standings ->") outside the menu —
          // find whichever dropdown actually contains a matching tab-btn.
          const owningPanel = document.querySelector(`.mega-menu-dropdown button[data-tab="${targetTabId}"]`)?.closest('.mega-menu-dropdown');
          if (owningPanel) {
            const menuName = owningPanel.getAttribute('data-menu-panel');
            const trigger = document.querySelector(`.mega-menu-trigger[data-menu="${menuName}"]`);
            if (trigger) trigger.classList.add('active');
            document.querySelectorAll('.tab-btn').forEach(b => {
              if (b.getAttribute('data-tab') === targetTabId) b.classList.add('active');
            });
          }
        }

        // Trigger updates if engine is ready
        if (window.SimEngine) {
          if (targetTabId === 'awardsTab') SimEngine.updateAwardsTab();
          else if (targetTabId === 'standingsTab') SimEngine.updateStandingsTab();
          else if (targetTabId === 'teamTab') SimEngine.updateTeamTab();
          else if (targetTabId === 'teamStatsTab') SimEngine.updateTeamStatsTab();
          else if (targetTabId === 'recruitsTab') SimEngine.updateRecruitsTab();
          else if (targetTabId === 'draftBoardTab') SimEngine.updateDraftBoardTab();
          else if (targetTabId === 'historyTab') SimEngine.updateHistoryTab();
        }
      });
    });
  },

  setupActionButtons() {
    const simWeekBtn = document.getElementById('simWeekBtn');
    if (simWeekBtn) {
      simWeekBtn.addEventListener('click', () => {
        if (window.SimEngine) SimEngine.simulateWeek();
      });
    }

    const offseasonBtn = document.getElementById('advanceOffseasonBtn');
    if (offseasonBtn) {
      offseasonBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to advance to the next season? This will graduate seniors and progress rosters.")) {
          if (window.SimEngine) SimEngine.runOffseason();
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
