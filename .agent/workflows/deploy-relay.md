---
description: Deploy Relay Server to Ubuntu
---

This workflow describes how to deploy the Relay Server to an Ubuntu machine.

# Prerequisites
- SSH access to the Ubuntu server
- Docker installed on the Ubuntu server (`sudo apt install docker.io`)

# Option 1: Direct Source Copy (Recommended for development)

1.  **Copy Files**
    Copy the `src/relay` folder to the server using `scp`:
    ```bash
    scp -r src/relay user@remote-ip:~/relay
    ```

2.  **Build Image on Server**
    SSH into the server and build:
    ```bash
    ssh user@remote-ip
    cd ~/relay
    sudo docker build -t attentive-relay .
    ```

3.  **Run Container**
    ```bash
    sudo docker run -d \
      --name active-relay \
      --restart always \
      -p 80:3000 \
      attentive-relay
    ```
    *Note: Mapping to port 80 allows plain HTTP access. Ensure firewall allows port 80.*

# Option 2: Pre-built Image Transfer (Slow upload)

1.  **Build Locally**
    ```bash
    cd src/relay
    docker build -t attentive-relay .
    ```

2.  **Save Image**
    ```bash
    docker save attentive-relay > relay-image.tar
    ```

3.  **Transfer Image**
    ```bash
    scp relay-image.tar user@remote-ip:~/
    ```

4.  **Load and Run on Server**
    ```bash
    ssh user@remote-ip
    sudo docker load < relay-image.tar
    sudo docker run -d --name active-relay --restart always -p 80:3000 attentive-relay
    ```

# Verification
1.  Check configs in `src/shared/config.ts` (or `config.json` locally).
2.  Set `relayUrl` to `http://<remote-ip>`.
3.  Restart Teacher/Student apps.
