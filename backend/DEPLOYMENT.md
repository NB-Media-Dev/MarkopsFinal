# MarkOps Deployment Guide

This guide details how to deploy the **MarkOps** full-stack platform:
- **Backend API & Real-time Server**: Render, Railway, or any Cloud PaaS / Docker host
- **Frontend SPA**: Vercel or Netlify
- **Database**: Cloud MySQL (Aiven, TiDB Cloud, Railway, PlanetScale, or Clever Cloud)

---

## 📋 Pre-Deployment Checklist

1. [ ] Cloud MySQL Database URL ready
2. [ ] GitHub/GitLab repository pushed
3. [ ] Node.js 20+ compatible runtime

---

## Part 1: Setup Cloud MySQL Database

If you don't already have a cloud MySQL database:
1. Sign up at [Aiven](https://aiven.io) (Free Tier MySQL) or [TiDB Cloud](https://tidbcloud.com) (Serverless MySQL) or create a MySQL service on [Railway](https://railway.app).
2. Copy your connection URL in the format:
   ```text
   mysql://<user>:<password>@<host>:<port>/<database_name>?sslmode=require
   ```
3. Run the schema migrations from your local computer:
   ```bash
   cd backend
   DATABASE_URL="your-cloud-database-url" npm run db:push
   ```

---

## Part 2: Deploy Backend (Render or Railway)

### Option A: Deploy on [Render.com](https://render.com) (Recommended)

1. Log into **Render** and click **New +** -> **Web Service**.
2. Connect your Git repository.
3. Configure the service:
   - **Name**: `markops-api`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npx prisma generate --schema=prisma/schema.prisma`
   - **Start Command**: `node server/index.js`
4. Add **Environment Variables**:
   | Variable | Value | Description |
   |---|---|---|
   | `DATABASE_URL` | `mysql://...` | Cloud MySQL connection string |
   | `PORT` | `4000` | Express listening port |
   | `NODE_ENV` | `production` | Environment mode |
   | `JWT_ACCESS_SECRET` | `your-secure-random-string` | JWT access key |
   | `JWT_REFRESH_SECRET` | `your-secure-random-string` | JWT refresh key |
   | `FRONTEND_URL` | `https://your-frontend.vercel.app` | (Update once frontend is deployed) |
5. Click **Create Web Service**.
6. Copy your backend URL (e.g., `https://markops-api.onrender.com`).

---

### Option B: Deploy on [Railway.app](https://railway.app)

1. Click **New Project** -> **Deploy from GitHub repo**.
2. Select your repository.
3. Under service settings:
   - **Root Directory**: `/backend`
   - Set environment variables (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `PORT=4000`).
4. Click **Deploy** and generate a public domain under **Networking**.

---

## Part 3: Deploy Frontend (Vercel or Netlify)

### Option A: Deploy on [Vercel](https://vercel.com) (Recommended)

1. Log into **Vercel** and click **Add New...** -> **Project**.
2. Select your Git repository.
3. In the project setup screen:
   - **Framework Preset**: `Other`
   - **Root Directory**: Click `Edit` and select **`frontend`**
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/project-name/browser`
4. Expand **Environment Variables** and add:
   | Key | Value |
   |---|---|
   | `BACKEND_URL` | `https://markops-api.onrender.com` |
5. Click **Deploy**.
6. Vercel will build and serve your Angular application at `https://<your-project>.vercel.app`.

---

### Option B: Deploy on [Netlify](https://netlify.com)

1. Log into **Netlify** and click **Add new site** -> **Import an existing project**.
2. Select your repository.
3. In build settings:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist/project-name/browser`
4. Under **Environment variables**, set `BACKEND_URL` to your backend URL.
5. Click **Deploy site**.

---

## Part 4: Final Link & Verification

1. Go back to your **Backend Service** (Render/Railway).
2. Set or update the `FRONTEND_URL` environment variable to your live Vercel/Netlify URL:
   ```env
   FRONTEND_URL=https://your-markops-app.vercel.app
   ```
3. Open your live frontend application in the browser:
   - Login with default administrator credentials:
     - **Email**: `admin@markops.io`
     - **Password**: `admin123`
