# Deploying ACT AI Tutor to Railway (Web App)

This guide gets the app running online so your son can open it in any browser.

## What You Need

1. A GitHub account (free) — https://github.com/signup
2. A Railway account (free tier) — https://railway.app
3. An LLM API key (pick one):
   - OpenAI: https://platform.openai.com/api-keys (~$5-10/month for light usage)
   - Anthropic: https://console.anthropic.com/ (similar pricing)

## Step 1: Push Code to GitHub

Open a terminal in this project folder and run:

```bash
git init
git add .
git commit -m "Initial commit - ACT AI Tutor App"
```

Then create a new repository on GitHub (https://github.com/new), name it `act-ai-tutor`, and push:

```bash
git remote add origin https://github.com/YOUR_USERNAME/act-ai-tutor.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy Backend to Railway

1. Go to https://railway.app and sign in with GitHub
2. Click **"New Project"** → **"Deploy from GitHub Repo"**
3. Select your `act-ai-tutor` repo
4. Railway will ask which folder — select **`backend`** (or set Root Directory to `backend`)
5. Click **Deploy**

### Add PostgreSQL:
1. In your Railway project, click **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Railway automatically sets the `DATABASE_URL` environment variable

### Add Redis:
1. Click **"+ New"** → **"Database"** → **"Redis"**
2. Railway automatically sets the `REDIS_URL` environment variable

### Set Environment Variables:
Click on your backend service → **"Variables"** tab → Add these:

| Variable | Value |
|----------|-------|
| `JWT_SECRET` | Any random string (e.g., run `openssl rand -hex 32` in terminal) |
| `LLM_PROVIDER` | `openai` (or `anthropic`) |
| `LLM_API_KEY` | Your API key from Step "What You Need" |
| `LLM_MODEL` | `gpt-4o-mini` (cheap and good) or `claude-3-haiku-20240307` |
| `CORS_ORIGIN` | `*` (allows all origins for now) |
| `NODE_ENV` | `production` |

### Initialize the Database:
1. Click on your PostgreSQL service in Railway
2. Go to the **"Data"** tab → **"Query"**
3. Copy the contents of `backend/src/migrations/001_create_tables.sql` and paste it there
4. Click **Run** to create all tables

### Get Your Backend URL:
After deploy succeeds, click on your backend service → **"Settings"** → look for the **Public Domain**.
It will be something like: `https://act-ai-tutor-backend-production.up.railway.app`

## Step 3: Build the Web App

On your machine, open a terminal:

```bash
cd mobile
flutter build web --dart-define=API_BASE_URL=https://YOUR-RAILWAY-URL.up.railway.app/api
```

Replace `YOUR-RAILWAY-URL` with the actual Railway URL from Step 2.

This creates the web app in `mobile/build/web/`.

## Step 4: Deploy the Web App

### Option A: Deploy to Vercel (easiest for static sites)

1. Install Vercel CLI: `npm install -g vercel`
2. Run:
```bash
cd mobile/build/web
vercel
```
3. Follow the prompts (choose defaults)
4. Vercel gives you a URL like `https://act-ai-tutor.vercel.app`

### Option B: Deploy web app to Railway too

1. In your Railway project, click **"+ New"** → **"Empty Service"**
2. Name it "frontend"
3. Set build command: `cd mobile && flutter build web --dart-define=API_BASE_URL=https://YOUR-BACKEND.up.railway.app/api`
4. Set start command: Use a static file server (add `serve` package)

### Option C: Share the folder directly

If you just want your son to use it on his laptop over your home network:

1. Install a simple HTTP server: `npm install -g serve`
2. Run: `serve mobile/build/web -l 3001`
3. Tell your son to open: `http://YOUR-IP-ADDRESS:3001` in his browser
4. (Find your IP with `ipconfig` in terminal)

## Step 5: Your Son Opens the App

Share the URL with your son. He opens it in Chrome/Edge/Safari on his laptop. That's it — no install needed.

## Costs (Free Tier)

| Service | Free Tier |
|---------|-----------|
| Railway | $5/month credit (usually enough for light use) |
| Vercel | Free for personal projects |
| OpenAI API | Pay-per-use (~$0.01 per question generated) |

## Troubleshooting

**"Cannot connect to server"**
- Check Railway dashboard — is the service running (green dot)?
- Verify the URL in the Flutter build matches your Railway domain

**"Internal server error"**
- Check Railway logs (click your service → "Logs" tab)
- Most likely: missing environment variable or database not initialized

**"Questions not generating"**
- Verify LLM_API_KEY is set correctly in Railway variables
- Check you have billing enabled on your OpenAI/Anthropic account
