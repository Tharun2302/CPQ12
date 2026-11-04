const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Server-to-server converter: no browser origin should call it, so no CORS headers are sent.
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/temp/input');
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = file.originalname;
    cb(null, `${timestamp}-${originalName}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'LibreOffice Converter',
    timestamp: new Date().toISOString()
  });
});

// Convert DOCX to PDF
app.post('/convert', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputPath = req.file.path;
  const inputFileName = path.basename(inputPath);
  const outputDir = '/temp/output';
  const outputName = path.basename(inputFileName, path.extname(inputFileName)) + '.pdf';
  const outputPath = path.join(outputDir, outputName);

  console.log('🔄 Converting:', inputFileName, 'to', outputName);

  // Use LibreOffice headless mode to convert
  const command = `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;

  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Conversion error:', error);
      return res.status(500).json({ 
        error: 'Conversion failed', 
        details: error.message,
        stderr: stderr
      });
    }

    if (stderr) {
      console.warn('⚠️ Conversion warnings:', stderr);
    }

    console.log('📄 Conversion output:', stdout);

    // Check if output file exists
    if (fs.existsSync(outputPath)) {
      console.log('✅ Conversion successful:', outputPath);
      
      // Send the PDF file
      res.download(outputPath, outputName, (err) => {
        if (err) {
          console.error('❌ Download error:', err);
          res.status(500).json({ error: 'Failed to send file' });
        } else {
          console.log('📤 File sent successfully');
          
          // Clean up files after a delay
          setTimeout(() => {
            try {
              if (fs.existsSync(inputPath)) {
                fs.unlinkSync(inputPath);
                console.log('🗑️ Cleaned up input file:', inputPath);
              }
              if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
                console.log('🗑️ Cleaned up output file:', outputPath);
              }
            } catch (cleanupError) {
              console.warn('⚠️ Cleanup error:', cleanupError);
            }
          }, 10000); // 10 second delay
        }
      });
    } else {
      console.error('❌ Output file not created:', outputPath);
      res.status(500).json({ 
        error: 'Conversion failed - output file not created',
        inputPath,
        outputPath,
        stdout,
        stderr
      });
    }
  });
});

// Convert with custom options
app.post('/convert-advanced', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputPath = req.file.path;
  const inputFileName = path.basename(inputPath);
  const outputDir = '/temp/output';
  const outputName = path.basename(inputFileName, path.extname(inputFileName)) + '.pdf';
  const outputPath = path.join(outputDir, outputName);

  // Get conversion options from request body
  const { 
    quality = 'high',
    compress = true,
    embedFonts = true 
  } = req.body;

  console.log('🔄 Advanced conversion:', inputFileName, 'with options:', { quality, compress, embedFonts });

  // Build LibreOffice command with options
  let command = `libreoffice --headless --convert-to pdf --outdir "${outputDir}"`;
  
  if (quality === 'high') {
    command += ' --infilter="writer_pdf_Export"';
  }
  
  command += ` "${inputPath}"`;

  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Advanced conversion error:', error);
      return res.status(500).json({ 
        error: 'Advanced conversion failed', 
        details: error.message,
        stderr: stderr
      });
    }

    if (fs.existsSync(outputPath)) {
      console.log('✅ Advanced conversion successful:', outputPath);
      res.download(outputPath, outputName);
    } else {
      res.status(500).json({ error: 'Advanced conversion failed - output file not created' });
    }
  });
});

// List supported formats
app.get('/formats', (req, res) => {
  res.json({
    supportedInputFormats: [
      'docx', 'doc', 'odt', 'rtf', 'txt',
      'xlsx', 'xls', 'ods', 'csv',
      'pptx', 'ppt', 'odp'
    ],
    outputFormats: ['pdf'],
    service: 'LibreOffice Converter'
  });
});

app.listen(port, () => {
  console.log('🚀 LibreOffice conversion service running on port', port);
  console.log('📋 Health check: http://localhost:' + port + '/health');
  console.log('🔄 Convert endpoint: POST http://localhost:' + port + '/convert');
  console.log('📄 Supported formats: GET http://localhost:' + port + '/formats');
});
