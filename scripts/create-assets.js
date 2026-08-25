const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 1x1 valid PNG
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const buf = Buffer.from(base64Png, 'base64');

['icon.png', 'adaptive-icon.png', 'splash.png', 'favicon.png'].forEach(f => {
  fs.writeFileSync(path.join(assetsDir, f), buf);
});

console.log('Assets created successfully');
