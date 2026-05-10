
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface AccountSeed {
  email:        string
  password:     string
  role:         string
  display_name: string
  title:        string
  initials:     string
  avatar_color: string
}

// ─── Define all 13 accounts here ──────────────────────────
// Use strong, unique passwords. Store these in a password manager.
// After seeding, each user should change their password via
// the profile settings page (implement a change-password flow).

const ACCOUNTS: AccountSeed[] = [
  {
    email:        '11dnpporms.p1@gmail.com',
    password:     'DNPPOrms1',
    role:         'P1',
    display_name: 'Records Officer — P1',
    title:        'Records Officer',
    initials:     'P1',
    avatar_color: '#7c3aed',
  },
  {
    email:        '11dnpporms.p2@gmail.com',
    password:     'DNPPOrms2',
    role:         'P2',
    display_name: 'Admin Officer — P2',
    title:        'Admin Officer P2',
    initials:     'P2',
    avatar_color: '#0891b2',
  },
  {
    email:        '11dnpporms.p3@gmail.com',
    password:     'DNPPOrms3',
    role:         'P3',
    display_name: 'Admin Officer — P3',
    title:        'Admin Officer P3',
    initials:     'P3',
    avatar_color: '#0d9488',
  },
  // Note: original code had 13 accounts (admin + PD + DPDA + DPDO + P1–P9).
  // Add P10 here if needed:
  // {
  //   email:        'p10@dnppo.gov.ph',
  //   password:     'CHANGE_ME_strong_password_14!',
  //   role:         'P10',
  //   display_name: 'Admin Officer — P10',
  //   title:        'Admin Officer P10',
  //   initials:     'P10',
  //   avatar_color: '#10b981',
  // },
]

async function seedAdmins() {
  console.log('Starting admin account seed...\n')

  for (const account of ACCOUNTS) {
    console.log(`Creating: ${account.email} (${account.role})`)

    // 1. Create the auth user
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email:          account.email,
        password:       account.password,
        email_confirm:  true,   // pre-confirmed — no email needed for setup
        user_metadata:  { role: account.role },
      })

    if (authError) {
      console.error(`  ✗ Auth error for ${account.email}:`, authError.message)
      continue
    }

    const userId = authData.user.id
    console.log(`  ✓ Auth user created: ${userId}`)

    // 2. Insert the profile row
    const { error: profileError } = await admin
      .from('profiles')
      .insert({
        id:           userId,
        role:         account.role,
        display_name: account.display_name,
        title:        account.title,
        initials:     account.initials,
        avatar_color: account.avatar_color,
      })

    if (profileError) {
      console.error(`  ✗ Profile error for ${account.email}:`, profileError.message)
    } else {
      console.log(`  ✓ Profile inserted`)
    }

    console.log('')
  }

  console.log('Seed complete.')
}

seedAdmins().catch(console.error)