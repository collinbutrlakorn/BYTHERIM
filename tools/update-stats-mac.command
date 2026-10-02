#!/bin/bash
# Refreshes the big board's college stats from your own computer.
#
# Barttorvik refuses GitHub's servers, so the daily job can't read it.
# Double-click this file (Mac) to pull the numbers from Barttorvik here and
# publish them: it updates data/stats.json and, if this folder is a git
# clone you can push from, commits and pushes it. Needs Node 18+
# (nodejs.org). The first time, macOS may ask you to allow it: right-click
# the file, Open.
cd "$(dirname "$0")/.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node isn't installed. Get it from https://nodejs.org (the LTS version), then run this again."
  read -n 1 -s -r -p "Press any key to close."; exit 1
fi
echo "Getting stats from Barttorvik and Basketball-Reference (about a minute)…"
node tools/update-stats.mjs || { read -n 1 -s -r -p "Something went wrong (above). Press any key to close."; exit 1; }
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git diff --quiet -- data/stats.json; then
    echo "No stat changes to publish."
  else
    git pull --rebase --autostash -q && git add data/stats.json && git commit -q -m "Update big board stats" && git push -q \
      && echo "Published. The big board shows the new numbers in a minute or two." \
      || echo "Couldn't push. Upload data/stats.json on GitHub instead (Add file > Upload files, into the data folder)."
  fi
else
  echo "Done. Upload data/stats.json on GitHub (Add file > Upload files, into the data folder) to publish it."
fi
read -n 1 -s -r -p "Press any key to close."
