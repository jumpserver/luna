module.exports = function(grunt) {
    // grunt配置
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        concat: {
            options: {
                separator: ';\n'
            },
            dist: {
                src: [
                    'node_modules/jquery/dist/jquery.min.js',
                    'luna/src/js/jquery-ui.min.js',
                    'luna/src/js/logo.js',
                    'luna/src/js/term.js',
                    'node_modules/jquery.fancytree/dist/jquery.fancytree-all.min.js',
                    'node_modules/jquery.fancytree/dist/jquery.fancytree.glyph.js',
                    'node_modules/ui-contextmenu/jquery.ui-contextmenu.min.js',
                    'node_modules/socket.io-client/dist/socket.io.js',
                    'node_modules/core-js/client/shim.min.js',
                    'node_modules/zone.js/dist/zone.js',
                    'node_modules/reflect-metadata/Reflect.js',
                    'node_modules/systemjs/dist/system.src.js',
                    'node_modules/rxjs/bundles/Rx.min.js',
                    'luna/src/js/layer.js',
                    'luna/src/js/config.js',
                    'node_modules/clipboard/dist/clipboard.min.js'

                ],
                dest: 'luna/src/js/main.js' //合并不压缩
            }
        },
        uglify: {
            options: {},
            dist: {
                files: {
                    'luna/src/js/main.min.js': 'luna/src/js/main.js'
                }
            }
        },
        copy: {
            main: {
                dest: 'luna/dist/main.min.js',
                src: 'luna/src/js/main.min.js'
            },
            ts: {
                files: [{
                    expand: true,
                    filter: 'isFile',
                    cwd: 'luna/src/ts',
                    src: '**',
                    dest: 'luna/dist/ts/'
                }]
            },
            fonts: {
                files: [{
                    expand: true,
                    filter: 'isFile',
                    cwd: 'luna/src/fonts',
                    src: '**',
                    dest: 'luna/dist/fonts/'
                }]
            }

        },
        // jshint: {  //检查，function.js是不是有语法错误
        //     all: ['js_s/function.js']
        // },
        cssmin: {
            combine: {
                files: { //将css_s文件夹下的css文件合成一个
                    'luna/src/css/main.css': [
                        // 'node_modules/jquery.fancytree/dist/skin-lion/ui.fancytree.min.css',
                        'luna/src/css/ui.fancytree.skin-lion.css',
                        'luna/src/css/font-awesome.css',
                        // 'css/jquery-ui.1.11.1.css',
                        'node_modules/jquery-ui/themes/base/core.css',
                        'node_modules/jquery-ui/themes/base/menu.css',
                        'node_modules/jquery-ui/themes/base/theme.css',
                        // 'node_modules/semantic-ui-css/semantic.min.css',
                        'luna/src/css/bifrost.css'

                    ]
                }
            },
            minify: {
                options: {
                    keepSpecialComments: 0,
                    /* 删除所有注释 */
                    banner: '/* Created by liuzheng */'
                },
                files: {
                    'luna/dist/main.min.css': [
                        "luna/src/css/main.css"
                    ]
                }
            }
        }
    });
    //载入concat和uglify插件，分别对于合并和压缩
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-copy');
    //注册任务
    grunt.registerTask('default', ['concat', 'uglify', 'cssmin', 'copy']);
}
