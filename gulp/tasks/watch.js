var gulp = require('gulp');
var config = require('../config');

gulp.task('watch', ['watchify'], function () {
    gulp.watch("./src/index.html", ['markup']);
    gulp.watch(config.js.src, ['browserify']);
    gulp.watch(config.templates.src, ['browserify']);
    gulp.watch(config.sass.src, ['sass']);
    gulp.watch(config.css.src, ['css']);
    gulp.watch(config.images.src, ['images']);
    // Watchify will watch and recompile our JS, so no need to gulp.watch it
});