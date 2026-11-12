module.exports = config => {
  config.set({
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    reporters: ['progress'],
    browsers: ['ChromeHeadless'],
    singleRun: true
  });
};
