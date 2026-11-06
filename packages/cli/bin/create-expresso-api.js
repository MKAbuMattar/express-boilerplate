#!/usr/bin/env node
// Its own file, not a second name for dist/main.js: when every bin of a
// package points at one file, `npm create` runs the first bin (eb), not the
// one named after the package. The file name also tells main to create.
import '../dist/main.js';
