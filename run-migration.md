# Quick Database Migration Guide

## Add Notes Field to list_kols Table

Since the Supabase CLI isn't working, you need to run this manually in your Supabase dashboard:

### Step 1: Go to Supabase Dashboard
1. Open your Supabase project dashboard
2. Navigate to the **SQL Editor** in the left sidebar

### Step 2: Run the Migration
Copy and paste this SQL command into the SQL Editor:

```sql
ALTER TABLE list_kols ADD COLUMN notes TEXT;
```

### Step 3: Execute
Click the **Run** button to execute the command.

### Step 4: Verify
You can verify the migration worked by running:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'list_kols' AND column_name = 'notes';
```

## What This Enables

After running this migration:
- ✅ KOL notes field will work in the view list dialog
- ✅ Notes will be saved to the database
- ✅ Notes will appear in shared list pages
- ✅ Inline editing will work properly

## Features Now Available

1. **Editable KOL Notes**: Click on notes field in view list to edit
2. **Inline Editing**: Same styling as KOLs page description field
3. **Public Shared Lists**: No authentication required, no sidebar
4. **Real-time Updates**: Notes save immediately on blur or Enter key
