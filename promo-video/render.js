const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

async function renderVideo() {
  console.log('启动Chrome...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });
  
  // 加载HTML
  const htmlPath = path.join(__dirname, 'index.html');
  await page.goto(`file://${htmlPath}`);
  
  // 等待页面加载
  await page.waitForTimeout(1000);
  console.log('页面加载完成');
  
  // 生成视频帧
  const outputPath = path.join(__dirname, 'output.mp4');
  
  // 使用ffmpeg从截图生成视频
  const ffmpeg = spawn('ffmpeg', [
    '-f', 'image2pipe',
    '-framerate', '30',
    '-i', '-',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-y',
    outputPath
  ]);
  
  // 截图60帧，每帧间隔1秒（对应60秒视频）
  for (let i = 0; i < 60; i++) {
    const screenshot = await page.screenshot({ type: 'png' });
    ffmpeg.stdin.write(screenshot);
    await page.waitForTimeout(16); // 约60fps
  }
  
  ffmpeg.stdin.end();
  
  ffmpeg.on('close', async (code) => {
    console.log('视频生成完成:', outputPath);
    await browser.close();
  });
}

renderVideo().catch(console.error);
