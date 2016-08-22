const _ = require('lodash');
const fs = require('fs');
const gulp = require('gulp');
const path = require('path');
const watch = require('gulp-watch');

const BASE_DIR = 'electron-app';
const DIST_DIR = 'dist';
const JS_GLOB = `${BASE_DIR}/**/*.{js,json}`;

function syncPackageJson() {
    const packageJson = require(path.resolve(__dirname, 'package.json'));
    const appJson = _.pick(packageJson, [
        'name',
        'productName',
        'description',
        'author',
        'license',
        'homepage',
        'version',
        'apiVersion',
        'issues',
        'repository',
        'dependencies',
        'optionalDependencies'
    ]);
    fs.writeFileSync(path.resolve(__dirname, BASE_DIR, 'package.json'), JSON.stringify(appJson, null, 2));
}

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

gulp.task('build', () => {
    syncPackageJson();
    copyJs();
});

gulp.task('watch', ['build'], () => {
    watch(JS_GLOB, file => copyJs(file.path));
});

gulp.task('default', ['build']);
