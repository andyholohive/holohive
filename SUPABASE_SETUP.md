# Supabase Authentication Setup Guide

## Prerequisites
- A Supabase account (free at https://supabase.com)
- Your KOL Campaign Manager project

## Step 1: Create a Supabase Project

1. Go to [https://app.supabase.com/](https://app.supabase.com/)
2. Click "New Project"
3. Choose your organization
4. Fill in project details:
   - Project name: `kol-campaign-manager` (or any name you prefer)
   - Database password: Create a strong password
   - Region: Choose the closest to your users
5. Click "Create new project"
6. Wait for the project to be ready (usually 1-2 minutes)

## Step 2: Get Your Project Credentials

1. In your Supabase dashboard, go to **Settings** > **API**
2. You'll see two important values:
   - **Project URL**: Something like `https://abcdefgh.supabase.co`
   - **anon/public key**: A long string starting with `eyJ...`

## Step 3: Configure Environment Variables

1. In your project root, create a file called `.env.local`
2. Add the following content, replacing the placeholder values:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

## Step 4: Set Up the Users Table

The app uses a custom `users` table to store additional user information beyond what Supabase Auth provides.

1. In your Supabase dashboard, go to **SQL Editor**
2. Copy and paste the SQL from `sql/001_create_users_table.sql` file in your project
3. Click **Run** to execute the migration

**What this creates:**
- A `users` table linked to Supabase Auth users
- Automatic triggers to create user records when someone signs up
- Row Level Security (RLS) policies for data protection
- User roles: admin, member, client

## Step 5: Configure Authentication Settings (Optional)

1. In Supabase dashboard, go to **Authentication** > **Settings**
2. Configure your app settings:
   - **Site URL**: `http://localhost:3000` (for development)
   - **Redirect URLs**: Add `http://localhost:3000/**` (for development)
3. For production, update these URLs to your live domain

## Step 6: Test Your Setup

1. Build your project: `npm run build`
2. Start the development server: `npm run dev`
3. Go to `http://localhost:3000/auth`
4. Try creating an account with all fields (including role selection)
5. After signup, check the `users` table in Supabase to see the created record
6. Log in and verify that your name and role appear in the header

## Authentication Features Included

✅ **Email/Password Authentication**
- User registration with email verification
- Secure login/logout
- Password reset (configurable in Supabase)

✅ **Custom User Profiles**
- Extended user table with name, role, and status
- Automatic user record creation on signup
- Role-based access control (admin, member, client)
- User activation/deactivation

✅ **Protected Routes**
- Automatic redirect to login page for unauthenticated users
- Session management with React Context
- User profile data loading

✅ **User Interface**
- Clean, responsive auth forms with role selection
- Loading states and error handling
- Toggle between login and signup
- User name and role display in header

✅ **Security Features**
- Row Level Security (RLS) policies
- Client-side session management
- Automatic token refresh
- Secure logout with profile cleanup

## Customization Options

### Email Templates
Go to **Authentication** > **Email Templates** in Supabase to customize:
- Welcome email
- Email confirmation
- Password reset email

### Database Schema
The default user schema includes:
- `email`
- `user_metadata` (for first_name, last_name, etc.)
- `created_at`
- `updated_at`

You can extend this by adding custom tables linked to the user's `id`.

## Troubleshooting

### Build Errors
- Make sure `.env.local` exists and has correct values
- Ensure no spaces around the `=` in environment variables

### Authentication Not Working
- Check that your Site URL and Redirect URLs are configured correctly
- Verify that email confirmation is enabled/disabled as desired
- Check browser console for error messages

### Production Deployment
- Update Site URL and Redirect URLs in Supabase dashboard
- Set environment variables in your hosting platform
- Test authentication flows in production environment

## Next Steps

With authentication set up, you can now:
1. Add user-specific data to your campaigns
2. Implement role-based access control
3. Add social authentication (Google, GitHub, etc.)
4. Set up row-level security (RLS) policies
5. Add user profiles and preferences

Need help? Check the [Supabase documentation](https://supabase.com/docs) or create an issue in this project. 