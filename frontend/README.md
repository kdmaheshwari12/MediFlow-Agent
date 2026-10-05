# MediFlow — Clinical Operating System

A Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui clinic management frontend.

> **Note:** Demo-only mock auth. Not secure. Replace with a real auth provider before production.

---

## Features

- **Frontend Mock Authentication**: Browser-based user registration and login using `localStorage` and `Web Crypto API` (SHA-256 password hashing).
- **Two-Step Sign Up**:
  - Step 1: Role selection cards (Doctor / Receptionist), Full Name, Email, Password, Confirm Password, live password rule validation checklist, and show/hide password toggles.
  - Step 2: Role-specific details (Doctor: Phone, Specialization, Medical License Number, Years of Experience, Department; Receptionist: Phone, Employee ID, Shift, Department/Desk).
- **Role-Based Protection (`RoleGuard`)**:
  - Unauthenticated users are redirected to `/login`.
  - Doctor attempting to access `/receptionist/dashboard` (or vice versa) is redirected to `/unauthorized`.
  - Signed-in users visiting `/login` or `/signup` are redirected to their own role dashboard.
  - Back-button navigation cache protection on `pageshow`.
- **Dashboards**:
  - `/doctor/dashboard`: Doctor welcome, role badge, specialization, license number, experience, department, and Sign Out.
  - `/receptionist/dashboard`: Receptionist welcome, role badge, employee ID, shift, desk, and Sign Out.

---

## Testing Guide

1. **Doctor Sign Up Flow**:
   - Go to `/signup`.
   - Select "Doctor" card.
   - Enter Full Name, Email, Password (check live rules checklist), and Confirm Password.
   - Click **Continue** to move to Step 2.
   - Fill in Phone Number, Specialization, License Number, Experience, and Department.
   - Click **Create Account**. You will receive a success toast `"Account created successfully. Please sign in."` and be redirected to `/login?registered=1`.

2. **Receptionist Sign Up Flow**:
   - Go to `/signup`.
   - Select "Receptionist" card.
   - Enter Step 1 details and click **Continue**.
   - Fill in Phone Number, Employee ID, Shift, and Department/Desk.
   - Click **Create Account**. Verify success toast and redirect to `/login?registered=1`.

3. **Login**:
   - Enter email and password registered above.
   - Doctor logins redirect to `/doctor/dashboard`.
   - Receptionist logins redirect to `/receptionist/dashboard`.
   - Invalid credentials display `"Invalid email or password."`.

4. **Sign Out & Protection**:
   - Click **Sign Out** from the Topbar dropdown or Dashboard.
   - Session is cleared, toast notification is shown, and user is redirected to `/login`.
   - Attempting to use the browser back button re-validates session on `pageshow` and stays on `/login`.
   - As a Doctor, navigate directly to `/receptionist/dashboard` to verify redirect to `/unauthorized`.
