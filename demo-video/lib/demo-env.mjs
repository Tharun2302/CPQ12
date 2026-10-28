// Single source of truth for the isolated demo workspace: ports, database, people and fake customers.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEMO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_DIR = path.resolve(DEMO_DIR, '..');
export const OUT_DIR = path.join(DEMO_DIR, 'out');

export const MONGO_URI = 'mongodb://127.0.0.1:27018/';
export const DB_NAME = 'cpq_demo';
export const CONFIG_CACHE_DB = 'cpq_demo_config_cache';

export const BACKEND_PORT = 3101;
export const FRONTEND_PORT = 5273;
export const APP_URL = `http://localhost:${FRONTEND_PORT}`;
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
// The developer's own servers run here against production; the demo must never talk to them.
export const FORBIDDEN_PORTS = [3001, 5173];

export const FFMPEG_DIR = 'C:/Users/AbhilashaK/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-essentials_build/bin';
export const FFMPEG = process.env.FFMPEG || `${FFMPEG_DIR}/ffmpeg.exe`;
export const FFPROBE = process.env.FFPROBE || `${FFMPEG_DIR}/ffprobe.exe`;

export const DEMO_PASSWORD = 'Demo-Walkthrough-2026';

export const PEOPLE = {
  priya: { name: 'Priya Raman', email: 'priya.raman@demo.local', role: 'Sales rep · SMB' },
  jordan: { name: 'Jordan Lee', email: 'jordan.lee@demo.local', role: 'Sales rep · AM' },
  marcus: { name: 'Marcus Bell', email: 'marcus.bell@demo.local', role: 'Team Lead · SMB' },
  aisha: { name: 'Aisha Khan', email: 'aisha.khan@demo.local', role: 'Technical team' },
  daniel: { name: 'Daniel Ortiz', email: 'daniel.ortiz@demo.local', role: 'Legal team' },
  emma: { name: 'Emma Clarke', email: 'emma.clarke@demo.local', role: 'Customer signer · Northwind' },
  tom: { name: 'Tom Reyes', email: 'tom.reyes@demo.local', role: 'Customer reviewer · Northwind' },
};

export const TEAM_LEADS = {
  SMB: PEOPLE.marcus.email,
  AM: 'nina.shah@demo.local',
  ENT: 'oliver.grant@demo.local',
};

export const DEALS = {
  northwind: {
    dealId: '48210375',
    dealName: 'Northwind Logistics – Box to OneDrive',
    amount: '18000',
    stage: 'Contract Sent',
    contactFirst: 'Emma', contactLast: 'Clarke', contactEmail: PEOPLE.emma.email,
    company: 'Northwind Logistics',
  },
  harbor: {
    dealId: '48210391',
    dealName: 'Harbor Health Partners – Slack to Teams',
    amount: '9500',
    stage: 'Proposal',
    contactFirst: 'Ray', contactLast: 'Okafor', contactEmail: 'ray.okafor@demo.local',
    company: 'Harbor Health Partners',
  },
  brightline: {
    dealId: '48210412',
    dealName: 'Brightline Media – Overage',
    amount: '4200',
    stage: 'Proposal',
    contactFirst: 'Lena', contactLast: 'Fischer', contactEmail: 'lena.fischer@demo.local',
    company: 'Brightline Media',
  },
  lakeside: {
    dealId: '48210436',
    dealName: 'Lakeside Bank – Box, Overage and Data Sprawl',
    amount: '26000',
    stage: 'Proposal',
    contactFirst: 'Sam', contactLast: 'Patel', contactEmail: 'sam.patel@demo.local',
    company: 'Lakeside Bank',
  },
};

export function assertLocalMongo(uri) {
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(uri)) {
    throw new Error(`Refusing to touch a non-localhost database: ${uri.replace(/\/\/[^@/]*@/, '//***@')}`);
  }
}

export function demoServerEnv() {
  return {
    MONGODB_URI: MONGO_URI,
    DB_NAME,
    PORT: String(BACKEND_PORT),
    NODE_ENV: 'development',
    APP_BASE_URL: APP_URL,
    BASE_URL: APP_URL,
    ALLOWED_ORIGINS: APP_URL,
    // A dummy key keeps every email code path running; net-guard captures the mail locally.
    SENDGRID_API_KEY: 'SG.demo-local-capture-only',
    EMAIL_FROM: 'dealdesk@demo.local',
    EMAIL_FROM_NAME: 'Zenop.ai (demo)',
    ZOHO_SIGN_ENABLED: '',
    ZOHO_SIGN_POLL_ENABLED: '',
    HUBSPOT_API_KEY: '',
    OPENAI_API_KEY: '',
    TEAMS_WEBHOOK_URL: '',
    TECH_APPROVER_SIGNIN_REQUIRED: 'false',
    // Edit for RedLine: the local OnlyOffice container (docker-compose, port 3003) fetches the DOCX from the demo backend.
    ONLYOFFICE_PUBLIC_URL: 'http://localhost:3003',
    ONLYOFFICE_INTERNAL_URL: 'http://localhost:3003',
    ONLYOFFICE_JWT_SECRET: '',
    BACKEND_CALLBACK_URL: `http://host.docker.internal:${BACKEND_PORT}`,
    SEED_TEMPLATES_ON_STARTUP: 'false',
    EXHIBITS_SYNC_DIR: 'demo-video/out/exhibit-sync',
    APPROVAL_ADMIN_EMAILS: '',
    LOG_FILE: path.join(OUT_DIR, 'server.log'),
  };
}
