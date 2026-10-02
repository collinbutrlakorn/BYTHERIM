@echo off
rem Refreshes the big board's college stats from your own computer.
rem Barttorvik refuses GitHub's servers, so the daily job can't read it.
rem Double-click this file (Windows) to pull the numbers from Barttorvik here
rem and publish them: it updates data\stats.json and, if this folder is a git
rem clone you can push from, commits and pushes it. Needs Node 18+ (nodejs.org).
cd /d "%~dp0.."
where node >nul 2>nul || (echo Node isn't installed. Get it from https://nodejs.org ^(the LTS version^), then run this again. & pause & exit /b 1)
echo Getting stats from Barttorvik and Basketball-Reference (about a minute)...
node tools\update-stats.mjs || (echo Something went wrong ^(above^). & pause & exit /b 1)
where git >nul 2>nul || goto upload
git rev-parse --is-inside-work-tree >nul 2>nul || goto upload
git diff --quiet -- data/stats.json && (echo No stat changes to publish. & pause & exit /b 0)
git pull --rebase --autostash -q && git add data/stats.json && git commit -q -m "Update big board stats" && git push -q && (echo Published. The big board shows the new numbers in a minute or two. & pause & exit /b 0)
echo Couldn't push.
:upload
echo Upload data\stats.json on GitHub (Add file ^> Upload files, into the data folder) to publish it.
pause
