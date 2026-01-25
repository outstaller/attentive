---
description: How to push the Relay Server to GHCR and run it on a remote server
---

# Deploy Relay Server to GitHub Container Registry (GHCR)

## Prerequisites
1.  **GitHub Personal Access Token (PAT)**:
    -   Go to GitHub -> Settings -> Developer Settings -> Personal Access Tokens (Classic).
    -   Generate New Token -> Select `write:packages` and `read:packages` (and `repo` if private).
    -   **Copy this token**.

2.  **Environment Variables**:
    -   `GH_USERNAME`: Your GitHub username.
    -   `CR_PAT`: Your Personal Access Token.

## Step 1: Login to GHCR (Local Machine)
Run this in your terminal (PowerShell or Bash):
```bash
echo $CR_PAT | docker login ghcr.io -u $GH_USERNAME --password-stdin
```
*Replace `$CR_PAT` and `$GH_USERNAME` with your actual token and username if not set as vars.*

## Step 2: Build and Tag Image
Standard naming convention: `ghcr.io/OWNER/IMAGE_NAME:TAG`

```bash
# Build (if not already built)
docker build -t attentive-relay .

# Tag for GHCR
docker tag attentive-relay ghcr.io/YOUR_GITHUB_USERNAME/attentive-relay:latest
```
*(Make sure to lowercase your username)*

## Step 3: Push to GHCR
```bash
docker push ghcr.io/YOUR_GITHUB_USERNAME/attentive-relay:latest
```

---

## Step 4: Run on Server (Remote Machine)

1.  **Login to GHCR on the Server**:
    ```bash
    echo $CR_PAT | docker login ghcr.io -u $GH_USERNAME --password-stdin
    ```

2.  **Stop Old Container**:
    ```bash
    sudo docker stop active-relay
    sudo docker rm active-relay
    ```

3.  **Pull and Run**:
    ```bash
    # Pull latest
    sudo docker pull ghcr.io/YOUR_GITHUB_USERNAME/attentive-relay:latest

    # Run
    sudo docker run -d -p 80:3000 --restart always --name active-relay ghcr.io/YOUR_GITHUB_USERNAME/attentive-relay:latest
    ```
