# Self-Hosting Guide for Home Labs (TrueNAS SCALE + Ubuntu VM)

This guide provides a detailed walkthrough for deploying the EventFlow application in a home lab environment, connecting it to an existing PostgreSQL database running on TrueNAS SCALE, and setting up a reverse proxy.

## Overview of Components

1.  **Host (TrueNAS SCALE):**
    *   Runs the Ubuntu Server VM for the application.
    *   Runs your existing **PostgreSQL Docker container** (as a TrueNAS App).
    *   Runs a Docker container for the Reverse Proxy (e.g., Nginx Proxy Manager).

2.  **Guest VM (Ubuntu 24.04):**
    *   **Node.js:** To run the Next.js application.
    *   **PM2:** A process manager to keep your Next.js application running continuously.
    *   **Git:** To download your application code.

### Component Diagram

This diagram illustrates how the different parts of the system interact.

```mermaid
graph TD
    subgraph "Home Network"
        subgraph "TrueNAS SCALE Host"
            A[Ubuntu Server VM]
            B[PostgreSQL Container]
            C[Nginx Proxy Manager Container]
        end
        subgraph "Inside Ubuntu VM"
            direction LR
            D[PM2] --> E[Next.js App]
        end
    end

    User[End User's Browser] -- "HTTPS" --> C;
    C -- "Forwards to port 3000" --> A;
    A -- "Contains" --> E
    E -- "DB Connection" --> B;

```

---

## Step 1: Prepare the Ubuntu 24.04 VM

On your freshly installed Ubuntu Server 24.04 VM, you need to install the software required to run the Node.js application. Connect to your VM via SSH.

### 1.1 Install Git and Build Tools
```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install git and other essentials
sudo apt install -y git build-essential
```
### 1.2 Install Node.js using NVM

We'll use Node Version Manager (nvm) to easily manage Node.js versions.

```bash
# Download and install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load nvm into your current shell session
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$N_DIR/bash_completion"

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

## Step 2: Prepare the Database Connection

This guide assumes you already have a PostgreSQL database running as a container/App on your TrueNAS SCALE machine.

You will need the following information:
*   **TrueNAS IP Address:** The IP address of your TrueNAS server (e.g., `192.168.1.10`).
*   **PostgreSQL Port:** The external port your PostgreSQL container is mapped to on TrueNAS (e.g., `5432`).
*   **Database Name:** The name of the database you want to use (e.g., `eventflow_prod`).
*   **Database User & Password:** The credentials to access your database.

Ensure your database is configured to accept connections from your Ubuntu VM's IP address.

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
# Create a .env.local file in your project root with the correct connection string.
# Replace the placeholders with your actual database details.
echo "DATABASE_URL=\"postgresql://<DB_USER>:<DB_PASSWORD>@<TRUENAS_IP>:<DB_PORT>/<DB_NAME>\"" > .env.local

# Example:
# echo "DATABASE_URL=\"postgresql://eventflow_user:password123@192.168.1.10:5432/eventflow_prod\"" > .env.local

# NOTE: The application code currently uses mock data and MUST be updated
# to connect to this database. This is a future development step.

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
2.  Search for `nginx-proxy-manager` and install it (if you haven't already).
3.  During installation, ensure the web UI ports (e.g., 80, 443, 81) are configured correctly and don't conflict with other TrueNAS services.

### 4.2 Configure the Proxy Host
1.  Access the Nginx Proxy Manager web interface (usually at `http://<your-truenas-ip>:81`).
2.  Log in with the default credentials (`admin@example.com` / `changeme`) and change your password immediately.
3.  Go to `Hosts` -> `Proxy Hosts` and click `Add Proxy Host`.
4.  **Details Tab:**
    *   **Domain Names:** Enter the domain you want to use (e.g., `eventflow.yourdomain.com`).
    *   **Scheme:** `http`
    *   **Forward Hostname / IP:** Enter the IP address of your **Ubuntu VM**.
    *   **Forward Port:** `3000` (the port your Next.js app is running on).
    *   Enable `Block Common Exploits`.
5.  **SSL Tab:**
    *   Select `Request a new SSL Certificate` to get a free Let's Encrypt certificate (this requires ports 80/443 to be forwarded from your router to TrueNAS).
    *   Enable `Force SSL` and `HTTP/2 Support`.
6.  Click **Save**.

Your reverse proxy is now configured. When you access `https://eventflow.yourdomain.com`, the request will be securely forwarded to your Next.js application running inside the Ubuntu VM.
