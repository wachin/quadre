/* eslint-env node */

"use strict";

const _ = require('lodash');
const gulp = require('gulp');
const path = require('path');
const watch = require('gulp-watch');

const BASE_DIRS = ['app', 'src', 'samples'];
const DIST_DIRS = ['dist', 'dist/www', 'dist/samples'];

function copyJs(filePath, srcDir, distDir) {
    const relative = path.relative(path.join(__dirname, srcDir), filePath);
    const from = path.join(srcDir, relative);
    const to = path.dirname(path.join(distDir, relative));
    return gulp.src(from)
        .pipe(gulp.dest(to));
}

gulp.task('copy-src-dist', (_cb) => {
    const cb = _.after(BASE_DIRS.length, _cb);
    BASE_DIRS.forEach((srcDir, idx) => {
        gulp.src(`${srcDir}/**/!(*.ts|*.tsx)`)
            .pipe(gulp.dest(DIST_DIRS[idx]))
            .on('end', cb);
    });
});

gulp.task('watch', ['copy-src-dist'], () => {
    BASE_DIRS.forEach((srcDir, idx) => {
        watch(`${srcDir}/**/!(*.ts|*.tsx)`, file => {
            copyJs(file.path, srcDir, DIST_DIRS[idx]);
            console.log(`copied modified ${file.path} from ${srcDir} to ${DIST_DIRS[idx]}`);
        });
    });
});
