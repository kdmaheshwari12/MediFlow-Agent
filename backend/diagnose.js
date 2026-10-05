import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const API_URL = 'http://localhost:4000/api/v1';

async function run() {
  console.log("=== DB checks ===");
  // We can query Supabase directly as service_role for DB checks
  const adminDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { count: dpCount } = await adminDb.from('doctor_profiles').select('*', { count: 'exact', head: true });
  console.log('doctor_profiles count:', dpCount);

  const { data: dSpecs } = await adminDb.from('doctor_specializations').select('*');
  console.log('doctor_specializations count:', dSpecs?.length);
  if (dSpecs?.length) console.log('Sample dSpec:', dSpecs[0]);

  const { data: dAvail } = await adminDb.from('doctor_availability').select('*');
  console.log('doctor_availability count:', dAvail?.length);
  if (dAvail?.length) console.log('Sample dAvail:', dAvail[0]);

  // To check API, let's login as a staff user (if any exists in seed, maybe test_staff@mediflow.com? or we can create one).
  // Actually, we can just grab an existing user and generate a JWT, or we can use admin to create a fast user.
  const { data: { user }, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'staff@example.com', // Need to know seed data. Let's list users.
    password: 'password123'
  });

  let token = null;

  if (authErr) {
    const { data: users } = await adminDb.auth.admin.listUsers();
    console.log("Users:", users.users.map(u => ({ email: u.email, id: u.id, role: u.user_metadata?.role })));
    
    // Pick the first staff user
    const staff = users.users.find(u => u.user_metadata?.role === 'staff');
    if (staff) {
      console.log("Found staff user:", staff.email);
      // Wait, we don't know the password. Let's force reset it or just create a new one.
      const newStaff = await fetch(API_URL + '/auth/signup/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test_staff_2@example.com', password: 'password123', name: 'Test Staff', phone: '123456', clinic_name: 'Test Clinic' })
      }).then(r => r.json());
      console.log("Created staff:", newStaff);
      
      const login = await supabase.auth.signInWithPassword({ email: 'test_staff_2@example.com', password: 'password123' });
      token = login.data.session?.access_token;
    }
  } else {
    token = user.session?.access_token;
  }

  if (token) {
    console.log("\n=== API checks ===");
    const res1 = await fetch(`${API_URL}/specializations?withDoctors=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("GET /specializations?withDoctors=true:", res1.status, await res1.text());
    
    const res2 = await fetch(`${API_URL}/doctors`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("GET /doctors:", res2.status, await res2.text());

    // Find a doctor id
    const { data: docs } = await adminDb.from('doctor_profiles').select('id').limit(1);
    if (docs?.length) {
      const docId = docs[0].id;
      const res3 = await fetch(`${API_URL}/doctors/${docId}/availability?from=2026-10-01&to=2026-10-31`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`GET /doctors/${docId}/availability:`, res3.status, await res3.text());

      const res4 = await fetch(`${API_URL}/appointments/slots?doctorId=${docId}&date=2026-10-05`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`GET /appointments/slots:`, res4.status, await res4.text());
    }
  }

}

run().catch(console.error);
