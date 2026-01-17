# Supabase Storage Setup Instructions

## 🎯 Goal
Set up Supabase Storage for meal photo uploads in SociusFit.

---

## 📋 Step-by-Step Instructions

### **Step 1: Create the Storage Bucket**

1. **Go to Supabase Dashboard**
   - Open: https://supabase.com/dashboard
   - Select your SociusFit project

2. **Navigate to Storage**
   - Click **"Storage"** in the left sidebar
   - Click **"Create a new bucket"** button

3. **Configure the Bucket**
   - **Name:** `meal-photos`
   - **Public bucket:** ❌ OFF (keep it private)
   - **Allowed MIME types:** 
     - `image/jpeg`
     - `image/png`
     - `image/jpg`
   - **File size limit:** `31457280` (30MB in bytes)
   - Click **"Create bucket"**

---

### **Step 2: Set Up Storage Policies**

1. **Go to SQL Editor**
   - Click **"SQL Editor"** in the left sidebar
   - Click **"New query"**

2. **Run the Storage Setup Script**
   - Copy the entire contents of `setup-supabase-storage.sql`
   - Paste into the SQL Editor
   - Click **"Run"** or press `Ctrl+Enter`

3. **Verify Success**
   - You should see: "Success. No rows returned"
   - Check the verification queries at the bottom show the policies

---

### **Step 3: Test the Setup**

1. **Try uploading a photo in the app**
   - Go to Food Progress page
   - Click camera button
   - Take/select a photo
   - Upload should work!

2. **Check Storage in Dashboard**
   - Go to **Storage → meal-photos**
   - You should see a folder structure: `meals/{your-user-id}/`
   - Your uploaded photo should be there

---

## 🔍 Troubleshooting

### **Issue: "Bucket already exists" error**
**Solution:** The bucket was already created. Skip Step 1 and go to Step 2.

### **Issue: "Permission denied" when uploading**
**Solution:** 
1. Make sure you ran the SQL script in Step 2
2. Verify you're signed in to the app
3. Check that RLS is enabled on storage.objects

### **Issue: "Policy already exists" error**
**Solution:** The policies were already created. This is fine - they'll be recreated.

### **Issue: Photos not showing up**
**Solution:**
1. Check the Storage bucket in Supabase Dashboard
2. Verify the file path: `meals/{user-id}/{filename}`
3. Check browser console for errors

---

## 📊 What Gets Created

### **Storage Bucket:**
```
meal-photos/
  └── meals/
      └── {user_id}/
          ├── 1234567890_meal.jpg
          ├── 1234567891_meal.jpg
          └── ...
```

### **Storage Policies:**
1. **Upload Policy** - Users can upload to their own folder
2. **View Policy** - Users can view their own photos
3. **Delete Policy** - Users can delete their own photos
4. **Update Policy** - Users can update their own photos

### **Security:**
- ✅ Each user can only access their own photos
- ✅ Photos are private (not publicly accessible)
- ✅ Signed URLs used for temporary access
- ✅ RLS enforced on all operations

---

## 🎯 Verification Checklist

After setup, verify:

- [ ] Bucket `meal-photos` exists in Storage
- [ ] Bucket is set to **Private** (not public)
- [ ] RLS is enabled on `storage.objects` table
- [ ] 4 storage policies exist for meal-photos
- [ ] Can upload a photo from the app
- [ ] Photo appears in Storage under `meals/{user-id}/`
- [ ] Photo URL is saved in database (`meals.photo_url`)
- [ ] Photo displays in the app

---

## 📈 Storage Limits (Free Tier)

- **Storage:** 1GB total
- **Bandwidth:** 2GB/month
- **File Size:** Up to 50MB per file
- **Requests:** Unlimited

**Estimated Capacity:**
- ~1,000 photos at 1MB each
- ~100 photos at 10MB each

---

## 🔧 Advanced Configuration (Optional)

### **Enable Automatic Image Optimization:**
Supabase can automatically optimize images. To enable:

1. Go to **Storage → meal-photos → Settings**
2. Enable **"Image transformations"**
3. This will automatically resize/compress images

### **Set Up Lifecycle Policies:**
Automatically delete old photos:

1. Go to **Storage → meal-photos → Settings**
2. Add lifecycle rule:
   - **Delete files older than:** 30 days
   - **Path prefix:** `meals/`

---

## 🆘 Need Help?

**Common Issues:**

1. **"Row Level Security" error**
   - Run the SQL script again
   - Make sure you're authenticated in the app

2. **"Bucket not found" error**
   - Create the bucket in Step 1
   - Check the bucket name is exactly `meal-photos`

3. **"File too large" error**
   - Image is over 30MB
   - App should compress automatically
   - Check image compression settings

**Still having issues?**
- Check Supabase logs: Dashboard → Logs
- Check browser console for errors
- Verify environment variables are set

---

## ✅ Success!

Once you see photos uploading and displaying in the app, you're all set! The storage is now properly configured and secured.

---

*Last Updated: January 11, 2026*
