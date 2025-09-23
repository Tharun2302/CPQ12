# LibreOffice Docker Setup for CPQ

This guide explains how to set up LibreOffice in a Docker container for high-quality DOCX to PDF conversion.

## 🚀 Quick Start

### Option 1: Using PowerShell Script (Windows)
```powershell
# Start LibreOffice Docker service
.\start-libreoffice.ps1

# Optional: Start with OnlyOffice alternative
.\start-libreoffice.ps1 --onlyoffice
```

### Option 2: Using Docker Compose Directly
```bash
# Start LibreOffice converter
docker-compose up --build -d libreoffice-converter

# Check service health
curl http://localhost:3002/health
```

### Option 3: Using OnlyOffice (Alternative)
```bash
# Start OnlyOffice Document Server
docker-compose --profile onlyoffice up -d

# Check service health
curl http://localhost:3003/health
```

## 📋 Services Overview

### LibreOffice Converter (Port 3002)
- **Purpose**: Lightweight DOCX to PDF conversion
- **Features**: Headless LibreOffice with Node.js API
- **Best for**: Simple, fast conversions
- **URL**: http://localhost:3002

### OnlyOffice Document Server (Port 3003)
- **Purpose**: Full-featured document processing
- **Features**: Advanced formatting, collaboration features
- **Best for**: Complex documents with advanced formatting
- **URL**: http://localhost:3003

## 🔧 Configuration

### Environment Variables
Create a `.env` file in your project root:

```env
# LibreOffice Docker Service
LIBREOFFICE_SERVICE_URL=http://localhost:3002

# Alternative: OnlyOffice
ONLYOFFICE_SERVICE_URL=http://localhost:3003
```

### Docker Compose Configuration
The `docker-compose.yml` includes:

- **libreoffice-converter**: Main LibreOffice service
- **onlyoffice**: Alternative OnlyOffice service (optional)
- **postgres**: Database for OnlyOffice (if using OnlyOffice)

## 📡 API Endpoints

### LibreOffice Service (Port 3002)
```
GET  /health                    # Health check
POST /convert                   # Convert DOCX to PDF
POST /convert-advanced         # Convert with custom options
GET  /formats                  # List supported formats
```

### Backend Integration (Port 3001)
```
POST /api/convert/docx-to-pdf  # Convert via LibreOffice Docker
GET  /api/libreoffice/health   # Check LibreOffice service status
```

## 🧪 Testing

### Test LibreOffice Service
```bash
# Health check
curl http://localhost:3002/health

# Test conversion
curl -X POST -F "file=@document.docx" http://localhost:3002/convert -o output.pdf
```

### Test Backend Integration
```bash
# Check backend LibreOffice integration
curl http://localhost:3001/api/libreoffice/health

# Test conversion through backend
curl -X POST -F "file=@document.docx" http://localhost:3001/api/convert/docx-to-pdf -o output.pdf
```

## 🔄 Usage in Frontend

The frontend can now use the backend conversion endpoint:

```javascript
// Convert DOCX to PDF using LibreOffice Docker
const convertDocxToPdf = async (docxFile) => {
  const formData = new FormData();
  formData.append('file', docxFile);
  
  const response = await fetch('/api/convert/docx-to-pdf', {
    method: 'POST',
    body: formData
  });
  
  if (response.ok) {
    const pdfBlob = await response.blob();
    return pdfBlob;
  } else {
    throw new Error('Conversion failed');
  }
};
```

## 🐳 Docker Commands

### Management Commands
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs libreoffice-converter

# Rebuild and restart
docker-compose up --build -d

# Remove everything (including volumes)
docker-compose down -v
```

### Debugging
```bash
# Check container status
docker ps

# Access container shell
docker exec -it cpq-libreoffice-converter sh

# View container logs
docker logs cpq-libreoffice-converter
```

## 🔧 Troubleshooting

### Common Issues

1. **Service not starting**
   ```bash
   # Check Docker is running
   docker --version
   
   # Check port availability
   netstat -an | grep 3002
   ```

2. **Conversion fails**
   ```bash
   # Check service logs
   docker-compose logs libreoffice-converter
   
   # Test service directly
   curl http://localhost:3002/health
   ```

3. **Permission issues**
   ```bash
   # Fix directory permissions
   chmod -R 755 temp-files/
   ```

### Performance Optimization

1. **Increase memory limits** in `docker-compose.yml`:
   ```yaml
   services:
     libreoffice-converter:
       deploy:
         resources:
           limits:
             memory: 2G
   ```

2. **Use SSD storage** for temp files
3. **Monitor resource usage**:
   ```bash
   docker stats cpq-libreoffice-converter
   ```

## 📊 Monitoring

### Health Checks
- **LibreOffice**: http://localhost:3002/health
- **Backend Integration**: http://localhost:3001/api/libreoffice/health

### Logs
```bash
# Real-time logs
docker-compose logs -f libreoffice-converter

# Specific service logs
docker logs cpq-libreoffice-converter
```

## 🚀 Production Deployment

### Docker Swarm
```bash
# Deploy as stack
docker stack deploy -c docker-compose.yml cpq-stack
```

### Kubernetes
```yaml
# Create Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: libreoffice-converter
spec:
  replicas: 2
  selector:
    matchLabels:
      app: libreoffice-converter
  template:
    metadata:
      labels:
        app: libreoffice-converter
    spec:
      containers:
      - name: libreoffice-converter
        image: cpq-libreoffice-converter:latest
        ports:
        - containerPort: 3000
```

## 📈 Benefits

### LibreOffice Docker vs Client-side
- ✅ **Better formatting preservation**
- ✅ **Consistent output across browsers**
- ✅ **Server-side processing**
- ✅ **No browser compatibility issues**
- ✅ **Better performance for large files**

### vs OnlyOffice
- ✅ **Lighter resource usage**
- ✅ **Faster startup**
- ✅ **Simpler setup**
- ❌ **Less advanced features**

## 🔗 Integration

The LibreOffice Docker service integrates seamlessly with your existing CPQ application:

1. **Backend**: New `/api/convert/docx-to-pdf` endpoint
2. **Frontend**: Can use backend endpoint for conversions
3. **Fallback**: Client-side conversion still available
4. **Monitoring**: Health checks and error handling included

This setup provides production-ready DOCX to PDF conversion with excellent formatting preservation!
