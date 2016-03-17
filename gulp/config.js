var historyApiFallback = require("connect-history-api-fallback");

var dest = "./build";
var src = './src';



module.exports = {
    browserSync: {
        server: {
            // Serve up our build folder
            baseDir: dest,
            middleware: [historyApiFallback()]
        }
    },
    js: {
        src: src + '/js/app.js'
    },
    templates: {
        src: src + '/templates/**/*.html'
    },
    css: {
        src: src + "/js/vendor/highlight.js/styles/docco.css",
        dest: dest
    },
    sass: {
        src: src + "/sass/**/*.scss",
        dest: dest,
        settings: {
            outputStyle: "compressed",
            indentedSyntax: false, // Disable .sass syntax!
            imagePath: 'img' // Used by the image-url helper
        }
    },
    images: {
        src: src + "/img/**",
        dest: dest + "/img"
    },
    markup: {
        src: src + "/{index.html,localplatform.html,debug.html,favicon.ico,/platform/**,/resources/**}",
        dest: dest
    },
    browserify: {
        bundleConfigs: [{
            entries: src + '/js/app.js',
            dest: dest,
            outputName: 'worker_ui.js',
            extensions: [],
            transform: ["ractivate"]
        }]
    },
    production: {
        cssSrc: dest + '/*.css',
        jsSrc: dest + '/*.js',
        dest: dest
    }
};