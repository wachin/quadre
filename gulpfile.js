const _ = require('lodash');
const fs = require('fs');
const gulp = require('gulp');
const path = require('path');
const watch = require('gulp-watch');

const BASE_DIRS = ['app', 'src'];
const DIST_DIRS = ['dist', 'dist/www'];

gulp.task('sync-tsconfigs', () => {
    const tsconfigJSON = require(path.resolve(__dirname, 'tsconfig.json'));
    delete tsconfigJSON.exclude;
    fs.writeFileSync(path.resolve(__dirname, BASE_DIRS[0], 'tsconfig.json'), JSON.stringify(_.defaultsDeep({
        compilerOptions: {
            outDir: `../${DIST_DIRS[0]}`
        },
        include: ['./**/*']
    }, tsconfigJSON), null, 4) + '\n');
    fs.writeFileSync(path.resolve(__dirname, BASE_DIRS[1], 'tsconfig.json'), JSON.stringify(_.defaultsDeep({
        compilerOptions: {
            outDir: `../${DIST_DIRS[1]}`,
            noImplicitAny: false,
            noImplicitReturns: false
        },
        include: ['./**/*']
    }, tsconfigJSON), null, 4) + '\n');
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
    const appJsonStr = JSON.stringify(appJson, null, 4);
    fs.writeFileSync(path.resolve(__dirname, BASE_DIRS[0], 'package.json'), appJsonStr + '\n');
});

gulp.task('write-config', () => {
    const packageJSON = require(path.resolve(__dirname, 'package.json'));
    const appConfigJSON = require(path.resolve(__dirname, 'src', 'brackets.config.json'));
    const appConfigStr = JSON.stringify(_.defaults({}, appConfigJSON, packageJSON), null, 4);
    fs.writeFileSync(path.resolve(__dirname, BASE_DIRS[1], 'config.json'), appConfigStr + '\n');
});

function copyJs(filePath, srcDir, distDir) {
    const relative = path.relative(path.join(__dirname, srcDir), filePath);
    const from = path.join(srcDir, relative);
    const to = path.dirname(path.join(distDir, relative));
    return gulp.src(from)
        .pipe(gulp.dest(to));
}

gulp.task('build', ['sync-tsconfigs', 'sync-package-json', 'write-config'], (_cb) => {
    const cb = _.after(BASE_DIRS.length, _cb);
    BASE_DIRS.forEach((srcDir, idx) => {
        gulp.src(`${srcDir}/**/!(*.ts|*.tsx)`)
            .pipe(gulp.dest(DIST_DIRS[idx]))
            .on('end', cb);
    });
});

gulp.task('watch', ['build'], () => {
    BASE_DIRS.forEach((srcDir, idx) => {
        watch(`${srcDir}/**/!(*.ts|*.tsx)`, file => copyJs(file.path, srcDir, DIST_DIRS[idx]));
    });
});

gulp.task('default', ['build']);
