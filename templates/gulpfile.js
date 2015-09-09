// =================
// alloyteam simple project build gulpfile
// author: rehornchen@tencent.com
// version: 0.3.17
// created: 2014-07-15
// history:
// 0.4.2 2014-10-2 add jsrefs debug support
// 0.4.1 2014-09-30 add cmd line publish support
// 0.3.17 2014-09-30 add retina sprite support
// 0.3.16 2014-09-29 remove requirement of build:htmlrefs comment 
// 0.3.0 2014-07-17 adapt to slush generator
// 0.2.0 2014-07-15 support htmlrefs rev alloykit-offline
// 0.1.0 2014-07-15 init
// --------------------
// 不要修改以下内容
// =================
var gulp = require('gulp');
var runSequence = require('run-sequence');
var md5 = require('MD5');

var fs = require('fs');
var path = require('path');
var url = require('url');
var _ = require('lodash');
var async = require('async');
var request = require('request');

// 异步工作流，连续并入，数组工作流，用 async 替代异步
// var merge = require('merge-stream'),
//     // sq = require('stream-queue'),
//     es = require('event-stream');

var compass = require('gulp-compass'),
    clean = require('gulp-rimraf'),
    rename = require('gulp-rename'),
    rev = require('gulp-rev'),
    uglify = require('gulp-uglify'),
    minifyCss = require('gulp-minify-css'),
    // imagemin = require('gulp-imagemin'),
    minifyHtml = require('gulp-minify-html'),
    concat = require('gulp-concat'),
    savefile = require('gulp-savefile'),
    jsrefs = require('gulp-jsrefs'),
    htmlrefs = require('gulp-htmlrefs'),
    jstemplate = require('gulp-jstemplate-compile'),
    nodetmpl = require('gulp-node-simple'),    
    zip = require('gulp-zip'),
    newer = require('gulp-newer');

// =================
// configs
// =================
var configs = {
    // about site global
    name: 'alloyteam-simple-default',
    cdn: 'http://s.url.cn/qqun/',
    webServer: 'http://find.qq.com/',
    subMoudle: '/',

    // liveproxy
    port: 6800,
    rules: [],

    // path related
    src: './src/',
    dist: './dist/',
    tmp: './.tmp/',
    deploy: './public/',
	nodetpl: './node/tmpl/',
    offlineCache: './.offline/',
    imgType: '*.{jpg,jpeg,png,bmp,gif,ttf,ico,htc}',
    cssRev: './.tmp/.cssrev/',
    jsRev: './.tmp/.jsrev/',
    // jsContentRevScope: '**/*.js',
    jsContentRevScope: '',

    // compress related
    minifyHtml: 0,
    minifyImage: 0,

    // template related
    tpl: [],
    tplDefautInline: 1,
    // combine related
    concat: [],

    // offline related
    zip: 1,
    zipConf: [],
    zipName: 'offline.zip',
    zipBlacklist: [],

    // other
    akSupport: 1
};

// overwrite configs
_.extend(configs, require('./project') || {});
// overwrite user define value
if (fs.existsSync('./userdef.js')) {
    _.extend(configs, require('./userdef') || {});
}

// prepare root with subModule case
configs.cdnRoot = (configs.subMoudle === '/') ? configs.cdn : configs.cdn + configs.subMoudle;
configs.webServerRoot = (configs.subMoudle === '/') ? configs.webServer : configs.webServer + configs.subMoudle;

function isUndefined(obj) {
    return obj === void 0;
};

// global vars
var src = configs.src,
    dist = configs.dist,
    tmp = configs.tmp,
    deploy = configs.deploy,
    offlineCache = configs.offlineCache;

// default src folder options
var opt = {
    cwd: src,
    base: src
};
var distOpt = {
    cwd: dist,
    base: dist
};

// dev watch mode
var isWatching = false;

// fix tpl root
_.each(configs.concat, function(item) {
    item.include = _.map(item.include, function(inc) {
        if (inc.indexOf('tpl/') >= 0) {
            inc = dist + inc;
        } else {
            inc = src + inc;
        }
        return inc;
    });
});

