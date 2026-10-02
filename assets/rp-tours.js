/* ============================================================
   The RP pages' first-time tours (see assets/tour.js). Each page gets
   a short walkthrough the first time someone uses it; the NCAA RP has
   one for its title screen and one for the season itself, which opens
   once a save is running (after the opening cutscene).
   ============================================================ */
(function (root) {
  'use strict';
  if (typeof document === 'undefined' || !root.Tour) return;
  const T = root.Tour;
  const here = location.pathname;
  const isPage = re => re.test(here);
  const visible = sel => { const e = document.querySelector(sel); return !!e && e.offsetParent !== null; };
  const signInStep = { el: '#accountSlot', when: () => !!(root.Cloud && root.Cloud.enabled && !root.Cloud.user),
    title: 'Sign in (optional)', text: 'Sign in with Google to keep your saves and boards in your account and pick them up on any device. Everything works without it.' };

  // ---------------- NCAA RP ----------------
  T.define('ncaa-home', [
    { title: 'Welcome to the NCAA RP', html: 'A full college basketball season you run: every Division I program, with the RP\'s own <b>fictional</b> recruits and rosters, from tip-off to the national championship, the draft and the offseason. Here\'s a quick look around.' },
    { el: '#newSaveBtn', title: 'Start your own universe', html: 'A <b>new save</b> builds a universe from the official rosters and recruits. It\'s yours to play: nothing you do changes the official universe everyone else sees.' },
    { el: '#loadSaveBtn', title: 'Pick up where you left off', text: 'Your save lives in this browser. Continue brings it right back, mid-season or mid-offseason.' },
    signInStep,
    { el: '.home-links', title: 'More of the universe', html: '<b>How the RP works</b> is the full guide. The <b>Draft RP</b> and <b>Recruiting</b> pages follow the same universe as your season.' }
  ], { label: 'NCAA RP tour', guide: './guide.html' });

  T.define('ncaa-app', [
    { el: '#simWeekBtn', title: 'Play the season', text: 'Simulate a week at a time. This button follows the season: conference tournaments, Selection Sunday, the NCAA Tournament, then each step of the offseason.' },
    { el: '#skipBtn', title: 'Skip ahead', text: 'In a hurry? Jump straight to conference play, the tournaments or the offseason.' },
    { el: '#seasonTrack', title: 'Where the season stands', text: 'Every stage of the year. A later stage you can jump to is clickable.' },
    { el: '.app-tabs', title: 'The whole universe', text: 'Schedule and results, standings, bracketology, every team (past seasons are under Team History), team and player stats with search, awards, recruits, history and the record book.' },
    { el: '#appMenuBtn', title: 'Saves and settings', text: 'Export or import your save, save it to your account, turn cutscenes on or off, and replay this tour.' },
    { title: 'Click anything', html: 'Click a <b>score</b> for its box score and play-by-play, or <b>watch</b> an upcoming game live. Click any <b>player</b> or <b>team</b> to open its page. Enjoy the season!' }
  ], { label: 'NCAA RP tour', guide: './guide.html', doneLabel: 'Start playing' });

  // ---------------- Recruiting ----------------
  T.define('recruiting', [
    { title: 'Welcome to Recruiting', html: 'Every class of the BYTHERIM RP, from high school to signing day and beyond. The players are <b>fictional</b>; the schools are real.' },
    { el: '.recruiting-nav', title: 'Five views', html: '<b>Class Rankings</b>, <b>School Rankings</b>, <b>Statistics</b>, the <b>Transfer Portal</b> and the <b>Summer Circuit</b> (AAU and the FIBA youth World Cup).' },
    { el: '#searchInput', title: 'Find anyone', text: 'Search by player or school, then narrow by class, state, position, stars or commitment.' },
    { el: '#rankingsTable', title: 'Open a profile', text: 'Click a recruit for his bio, scouting report, offers, high-school, AAU and FIBA stats, and later his college career and draft pick.' },
    signInStep
  ], { label: 'Recruiting tour', guide: '../rp/guide.html' });

  // ---------------- Draft RP ----------------
  T.define('draft-rp', [
    { title: 'Welcome to the Draft RP', text: 'The NBA draft of the RP universe: a big board and mock draft that move all season, then the whole pre-draft cycle and draft night.' },
    { el: '#draftStages', title: 'The draft cycle', text: 'Declarations, the combine, the lottery, team workouts, the withdrawal deadline and draft night, in order. Each step moves a prospect\'s stock.' },
    { el: '.draft-view-nav', title: 'Boards', html: 'The <b>Big Board</b>, <b>My Big Board</b> (build your own from any prospect) and the <b>Mock Draft</b>.' },
    { el: '#draftSource', title: 'Official or your save', text: 'Follow the official universe, or switch to your own NCAA RP save when you have one.' },
    { el: '#draftBody', title: 'Every prospect', text: 'Click a prospect for his scouting report, measurements, combine results and college stats.' },
    signInStep
  ], { label: 'Draft RP tour', guide: './guide.html' });

  // ---------------- RP Hub ----------------
  T.define('rp-hub', [
    { title: 'Welcome to the BYTHERIM RP', html: 'One <b>fictional</b> college basketball universe across three pages: players are recruited out of high school, play their college careers in the simulation, and leave through the NBA draft.' },
    { el: '.rp-path', title: 'Three pages, one career', html: '<b>Recruiting</b> for the high-school classes, the <b>NCAA RP</b> where the seasons are played, and the <b>Draft RP</b> for the road to the pros.' },
    signInStep,
    { el: '.hero-actions', title: 'Jump in', html: 'Open the NCAA Sim to start a save of your own, or read <b>How it works</b> for the full guide.' }
  ], { label: 'RP tour', guide: './guide.html' });

  // ---------------- when each one opens ----------------
  const go = () => {
    if (isPage(/\/rp\/(ncaa(\.html)?)$/)) {
      T.auto('ncaa-home', { when: () => visible('#homeScreen') });
      // The season tour waits for a running save with nothing else on screen.
      let tries = 0;
      const wait = setInterval(() => {
        tries++;
        const app = visible('.sim-layout');
        const busy = document.querySelector('.rp-loader.active, .cs-show, .offseason-overlay.open, #playerPage[style*="block"]') || T.active;
        if (app && !busy) { clearInterval(wait); T.auto('ncaa-app', { delay: 400 }); }
        else if (tries > 600) clearInterval(wait);
      }, 1000);
    } else if (isPage(/\/recruiting\/(index\.html)?$/)) T.auto('recruiting', { delay: 1200 });
    else if (isPage(/\/rp\/draft(\.html)?$/)) T.auto('draft-rp', { delay: 1200 });
    else if (isPage(/\/rp\/(index\.html)?$/)) T.auto('rp-hub', { delay: 900 });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})(typeof window !== 'undefined' ? window : globalThis);
