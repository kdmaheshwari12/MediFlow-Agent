# MediFlow Agent - Hospital Management System & AI Agent Platform

MediFlow is a clinical hospital management platform integrating Next.js frontend, Node.js + Fastify backend, Supabase Postgres database, and an AI agent service powered by Groq.

## Project Structure

```text
MediFlow_Agent/
├── agent/      # AI agent service (Groq AI integration, SMS drafting, follow-ups)
├── backend/    # Node.js + Fastify backend API & Supabase database migrations
└── frontend/   # Next.js 15 web application (Doctor & Receptionist portals)
```

---

## Architecture & Modules

### 1. Agent Service (`/agent`)
- **Technology Stack**: Node.js, TypeScript, Groq SDK, LangChain / LangGraph.
- **Key Features**:
  - Automated prescription summary generation.
  - Personalized SMS follow-up draft creation.
  - Multi-language support (`en`, `ur`, etc.).

### 2. Backend API (`/backend`)
- **Technology Stack**: Node.js, Fastify, Supabase Postgres, Zod, pg-boss.
- **Key Features**:
  - Role-based authorization & RLS database isolation (`doctor`, `staff`, `patient`).
  - Appointment wizard lifecycle & doctor availability rules.
  - End-to-end checkup room experience & prescription versioning.
  - Joined search endpoints for patient directory and issued prescriptions.

### 3. Frontend Web Application (`/frontend`)
- **Technology Stack**: Next.js 15 (App Router), React, Tailwind CSS, Lucide Icons, Zustand.
- **Key Features**:
  - **Receptionist Portal**: Multi-step Create Clinic Appointment wizard with `sessionStorage` persistence and confirmation screen.
  - **Doctor Portal**: Date-wise patient directory, Start Checkup experience with live queue, AI follow-up assistant panel.
  - **Issued Prescriptions Directory**: Debounced search (MRN, Name, Phone), date filters (`Asia/Karachi` timezone), printable A4 prescription slips, and instant PDF download.

---

## Quick Start Guide

### Prerequisites
- Node.js v18+
- npm or pnpm
- Supabase Postgres database instance

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/kdmaheshwari12/MediFLow-Agent.git
   cd MediFLow-Agent
   ```

2. **Setup Agent Service**:
   ```bash
   cd agent
   npm install
   cp .env.example .env
   npm run dev
   ```

3. **Setup Backend API**:
   ```bash
   cd ../backend
   npm install
   cp .env.example .env
   npx tsx scripts/migrate.ts
   npx tsx src/server.ts
   ```

4. **Setup Frontend Application**:
   ```bash
   cd ../frontend
   npm install
   cp .env.example .env.local
   npm run dev
   ```

---

## License
Licensed under the [MIT License](LICENSE).
