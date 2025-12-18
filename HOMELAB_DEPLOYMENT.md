# Self-Hosting Guide for Home Labs (TrueNAS SCALE + Ubuntu VM)

This guide provides a detailed walkthrough for deploying the EventFlow application, including a database and a reverse proxy, in a home lab environment using TrueNAS SCALE and an Ubuntu VM.

## Overview of Components

1.  **Host (TrueNAS SCALE):**
    *   Runs the Ubuntu Server VM.
    *   Runs a Docker container for the Reverse Proxy (e.g., Nginx Proxy Manager).

2.  **Guest VM (Ubuntu 24.04):**
    *   **Node.js:** To run the Next.js application.
    *   **PostgreSQL Database:** To store all application data (attendees, events, etc.). We will use Docker to run this.
    *   **PM2:** A process manager to keep your Next.js application running continuously.
    *   **Git:** To download your application code.

---

## Step 1: Prepare the Ubuntu 24.04 VM

On your freshly installed Ubuntu Server 24.04 VM, you need to install the necessary software. Connect to your VM via SSH.

### 1.1 Install Git, Docker, and Build Tools
```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install git, Docker, and other essentials
sudo apt install -y git docker.io docker-compose build-essential
```
### 1.2 Install Node.js using NVM

We'll use Node Version Manager (nvm) to easily manage Node.js versions.

```bash
# Download and install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load nvm into your current shell session
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Install and use the latest LTS version of Node.js (v20.x is recommended)
nvm install --lts
nvm use --lts

# Verify installation (should show versions for node and npm)
node -v
npm -v
```

### 1.3 Install PM2 Globally

PM2 will ensure your Next.js application restarts automatically if it crashes or after a server reboot.

```bash
npm install -g pm2
```

---

## Step 2: Set up the Database (on Ubuntu VM)

We will use Docker to run a PostgreSQL database.

### 2.1 Create a `docker-compose.yml` file
Create a file named `docker-compose.yml` in your home directory on the Ubuntu VM (`~/docker-compose.yml`):
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    container_name: eventflow-db
    restart: always
    environment:
      POSTGRES_USER: your_db_user      # Replace with your desired username
      POSTGRES_PASSWORD: your_strong_password # Replace with a strong password
      POSTGRES_DB: eventflow_prod
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
```

### 2.2 Start the Database
From the directory containing the `docker-compose.yml` file, run:
```bash
sudo docker-compose up -d
```
Your PostgreSQL database is now running.

---

## Step 3: Deploy the Next.js Application (on Ubuntu VM)

### 3.1 Clone the Application Code
Clone your project repository onto the VM. If you don't have a git repository yet, you'll need to copy the files over manually (using `scp` for example).

```bash
# Clone your project from GitHub/GitLab etc.
git clone <your-repository-url>
cd <your-project-folder>
```

### 3.2 Install Dependencies and Build the App
```bash
# Install all required npm packages
npm install

# IMPORTANT: Configure Database Connection
# You will need to create a .env.local file in your project root
# and add the database connection string.
# NOTE: The application code currently uses mock data and MUST be updated
# to connect to this database. This is a future development step.
echo "DATABASE_URL=\"postgresql://your_db_user:your_strong_password@localhost:5432/eventflow_prod\"" > .env.local

# Create the production build
npm run build
```

### 3.3 Start the Application with PM2
```bash
# Start the app. PM2 will run it on port 3000 by default.
pm2 start npm --name "eventflow-app" -- start

# Save the current process list to be resurrected on reboot
pm2 save

# Enable the startup script for PM2
# This will output a command you need to copy and run to register pm2 as a startup service.
pm2 startup
```
Your application is now running on the Ubuntu VM on port 3000.

---

## Step 4: Configure the Reverse Proxy (on TrueNAS SCALE)

The final step is to direct traffic from your home network to the Ubuntu VM. We'll use a Docker container on TrueNAS for this. Nginx Proxy Manager is a great, easy-to-use option.

### 4.1 Install Nginx Proxy Manager on TrueNAS
1.  Go to the "Apps" section in TrueNAS SCALE.
2.  Search for `nginx-proxy-manager` and install it.
3.  During installation, ensure the web UI ports (e.g., 80, 443, 81) are configured correctly and don't conflict with other TrueNAS services.

### 4.2 Configure the Proxy Host
1.  Access the Nginx Proxy Manager web interface (usually at `http://<your-truenas-ip>:81`).
2.  Log in with the default credentials (`admin@example.com` / `changeme`) and change your password immediately.
3.  Go to `Hosts` -> `Proxy Hosts` and click `Add Proxy Host`.
4.  **Details Tab:**
    *   **Domain Names:** Enter the domain you want to use (e.g., `eventflow.yourdomain.com`).
    *   **Scheme:** `http`
    *   **Forward Hostname / IP:** Enter the IP address of your Ubuntu VM.
    *   **Forward Port:** `3000` (the port your Next.js app is running on).
    *   Enable `Block Common Exploits`.
5.  **SSL Tab:**
    *   Select `Request a new SSL Certificate` to get a free Let's Encrypt certificate (this requires ports 80/443 to be forwarded from your router to TrueNAS).
    *   Enable `Force SSL` and `HTTP/2 Support`.
6.  Click **Save**.

Your reverse proxy is now configured. When you access `https://eventflow.yourdomain.com`, the request will be securely forwarded to your Next.js application running inside the Ubuntu VM.