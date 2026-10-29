const {defineConfig}=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const localChromium=path.join(os.homedir(),'Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium');
module.exports=defineConfig({
  testDir:'./e2e',timeout:45000,expect:{timeout:10000},fullyParallel:false,workers:1,retries:0,
  reporter:[['list'],['json',{outputFile:'evidence/browser-results.json'}],['html',{outputFolder:'playwright-report',open:'never'}]],
  outputDir:'test-results',
  use:{baseURL:'http://localhost:3390',browserName:'chromium',launchOptions:fs.existsSync(localChromium)?{executablePath:localChromium}:{},viewport:{width:1440,height:1000},screenshot:'on',trace:'retain-on-failure'},
  webServer:{command:'node scripts/browser-server.cjs',url:'http://localhost:3390',timeout:120000,reuseExistingServer:false,gracefulShutdown:{signal:'SIGTERM',timeout:10000}}
});