// set default alloykit offline zip config
var globCdn = ['**/*.*', '!**/*.{html,ico}'];
var globWebServer = ['**/*.{html,ico}'];
var globOffline = [offlineCache+'/*.{html,ico}'];
if (configs.zip && _.isEmpty(configs.zipConf)) {
    configs.zipConf = [{
        target: configs.webServerRoot,
        include: globCdn
    }, {
        target: configs.webServerRoot,
        include: globOffline
    }];

    if (!_.isEmpty(configs.zipBlacklist)) {
        // prefix '!' to exclude
        _.map(configs.zipBlacklist, function(item) {
            return '!' + item;
        });
        // union
        _.each(configs.zipConf, function(item) {
            _.union(item.include, configs.zipBlacklist)
        });
    }
}

var customMinify = ['noop'];
var customAkFlow = ['noop'];
if (configs.minifyHtml) {
    customMinify.push('minifyHtml');
}
if (configs.minifyImage) {
    // customMinify.push('imagemin');
}
if (configs.akSupport) {
	customAkFlow.push('node');
    customAkFlow.push('alloydist:prepare');
    customAkFlow.push('offline:prepare');
    customAkFlow.push('offline:zip');
}


console.log('start to build project [' + configs.name + ']...');

function doClean(toClean) {
    var opt = {
        read: false
    };
    var cOpt = {
        force: true
    };
    return gulp.src(toClean, opt)
        .pipe(clean(cOpt));
};

// remove old or tmp files
gulp.task('clean', function() {
    return doClean([dist, tmp, deploy, offlineCache]);
});

// clean node_modules, fix windows file name to long bug..
gulp.task('cleanmod', function() {
    return doClean('./node_modules');
});

// clean all temp files
gulp.task('cleanup', function() {
    return doClean([dist, tmp, deploy, offlineCache, './.sass-cache']);
});

// clean dist temp files
gulp.task('clean-dist', function() {
    return doClean([tmp]);
});

// copy js/html from src->dist
var things2copy = ['*.{html,ico}', 'libs/**/*.*', 'js/*.js', 'js/libs/**/*.js', 'img/static/**/' + configs.imgType];
gulp.task('copy', function() {
    return gulp.src(things2copy, opt)
        .pipe(newer(dist))
        .pipe(gulp.dest(dist));
});


var node2copy = [];
if(configs.node){
    node2copy.push(configs.dist+configs.node.html);
    node2copy = node2copy.concat(configs.node.tmpl);
}
gulp.task('node',function(){
    return gulp.src(node2copy)
        .pipe(nodetmpl({
            bigpip : true,
            pack : true,
            commonjs:true,
            strict : true
        }))
        .pipe(gulp.dest(configs.nodetpl));
});

// copy and rev some images files [filename-md5.png style]
var image2copy = 'img/' + configs.imgType;
gulp.task('img-rev', function() {
    // img root 
    return gulp.src(image2copy, opt)
        .pipe(newer(dist))
        .pipe(rename(function(_path) {
            // md5 rename
            var fullpath = path.join(src, _path.dirname, _path.basename + _path.extname);
            _path.basename += '-' + md5(fs.readFileSync(fullpath)).slice(0, 8)
        }))
        .pipe(gulp.dest(dist));
});

// compile scss and auto spriting 
var scss2compile = '**/*.scss';
gulp.task('compass', function(cb) {
    return gulp.src(scss2compile, opt)
        .pipe(newer(dist))
        .pipe(compass({
            config_file: './config.rb',
            css: 'dist/css',
            sass: 'src/css',
            image: src + 'img/',
            generated_image: dist + 'img/sprite'
        }))
        .pipe(gulp.dest(dist));
});

// compile tpl 
var tpl2compile = 'tpl/**/*.html';
gulp.task('tpl', function(cb) {
    // concat js/css file
    var q = _.map(configs.tpl, function(item) {
        return function(callback) {
            gulp.src(item.include, opt)
                .pipe(newer(dist + item.target))
                .pipe(jstemplate())
                .pipe(concat(item.target))
                .pipe(gulp.dest(dist))
                .on('end', function(err) {
                    callback();
                });
        };
    });

    async.parallel(q, function(err, result) {
        cb(err, result);
    });
});

// concat files using qzmin config
var js2concat = ['**/*.js', 'tpl/**/*.html'];
gulp.task('concat', ['tpl'], function(cb) {
    // concat js/css/tpl file
    var q = _.map(configs.concat, function(item) {
        return function(callback) {
            gulp.src(item.include)
                .pipe(newer(dist + item.target))
                .pipe(concat(item.target))
                .pipe(gulp.dest(dist))
                .on('end', function() {
                    callback();
                });
        };
    });

    async.parallel(q, function(err, result) {
        cb(err, result);
    });
});

