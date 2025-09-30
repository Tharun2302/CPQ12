# CPQ Application

A comprehensive CPQ (Configure, Price, Quote) application built with React, Node.js, and MongoDB.

## Quick Start

For deployment instructions, see the `deploymentgigitaldocker/` folder:

- **Quick Start**: `deploymentgigitaldocker/QUICK_START.md`
- **Full Guide**: `deploymentgigitaldocker/DIGITALOCEAN_DEPLOYMENT.md`
- **Deployment Scripts**: `deploymentgigitaldocker/deploy.sh` (Linux/macOS) or `deploymentgigitaldocker/deploy.ps1` (Windows)

## Features

- **Quote Management**: Create, edit, and manage customer quotes
- **Template System**: DOCX template processing with dynamic content
- **Digital Signatures**: Client signature collection and management
- **HubSpot Integration**: CRM integration for deals and contacts
- **Email System**: SendGrid integration for quote delivery
- **PDF Generation**: Convert DOCX templates to PDF
- **Authentication**: Microsoft OAuth and JWT-based auth

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express.js
- **Database**: MongoDB Atlas
- **Authentication**: Microsoft OAuth, JWT
- **Email**: SendGrid
- **Document Processing**: LibreOffice, PDF-lib
- **Deployment**: Docker, DigitalOcean

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Deployment

All deployment files are organized in the `deploymentgigitaldocker/` folder. See the deployment README for detailed instructions.