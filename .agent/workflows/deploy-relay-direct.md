---
description: Deploy Relay by copying the image file directly (No Registry/PAT needed)
---

# Deploy Relay: Direct Transfer (No Registry)

If you don't want to configure a registry (GHCR/Docker Hub), you can save the image to a file and copy it to the server.

## Step 1: Save Image to File (Local)
```powershell
# Build
docker build -t attentive-relay .

# Save to tar file
docker save -o attentive-relay.tar attentive-relay
```

## Step 2: Copy to Server (SCP)
```powershell
# Replace user/ip with your server details
scp attentive-relay.tar azureuser@algodon.eastus.cloudapp.azure.com:~/
```

## Step 3: Load on Server (Remote)
SSH into the server and run:
```bash
# Load image from file
sudo docker load -i attentive-relay.tar

# Stop old container
sudo docker stop active-relay
sudo docker rm active-relay

# Run new container
sudo docker run -d -p 80:3000 --restart always --name active-relay attentive-relay
```
