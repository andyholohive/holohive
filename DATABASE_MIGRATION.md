# Database Migration Instructions

## Adding Notes Field to list_kols Table

To add the `notes` field to the `list_kols` table, you need to run the following SQL command in your Supabase database:

### Option 1: Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Run the following SQL command:

```sql
ALTER TABLE list_kols ADD COLUMN notes TEXT;
```

### Option 2: Supabase CLI (if linked)
If you have the Supabase CLI linked to your project, you can run:

```bash
npx supabase db push
```

### Option 3: Direct Database Connection
If you have direct database access, you can run:

```bash
psql -h db.supabase.co -p 5432 -d postgres -U postgres -f sql/002_add_notes_to_list_kols.sql
```

## What This Migration Does

This migration adds a `notes` field to the `list_kols` table, allowing users to:
- Add notes to individual KOLs within a list
- Edit notes directly in the view list popup
- View notes in the shared list page

## Features Added

1. **Shared List Page**: `/lists/[id]` - A public page that displays a list when someone clicks a share link
2. **Editable KOL Notes**: In the view list popup, users can now click on the notes field to edit it inline
3. **Database Schema Update**: Added `notes` field to `list_kols` table

## Testing

After running the migration:
1. Create a list with some KOLs
2. Click "View List" to see the new notes column
3. Click on the notes field to edit it
4. Click "Share List" to get a shareable link
5. Open the share link in an incognito window to test the public view
