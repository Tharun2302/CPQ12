# Docker Installation Guide for Windows

## 🐳 Installing Docker Desktop

### Option 1: Docker Desktop (Recommended)

1. **Download Docker Desktop**
   - Go to: https://www.docker.com/products/docker-desktop/
   - Download Docker Desktop for Windows
   - Run the installer as Administrator

2. **System Requirements**
   - Windows 10 64-bit: Pro, Enterprise, or Education (Build 15063 or later)
   - Windows 11 64-bit: Home or Pro
   - WSL 2 feature enabled
   - Virtualization enabled in BIOS

3. **Enable WSL 2**
   ```powershell
   # Run in PowerShell as Administrator
   dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
   dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
   ```

4. **Install WSL 2**
   ```powershell
   # Download and install WSL 2
   wsl --install
   ```

5. **Restart your computer**

6. **Verify Installation**
   ```powershell
   docker --version
   docker-compose --version
   ```

### Option 2: Docker Toolbox (Legacy)

If Docker Desktop doesn't work on your system:

1. **Download Docker Toolbox**
   - Go to: https://docs.docker.com/toolbox/toolbox_install_windows/
   - Download and install Docker Toolbox

2. **Start Docker Quickstart Terminal**
   - Launch "Docker Quickstart Terminal"
   - Wait for Docker to start

## 🚀 Alternative: Use Existing LibreOffice

If Docker is not available, you can use the existing LibreOffice installation:

### Method 1: System LibreOffice
```javascript
// In your backend, use system LibreOffice
const { exec } = require('child_process');

const convertDocxToPdf = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    const command = `libreoffice --headless --convert-to pdf --outdir "${path.dirname(outputPath)}" "${inputPath}"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(outputPath);
      }
    });
  });
};
```

### Method 2: Online Conversion Service
```javascript
// Use an online conversion service
const convertWithOnlineService = async (docxBuffer) => {
  const response = await fetch('https://api.convertapi.com/convert/docx/to/pdf', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY',
      'Content-Type': 'application/octet-stream'
    },
    body: docxBuffer
  });
  
  return response.arrayBuffer();
};
```

## 🔧 Quick Setup Without Docker

### 1. Install LibreOffice
- Download from: https://www.libreoffice.org/download/download/
- Install LibreOffice
- Add to PATH or use full path

### 2. Update Backend to Use System LibreOffice
```javascript
// In server.cjs, replace Docker service with system LibreOffice
app.post('/api/convert/docx-to-pdf', upload.single('file'), async (req, res) => {
  try {
    const inputPath = path.join(__dirname, 'temp', `input-${Date.now()}.docx`);
    const outputDir = path.join(__dirname, 'temp');
    const outputPath = path.join(outputDir, `output-${Date.now()}.pdf`);
    
    // Save uploaded file
    fs.writeFileSync(inputPath, req.file.buffer);
    
    // Convert using system LibreOffice
    const command = `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;
    
    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve();
      });
    });
    
    // Send PDF file
    res.download(outputPath);
    
    // Cleanup
    setTimeout(() => {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
    }, 5000);
    
  } catch (error) {
    res.status(500).json({ error: 'Conversion failed' });
  }
});
```

## 🧪 Testing Your Setup

### Test LibreOffice Installation
```powershell
# Check if LibreOffice is installed
libreoffice --version

# Test conversion
libreoffice --headless --convert-to pdf "input.docx"
```

### Test Backend Conversion
```bash
# Test the conversion endpoint
curl -X POST -F "file=@test.docx" http://localhost:3001/api/convert/docx-to-pdf -o output.pdf
```

## 📋 Troubleshooting

### Docker Issues
1. **Docker not starting**: Check virtualization is enabled in BIOS
2. **WSL 2 issues**: Update Windows to latest version
3. **Permission errors**: Run PowerShell as Administrator

### LibreOffice Issues
1. **Command not found**: Add LibreOffice to PATH
2. **Conversion fails**: Check file permissions and LibreOffice installation
3. **Headless mode issues**: Ensure display is available or use virtual display

## 🎯 Recommended Approach

For your current setup, I recommend:

1. **Install LibreOffice** (if not already installed)
2. **Use system LibreOffice** instead of Docker
3. **Update the backend** to use system LibreOffice
4. **Test the conversion** with your existing setup

This approach will give you the same high-quality DOCX to PDF conversion without requiring Docker installation.
