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
*   **Secure access (optional):** Protect OpenChamber, OpenCode Web, and the TTY with `OPENCODE_SERVER_PASSWORD`.
*   **Persistent sessions (optional):** Save login state, OAuth tokens, and configuration as GitHub Artifacts when a password is set (encrypted).
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
When a password is set, the workflow saves your login info and settings as an encrypted GitHub Artifact. The next run restores the session so you can continue without logging in again.
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

### Option A: Easy Mode (Recommended)
Uses Cloudflare tunnels. No configuration required unless you want password protection.

1.  Fork this repository to your GitHub account.
2.  Open the Actions tab in your fork.
3.  Select the **OpenChamber for Actions** workflow.
4.  (Optional) **Set a Password (recommended):**
    *   Go to **Settings** -> **Secrets and variables** -> **Actions**.
    *   Click **New repository secret**.
    *   **Name:** `OPENCODE_SERVER_PASSWORD`
    *   **Secret:** Your desired password.
    *   *Note: If this secret is set, it protects OpenCode TTY, OpenChamber, and OpenCode Web. It also enables encrypted persistence.*
5.  Click **Run workflow**.
    *   **Tunnel Provider:** Choose `cloudflare` (default) or `ngrok`.
    *   **Auto-shutdown after (minutes):** Set the duration (default `300`).
6.  Wait about 30 seconds for setup to finish.
7.  Open the run, then open the `serve` job.
8.  Expand the **Monitor & Self-Heal** step to find the URLs and open them.

> [!TIP]
> Keep the repository visibility `Private` or use `OPENCODE_SERVER_PASSWORD` in Github Actions Secrets. Otherwise, your privacy can be violated.

---

### Option B: Pro Mode (Ngrok)

<details>
<summary><b>Click to expand: Step-by-step guide for setting up Ngrok</b></summary>

If you prefer using Ngrok for a static domain, follow these steps to set up your API key.

#### Step 1: Get your authtoken
1.  Log in or sign up at dashboard.ngrok.com.
2.  In the sidebar, click "Your Authtoken."
3.  Copy the token string (for example, `21xYz...`).

#### Step 2: Add the secret to GitHub
1.  Open your forked repository on GitHub.
2.  Open Settings.
3.  In the sidebar, open Secrets and variables and click Actions.
4.  Click New repository secret.
5.  **Name:** `NGROK_AUTH_TOKEN`.
6.  **Secret:** Paste the token.
7.  (Optional) Add `OPENCODE_SERVER_PASSWORD` to enable password protection for all services and encrypted persistence.
8.  Click Add secret.

#### Step 3: Run with Ngrok
1.  Go to the Actions tab.
2.  Select **OpenChamber for Actions**.
3.  Click **Run workflow**.
4.  Select `ngrok` as the Tunnel Provider.
5.  Find the URL in the "Monitor & Self-Heal" step.
</details>

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
