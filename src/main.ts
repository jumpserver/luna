import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from '@app/app.module';
import { buildTime } from './environments/build-info';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

// Build time: the Docker build moment in production, the dev-server start time
// in development (see scripts/generate-build-info.mjs). Printed as a two-tone
// badge so it stands out from other console output.
console.log(
  `%c 🚀 Luna %c Build Time: ${buildTime} %c`,
  'background:#409eff;color:#fff;padding:4px 8px;border-radius:4px 0 0 4px;font-weight:bold',
  'background:#1f2d3d;color:#67c23a;padding:4px 8px;border-radius:0 4px 4px 0;font-weight:bold',
  'background:transparent'
);

platformBrowserDynamic().bootstrapModule(AppModule);