// remove tpl complie .js cache 
gulp.task('concat-clean', function(cb) {
    // remove inline 
    var q = _.map(configs.concat, function(item) {
        return function(callback) {
            item.inline = isUndefined(item.inline) ? 0 : item.inline;
            if (item.inline) {
                gulp.src(item.target, distOpt)
                    .pipe(clean())
                    .pipe(gulp.dest(tmp))
                    .on('end', function() {
                        callback();
                    });
            } else {
                callback();
            }
        };
    });

    async.parallel(q, function(err, result) {
        cb(err, result);
    });
});

// remove tpl complie .js cache 
gulp.task('tpl-clean', function(cb) {
    // remove inline 
    var q = _.map(configs.tpl, function(item) {
        return function(callback) {
            item.inline = isUndefined(item.inline) ? configs.tplDefautInline : item.inline;
            if (item.inline) {
                gulp.src(item.target, distOpt)
                    .pipe(clean())
                    .pipe(gulp.dest(tmp))
                    .on('end', function() {
                        callback();
                    });
            } else {
                callback();
            }
        };
    });

    async.parallel(q, function(err, result) {
        cb(err, result);
    });
});

// minify js and generate reversion files
// stand alone cmd to make sure all js minified
// known bug: htmlrefs 在 rev 走后，可能会不准
gulp.task('uglify', function() {
    return gulp.src('{' + dist + ',' + tmp + '}/**/*.js')
        .pipe(uglify())
        .pipe(clean())
        .pipe(rev())
        .pipe(savefile())
        .pipe(rev.manifest())
        .pipe(gulp.dest(configs.jsRev))

});

// minify css and generate reversion files
// stand alone cmd to make sure all css minified
gulp.task('minifyCss', function() {
    return gulp.src('{' + dist + ',' + tmp + '}/**/*.css')
        .pipe(minifyCss())
        .pipe(clean())
        .pipe(rev())
        .pipe(savefile())
        .pipe(rev.manifest())
        .pipe(gulp.dest(configs.cssRev))
});

// replace html js contact to seprate script inline for debug/develop
gulp.task('jsrefs', function() {
    var refOpt = {
        urlPrefix: '../',
        mapping: configs.concat
    };

    return gulp.src(dist + '*.html')
        .pipe(jsrefs(refOpt))
        .pipe(gulp.dest(dist));
});

// replace html/js/css reference resources to new md5 rev version
// inline js to html, or base64 to img
gulp.task('htmlrefs', ['htmlrefsOffline'],function(cb) {
    var mapping;
    var jsRev = configs.jsRev + 'rev-manifest.json';
    var cssRev = configs.cssRev + 'rev-manifest.json';
    if (fs.existsSync(jsRev) && fs.existsSync(cssRev)) {
        mapping = _.extend(
            require(jsRev),
            require(cssRev)
        );
    }

    var refOpt = {
        urlPrefix: configs.cdnRoot,
        scope: [dist, tmp],
        mapping: mapping
    };

    var tasks = [];

    if (configs.jsContentRevScope) {
        var jsRefTask = function(callback) {
            gulp.src(configs.jsContentRevScope, distOpt)
                .pipe(htmlrefs(refOpt))
                .pipe(gulp.dest(dist))
                .on('end', function() {
                    callback();
                });
        };
        tasks.push(jsRefTask);
    }

    var htmlRefTask = function(callback) {
        gulp.src(dist + '*.html')
            .pipe(htmlrefs(refOpt))
            .pipe(gulp.dest(dist))
            .on('end', function() {
                callback();
            });
    };
    tasks.push(htmlRefTask);

    async.series(tasks, function(err, result) {
        cb(err, result);
    });
});

