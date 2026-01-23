# OpenChamber for Actions

**Version:**  `v0.1.0-preview`

OpenChamber for Actions allows you to run a full OpenChamber environment remotely using GitHub Actions infrastructure. It provides access to OpenCode, OpenChamber, and a web-based terminal without requiring any local hardware.

---

## Overview

OpenChamber for Actions is a "computer in the cloud" solution that leverages GitHub Runners to host a temporary development environment. It spins up three key services:
*   **OpenCode TTY:** A web-based terminal for command-line access.
*   **OpenChamber:** The core environment.
*   **OpenCode Web:** The web interface for coding and interaction.

These services are exposed via secure tunnels (Cloudflare or Ngrok), allowing you to access them from any browser. The session can persist data between runs using GitHub Artifacts.

---

## Key Features

*   **No local hardware required:** Run OpenChamber on GitHub Actions infrastructure.
*   **OpenCode integration:** Access the OpenCode suite and "Antigravity" model selection (including Gemini 3 and Claude 4.5).
*   **Secure access (optional):** Protect OpenChamber, OpenCode Web, and the TTY with `OPENCODE_SERVER_USERNAME` and `OPENCODE_SERVER_PASSWORD`.
*   **Hybrid Persistence:** Choose between **Cloudflare R2** (fast, scalable) or **GitHub Artifacts** (zero-config, slower).
*   **Self-healing tunnels:** Background monitoring keeps the tunnel stable.

---

## New to this? (Beginners' Guide)

<details>
<summary><b>Click to expand: What is this and how does it help me?</b></summary>

### 1. What exactly is this?
Think of this as a "computer in the cloud." Instead of running a local AI environment, GitHub Actions provides the compute for you.

### 2. What do I need to start?
*   A GitHub account.
*   A web browser (Chrome, Edge, Safari, etc.).
*   No special hardware required.

### 3. Why is Cloudflare recommended?
Cloudflare Quick Tunnels create a secure public URL automatically. You do not need extra accounts or API keys, so it is the simplest option.

### 4. What is persistence?
The system saves your work (login info, settings, files) so you can pick up where you left off. You can use "Easy Mode" (saves to GitHub) or "Pro Mode" (saves to Cloudflare R2 for speed).
</details>

---

<details>
<summary><b>Usage Limits & Quotas</b></summary>

To ensure stability and compliance with GitHub’s Terms of Service, be aware of the following limits:

| Limit Type | Constraint | Explanation |
| :--- | :--- | :--- |
| **Time Limit** | **6 Hours Max** | GitHub stops any job after 360 minutes. |
| **Storage** | **2GB** | Session artifacts cannot exceed 2GB per repository. |
| **Concurrency** | **1 Run Only** | Run a single OpenChamber instance at a time. |
| **Hardware** | **2-Core CPU** | Standard Linux runners (~7GB RAM). |

</details>

---

## Installation Guide

### Option A: Pro Mode (Cloudflare R2 - Recommended)
**Best for performance and large sessions.** Uses Cloudflare R2 to store your session data.

#### 1. Configure Secrets
Go to **Settings** -> **Secrets and variables** -> **Actions** and add the following secrets:

| Secret Name | Description |
| :--- | :--- |
| `OPENCODE_SERVER_PASSWORD` | **Required.** Protects your session and encrypts data. |
| `OPENCODE_SERVER_USERNAME` | (Optional) Custom username for TTY login (default: `user`). |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 Access Key ID. |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 Secret Access Key. |
| `R2_ENDPOINT` | Cloudflare R2 Endpoint URL (e.g., `https://<account>.r2.cloudflarestorage.com`). |
| `R2_BUCKET_NAME` | Name of the bucket to store session data. |
| `CF_ACCOUNT_ID` | (Optional) Cloudflare Account ID (useful for reference). |

#### 2. Run Workflow
1.  Go to the **Actions** tab.
2.  Select **OpenChamber for Actions**.
3.  Click **Run workflow**.
4.  **Persistence Mode:** Select `r2`.
5.  **Tunnel Provider:** Choose `cloudflare` or `ngrok`.

---

### Option B: Easy Mode (Artifacts)
**Zero configuration.** Uses GitHub Artifacts. Slower upload/download speeds.

1.  Go to **Settings** -> **Secrets and variables** -> **Actions**.
2.  Add `OPENCODE_SERVER_PASSWORD` (Required for persistence).
3.  Run the workflow and select **Persistence Mode:** `artifact`.

---

### Tunnel Configuration (Optional)

<details>
<summary><b>Click to expand: Using Ngrok instead of Cloudflare Tunnel</b></summary>

If you prefer using Ngrok for a static domain:

1.  Get your authtoken from [dashboard.ngrok.com](https://dashboard.ngrok.com).
2.  Add `NGROK_AUTH_TOKEN` to your Repository Secrets.
3.  When running the workflow, select `ngrok` as the Tunnel Provider.
</details>

> [!TIP]
> Keep the repository visibility `Private` or use `OPENCODE_SERVER_PASSWORD` in Github Actions Secrets. Otherwise, your privacy can be violated.

---

## Frequently Asked Questions (FAQ)

<details>
<summary><b>Q: Is this completely free?</b></summary>
GitHub provides 2,000 minutes for private repositories and unlimited minutes for public repositories. This workflow uses those minutes.
</details>

<details>
<summary><b>Q: Why did my session stop working after a few hours?</b></summary>
GitHub Actions has a 6-hour job limit. The environment shuts down automatically. If persistence is enabled, your session data is restored on the next run.
</details>

<details>
<summary><b>Q: Can I use this on my phone or tablet?</b></summary>
Yes. Once you have a public URL (Cloudflare or Ngrok), open it in any mobile browser.
</details>

<details>
<summary><b>Q: Is my data private?</b></summary>
If you fork this as a public repository, your code may be visible depending on how you save it. For maximum privacy, use a private fork. If you want persistence, set `OPENCODE_SERVER_PASSWORD` so the artifact is encrypted.
</details>

<details>
<summary><b>Q: I see a "Connection Refused" error. What do I do?</b></summary>
Wait about 30 seconds and refresh the page. If it persists, check the Monitor logs in the Actions run.
</details>

---

## Technical Specifications

| Feature | Detail |
| :--- | :--- |
| **Version** | `v0.1.0-preview` |
| **OS** | Ubuntu 22.04 LTS (GitHub Runner) |
| **Node Version** | v20.x |
| **Tunnel Protocols** | `cloudflared` (Argon) / `ngrok` (HTTP) |
| **Artifact Retention** | 90 Days (Default GitHub Policy) |

> [!NOTE]
> This project is for educational and development purposes. Do not use this workflow for mining crypto or other activities banned by the GitHub Acceptable Use Policy.
