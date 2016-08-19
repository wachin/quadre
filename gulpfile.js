const gulp = require('gulp');
const path = require('path');
const watch = require('gulp-watch');

const BASE_DIR = 'electron-app';
const DIST_DIR = 'dist';
const JS_GLOB = `${BASE_DIR}/**/*.{js,json}`;

function copyJs(filePath) {
    let from;
    let to;
    if (filePath) {
        const relative = path.relative(path.join(__dirname, BASE_DIR), filePath);
        from = path.join(BASE_DIR, relative);
        to = path.dirname(path.join(DIST_DIR, relative));
    } else {
        from = JS_GLOB;
        to = DIST_DIR;
    }
    return gulp.src(from)
        .pipe(gulp.dest(to));
}

gulp.task('build', () => copyJs());

gulp.task('watch', ['build'], () => {
    watch(JS_GLOB, file => copyJs(file.path));
});

gulp.task('default', ['build']);
