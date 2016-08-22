const _ = require('lodash');
const fs = require('fs');
const gulp = require('gulp');
const path = require('path');
const watch = require('gulp-watch');

const BASE_DIR = 'app';
const DIST_DIR = 'dist';
const JS_GLOB = `${BASE_DIR}/**/*.{js,json}`;

gulp.task('sync-tsconfigs', () => {
    const tsconfigJSON = require(path.resolve(__dirname, 'tsconfig.json'));
    fs.writeFileSync(path.resolve(__dirname, BASE_DIR, 'tsconfig.json'), JSON.stringify(_.defaultsDeep({
        compilerOptions: {
            outDir: `../${DIST_DIR}`
        },
        include: ['./**/*']
    }, tsconfigJSON), null, 4));
    fs.writeFileSync(path.resolve(__dirname, 'src', 'tsconfig.json'), JSON.stringify(_.defaultsDeep({
        compilerOptions: {
            outDir: `../${DIST_DIR}`,
            noImplicitAny: false,
            noImplicitReturns: false
        },
        include: ['./**/*']
    }, tsconfigJSON), null, 4));
});

gulp.task('sync-package-json', () => {
    const packageJSON = require(path.resolve(__dirname, 'package.json'));
    const appJson = _.pick(packageJSON, [
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
    const appJsonStr = JSON.stringify(appJson, null, 4) + '\n';
    fs.writeFileSync(path.resolve(__dirname, BASE_DIR, 'package.json'), appJsonStr);
});

gulp.task('write-config', () => {
    const packageJSON = require(path.resolve(__dirname, 'package.json'));
    const appConfigJSON = require(path.resolve(__dirname, 'src', 'brackets.config.json'));
    const appConfigStr = JSON.stringify(_.defaults({}, appConfigJSON, packageJSON), null, 4);
    fs.writeFileSync(path.resolve(__dirname, 'src', 'config.json'), appConfigStr);
});

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

gulp.task('build', ['sync-tsconfigs', 'sync-package-json', 'write-config'], () => {
    copyJs();
});

gulp.task('watch', ['build'], () => {
    watch(JS_GLOB, file => copyJs(file.path));
});

gulp.task('default', ['build']);
