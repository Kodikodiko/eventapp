# Deploying Your Next.js Application

This guide will walk you through the process of deploying your Next.js application so it can be accessed publicly on the internet.

## 1. Build Your Application for Production

Before you can deploy your application, you need to create a production-ready build. This process optimizes your code, bundles your assets, and prepares everything for efficient delivery.

To build your application, run the following command in your project's terminal:

```bash
npm run build
```

This command will create an optimized build of your application in the `.next` directory.

## 2. Running the Production Server

After the build process is complete, you can start the production server. This server is highly optimized and should be used for hosting your live application.

To start the production server, run:

```bash
npm run start
```

By default, this will start the server on port 3000. You can now access your production-ready app locally at `http://localhost:3000`.

## 3. Hosting Your Application

To make your application accessible to the world, you need to run it on a hosting service. Here are a few common options:

### Option A: Vercel (Recommended)

Vercel is the company behind Next.js, and their platform is the easiest and most optimized way to deploy Next.js applications.

1.  **Push your code to a Git provider** (like GitHub, GitLab, or Bitbucket).
2.  **Sign up for a Vercel account** at [vercel.com](https://vercel.com).
3.  **Import your Git repository** into Vercel.
4.  Vercel will automatically detect that it's a Next.js project, build it, and deploy it. It will also automatically re-deploy your application every time you push new changes to your repository.

### Option B: Self-Hosting on a Server (e.g., VPS)

If you prefer to manage your own infrastructure, you can host your application on a Virtual Private Server (VPS) from providers like DigitalOcean, Linode, AWS, or Google Cloud.

To do this, you will need to:

1.  **Set up your server**: Make sure your server has **Node.js** (version 18.x or later) installed.
2.  **Copy your project files** to the server.
3.  **Install dependencies**: In your project directory on the server, run `npm install`.
4.  **Build your application**: Run `npm run build`.
5.  **Start the server**: Run `npm run start`.

To keep your application running continuously, it's recommended to use a process manager like `pm2`.

**Example using `pm2`:**

```bash
# Install pm2 globally
npm install -g pm2

# Start your Next.js app
pm2 start npm --name "next-app" -- start

# To see logs
pm2 logs next-app
```

You will also need to configure a web server like **Nginx** or **Apache** to act as a reverse proxy, directing traffic from port 80 (HTTP) or 443 (HTTPS) to your running Next.js application (e.g., on port 3000).
