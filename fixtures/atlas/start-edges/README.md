# start-edges

An Atlas fixture. CI's test job runs test/, whose first file is empty and
whose test runs src/run.js; run.js imports lib/verify.js and src/persist.js,
which writes out/index.json, which site/app.js reads. The e2e job reaches
further but runs only when a path filter says so.
