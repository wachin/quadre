module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    cpplint: {
      files: ['src/**/*.cc'],
      reporter: 'spec',
      verbosity: 1,
      filters: {
        build: {
          include: false,
          namespaces: false
        },
        legal: {
          copyright: false
        },
        readability: {
          braces: false
        }
      }
    },
    shell: {
      rebuild: {
        command: 'npm build .',
        options: {
          stdout: true,
          stderr: true,
          failOnError: true
        }
      },
      clean: {
        command: 'rm -fr build',
        options: {
          stdout: true,
          stderr: true,
          failOnError: true
        }
      },
      test: {
        command: 'npm test',
        options: {
          stdout: true,
          stderr: true,
          failOnError: true
        }
      }
    }
  });
    
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('node-cpplint');
  grunt.registerTask('default', ['cpplint', 'shell:rebuild']);
  grunt.registerTask('test', ['default', 'shell:test']);
  return grunt.registerTask('clean', ['shell:clean']);
};