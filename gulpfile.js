/* eslint-env node */

"use strict";

const _ = require('lodash');
const fs = require('fs-extra');
const gulp = require('gulp');
const path = require('path');
const watch = require('gulp-watch');
const exec = require("child_process").exec;

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
            outDir: `../${DIST_DIRS[1]}`
        },
        include: ['./**/*', '../node_modules/@types/**/*']
    }, tsconfigJSON), null, 4) + '\n');
});

gulp.task('fix-package-json-indent', () => {
    const packageJSON = require(path.resolve(__dirname, 'package.json'));
    fs.writeFileSync(path.resolve(__dirname, 'package.json'), JSON.stringify(packageJSON, null, 4) + '\n');
});

gulp.task('copy-dist-package-json', () => {
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
    const dir = path.resolve(__dirname, DIST_DIRS[0]);
    fs.ensureDirSync(dir);
    fs.writeFileSync(path.resolve(dir, 'package.json'), appJsonStr + '\n');
});

gulp.task('write-dist-config-json', () => {
    const packageJSON = require(path.resolve(__dirname, 'package.json'));
    const appConfigJSON = require(path.resolve(__dirname, 'src', 'brackets.config.json'));
    const appConfigStr = JSON.stringify(_.defaults({}, appConfigJSON, packageJSON), null, 4);
    const dir = path.resolve(__dirname, DIST_DIRS[1]);
    fs.ensureDirSync(dir);
    fs.writeFileSync(path.resolve(dir, 'config.json'), appConfigStr + '\n');
});

function copyJs(filePath, srcDir, distDir) {
    const relative = path.relative(path.join(__dirname, srcDir), filePath);
    const from = path.join(srcDir, relative);
    const to = path.dirname(path.join(distDir, relative));
    return gulp.src(from)
        .pipe(gulp.dest(to));
}

gulp.task('build', ['sync-tsconfigs', 'fix-package-json-indent', 'copy-dist-package-json', 'write-dist-config-json'], (_cb) => {
    const cb = _.after(BASE_DIRS.length, _cb);
    BASE_DIRS.forEach((srcDir, idx) => {
        gulp.src(`${srcDir}/**/!(*.ts|*.tsx)`)
            .pipe(gulp.dest(DIST_DIRS[idx]))
            .on('end', cb);
    });
});

function runNpmInstall(where, callback) {
    console.log("running npm install --production in " + where);
    exec('npm install --production', { cwd: './' + where }, function (err, stdout, stderr) {
        if (err) {
            console.error(stderr);
        } else {
            console.log(stdout || "finished npm install in " + where);
        }
        return err ? callback(stderr) : callback(null, stdout);
    });
}

gulp.task('npm-install-dist', ['build'], (cb) => {
    runNpmInstall("dist", function (err) {
        return err ? cb(err) : cb(null);
    });
});

gulp.task('watch', ['npm-install-dist'], () => {
    BASE_DIRS.forEach((srcDir, idx) => {
        watch(`${srcDir}/**/!(*.ts|*.tsx)`, file => {
            copyJs(file.path, srcDir, DIST_DIRS[idx]);
            console.log(`copied modified ${file.path} from ${srcDir} to ${DIST_DIRS[idx]}`);
        });
    });
});

gulp.task('default', ['npm-install-dist']);