gulp.task('htmlrefsOffline',function(){
    var mapping;
    var jsRev = configs.jsRev + 'rev-manifest.json';
    var cssRev = configs.cssRev + 'rev-manifest.json';
    if (fs.existsSync(jsRev) && fs.existsSync(cssRev)) {
        mapping = _.extend(
            require(jsRev),
            require(cssRev)
        );
    }

    var urlObj = url.parse(configs.webServerRoot);
    var target = path.join(offlineCache, urlObj.hostname, urlObj.pathname);

    var refOptOffline = {
        urlPrefix: configs.webServer,
        scope: [dist],
        mapping: mapping
    };    

    //configs.subModule
    return gulp.src(dist + '*.html')
        .pipe(htmlrefs(refOptOffline))
        .pipe(gulp.dest(target));      
})

gulp.task('minifyHtml', function() {
    return gulp.src(src + '*.html')
        .pipe(minifyHtml({
            empty: true
        }))
        .pipe(savefile());
});

gulp.task('noop', function(cb) {
    cb();
});

// gulp.task('imagemin', function() {
//     return gulp.src(src + '**/' + configs.imgType)
//         .pipe(imagemin())
//         .pipe(savefile());
// });

// alloydist intergration task, build files to public folder
// html -> public/webserver/**
// cdn -> public/cdn/**
gulp.task('alloydist:prepare', function(cb) {
    var deployGroup = [{
        target: deploy + 'cdn/' + configs.subMoudle,
        include: globCdn
    }, {
        target: deploy + 'webserver/' + configs.subMoudle,
        include: globWebServer
    }];

    var q = _.map(deployGroup, function(item) {
        return function(callback) {
            gulp.src(item.include, distOpt)
                .pipe(gulp.dest(item.target))
                .on('end', function() {
                    callback();
                });
        };
    });

    async.parallel(q, function(err, result) {
        cb(err, result);
    });
});

// prepare files to package to offline zip for alloykit
gulp.task('offline:prepare', function(cb) {
    var q = _.map(configs.zipConf, function(item) {
        return function(callback) {
            var urlObj = url.parse(item.target);
            var target = path.join(offlineCache, urlObj.hostname, urlObj.pathname);
            gulp.src(item.include, distOpt)
                .pipe(gulp.dest(target))
                .on('end', function() {
                    callback();
                });
        };
    });

    async.parallel(q, function(err, result) {
        cb(err, result);
    });
});

// package .offline -> offline.zip for alloykit
gulp.task('offline:zip', ['offline:prepare'],function() {
    return gulp.src('**/*.*', {
            cwd: offlineCache
        })
        .pipe(zip(configs.zipName))
        .pipe(gulp.dest(deploy + 'offline'));
});


var apiData = {
    did: configs.distId,
    opUser: configs.opUser,
    token: configs.token
};
// alloydist -> deloy test env
gulp.task('testenv', function() {
    // test env
    request.post('http://jb.oa.com/dist/api/go', {
        form: apiData
    }, function(err, resp, body) {
        var data = JSON.parse(body);
        console.log(data);
    });
});

// alloydist -> prebuild and create ars publish order
gulp.task('ars', function() {
    // publish ars
    request.post('http://jb.oa.com/dist/api/ars', {
        form: apiData
    }, function(err, resp, body) {
        var data = JSON.parse(body);
        console.log(data);
    });
});

// alloydist -> prebuild and auto post offline zip
gulp.task('offline', function(cb) {
    // publish offline zip
    request.post('http://jb.oa.com/dist/api/offline', {
        form: apiData
    }, function(err, resp, body) {
        var data = JSON.parse(body);
        console.log(data);
    });
});

// support local replacement & livereload
gulp.task('liveproxy', function() {

});

gulp.task('watch:set', function() {
    isWatching = true;
});

gulp.task('watch', function() {
    gulp.watch(things2copy, opt, ['copy']);
    gulp.watch(image2copy, opt, ['img-rev']);
    gulp.watch(scss2compile, opt, ['compass']);
    gulp.watch(js2concat, opt, ['concat']);
	gulp.watch(node2copy, ['node']);
});

gulp.task('dev', function(cb) {
    runSequence(['clean', 'watch:set'], ['copy', 'img-rev', 'compass'], ['concat', 'jsrefs','node'], 'watch', cb);
});

gulp.task('dist', function(cb) {
    runSequence(
        'clean', ['copy', 'img-rev', 'compass'],
        'concat', ['tpl-clean', 'concat-clean'], ['uglify', 'minifyCss'],
        'htmlrefs',
        customMinify,
        customAkFlow,
        'clean-dist',
        cb);
});

gulp.task('default', ['dev']);
